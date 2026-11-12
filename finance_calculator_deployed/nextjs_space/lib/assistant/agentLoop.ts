// The agent loop: model -> tool calls -> tool results -> ... -> final text, with the limits and
// guards of docs/ai-assistant-plan.md (9.2 loops, 3.4 number guard, 9.1 link guard).
//
// Pure orchestration: the model sits behind ChatSession and the tools behind AssistantTool, so
// the whole loop is testable with a scripted fake model and no network.

import type { AnswerBlock } from './blocks';
import type { Lang } from './format';
import { sanitizeLinks } from './guards/linkGuard';
import { checkNumbers, collectAllowed } from './guards/numberGuard';
import { addUsage, ZERO_USAGE, type ChatSession, type ModelTurn, type ProviderUsage, type ToolResult } from './provider';
import type { AssistantTool, ToolRuntime } from './tools/types';

export const MAX_STEPS = 8;
const MAX_IDENTICAL_CALLS = 3;
const TOOL_TIMEOUT_MS = 8_000;

export type AgentEvent =
  | { type: 'text'; delta: string }
  /** A tool started - lets the panel show "sprawdzam dane...". */
  | { type: 'tool'; name: string }
  /** Discard the text streamed so far (the model is about to call tools or was corrected). */
  | { type: 'reset' };

export interface ToolCallLog {
  name: string;
  ok: boolean;
  status?: string;
  ms: number;
}

export type AgentOutcome = 'answer' | 'guard_fallback' | 'refusal' | 'step_limit' | 'truncated';

export interface AgentResult {
  text: string;
  blocks: AnswerBlock[];
  outcome: AgentOutcome;
  steps: number;
  toolCalls: ToolCallLog[];
  usage: ProviderUsage;
  /** Numbers the guard rejected (first attempt), for the log. */
  guardViolations: string[];
}

export interface PinnedCall {
  name: string;
  input: unknown;
}

export interface AgentInput {
  session: ChatSession;
  tools: readonly AssistantTool[];
  runtime: ToolRuntime;
  userText: string;
  /** Extra text whose numbers the answer may quote (the knowledge base). */
  allowedText?: string;
  /**
   * A tool call the server already decided on - a clicked follow-up chip or clarification
   * button (signed, lib/assistant/tokens.ts). It runs before the model is asked, and the model
   * writes the answer from its result instead of re-typing the parameters.
   */
  pinned?: PinnedCall;
  onEvent?: (event: AgentEvent) => void;
}

const MESSAGES: Record<Lang, Record<'refusal' | 'step_limit' | 'truncated' | 'guard_fallback' | 'empty', string>> = {
  pl: {
    refusal: 'Nie mogę pomóc w tej sprawie. Mogę odpowiadać na pytania o aplikację, oferty i liczby z danych ofert.',
    step_limit: 'To pytanie wymaga zbyt wielu kroków. Spróbuj je zawęzić albo podzielić na dwa.',
    truncated: 'Odpowiedź została przerwana. Spróbuj zadać krótsze pytanie.',
    guard_fallback: 'Poniżej dane z aplikacji dla Twojego pytania.',
    empty: 'Nie udało mi się przygotować odpowiedzi. Spróbuj zadać pytanie inaczej.',
  },
  en: {
    refusal: 'I cannot help with that. I can answer questions about the app, offers and figures from offer data.',
    step_limit: 'This question needs too many steps. Try narrowing it or splitting it in two.',
    truncated: 'The answer was cut off. Try a shorter question.',
    guard_fallback: 'Below is the data from the app for your question.',
    empty: 'I could not prepare an answer. Try asking differently.',
  },
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('Tool timed out')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

interface Executed {
  result: ToolResult;
  log: ToolCallLog;
  blocks: AnswerBlock[];
  /** Parsed tool result, kept for the number guard. */
  data: unknown;
}

async function executeTool(
  call: ModelTurn['toolCalls'][number],
  tools: readonly AssistantTool[],
  runtime: ToolRuntime,
  seen: Map<string, number>
): Promise<Executed> {
  const started = Date.now();
  const fail = (message: string): Executed => ({
    result: { id: call.id, content: JSON.stringify({ status: 'error', message }), isError: true },
    log: { name: call.name, ok: false, status: 'error', ms: Date.now() - started },
    blocks: [],
    data: null,
  });

  const tool = tools.find((t) => t.name === call.name);
  if (!tool) return fail(`Unknown tool "${call.name}".`);

  const key = `${call.name}:${JSON.stringify(call.input)}`;
  const count = (seen.get(key) ?? 0) + 1;
  seen.set(key, count);
  if (count > MAX_IDENTICAL_CALLS) return fail('This exact call was already made several times. Use the earlier result or answer the user.');

  // The model's input is untrusted: validate against the tool's schema before anything runs.
  const parsed = tool.schema.safeParse(call.input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return fail(`Invalid input - ${issues}`);
  }

  try {
    const output = await withTimeout(tool.run(parsed.data, runtime), TOOL_TIMEOUT_MS);
    const status = typeof output.result.status === 'string' ? output.result.status : undefined;
    return {
      result: { id: call.id, content: JSON.stringify(output.result) },
      log: { name: call.name, ok: true, status, ms: Date.now() - started },
      blocks: output.blocks ?? [],
      data: output.result,
    };
  } catch (error) {
    // Details stay in the server log; the model only learns that the tool failed.
    console.error(`[assistant] tool ${call.name} failed:`, error);
    return fail('The tool failed. Tell the user the data could not be loaded; do not guess.');
  }
}

/**
 * What the panel shows: a pending question replaces everything; otherwise one footer and one set
 * of follow-up chips - the last ones, which belong to the figures the answer ends on.
 */
function selectBlocks(perStep: AnswerBlock[][]): AnswerBlock[] {
  const last = perStep[perStep.length - 1] ?? [];
  const clarify = last.filter((b) => b.type === 'clarify');
  if (clarify.length > 0) return clarify.slice(-1);

  const all = perStep.flat().filter((b) => b.type !== 'clarify');
  const types = all.map((b) => b.type);
  const lastFooter = types.lastIndexOf('footer');
  const lastFollowUps = types.lastIndexOf('followups');
  return all.filter((b, i) => (b.type !== 'footer' || i === lastFooter) && (b.type !== 'followups' || i === lastFollowUps));
}

/**
 * The user's turn after a button click: what they clicked plus the result the server already ran.
 * The result is JSON holding user-entered names, so "<" is escaped (still valid JSON) and nothing
 * inside can close the data fence.
 */
function pinnedTurn(userText: string, call: PinnedCall, content: string): string {
  const fenced = content.replace(/</g, '\u003c');
  return (
    `${userText}\n\n[The user clicked a button in the app. The app already ran ${call.name} with input ${JSON.stringify(call.input)}; ` +
    'the result is below. Answer from it; call another tool only if the question needs more.]\n' +
    `<tool_data name="${call.name}" untrusted="true">\n${fenced}\n</tool_data>`
  );
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const { session, tools, runtime, onEvent } = input;
  const lang = runtime.lang;
  const seen = new Map<string, number>();
  const toolCalls: ToolCallLog[] = [];
  const toolData: unknown[] = [];
  const blocksPerStep: AnswerBlock[][] = [];
  let usage = ZERO_USAGE;
  let steps = 0;

  const emitText = (delta: string) => onEvent?.({ type: 'text', delta });
  const done = (text: string, outcome: AgentOutcome, guardViolations: string[] = []): AgentResult => ({
    text, blocks: selectBlocks(blocksPerStep), outcome, steps, toolCalls, usage, guardViolations,
  });
  const replaceWith = (text: string): string => {
    onEvent?.({ type: 'reset' });
    emitText(text);
    return text;
  };

  let userText = input.userText;
  if (input.pinned) {
    onEvent?.({ type: 'tool', name: input.pinned.name });
    const executed = await executeTool({ id: 'pinned', ...input.pinned }, tools, runtime, seen);
    toolCalls.push(executed.log);
    toolData.push(executed.data);
    blocksPerStep.push(executed.blocks);
    userText = pinnedTurn(input.userText, input.pinned, executed.result.content);
  }

  let turn = await session.send({ userText }, emitText);
  usage = addUsage(usage, turn.usage);
  steps++;

  while (turn.stop === 'tools') {
    if (steps >= MAX_STEPS) return done(replaceWith(MESSAGES[lang].step_limit), 'step_limit');
    // Anything said before a tool call is a progress note, not the answer.
    if (turn.text) onEvent?.({ type: 'reset' });

    for (const call of turn.toolCalls) onEvent?.({ type: 'tool', name: call.name });
    const executed = await Promise.all(turn.toolCalls.map((call) => executeTool(call, tools, runtime, seen)));
    toolCalls.push(...executed.map((e) => e.log));
    toolData.push(...executed.map((e) => e.data));
    blocksPerStep.push(executed.flatMap((e) => e.blocks));

    turn = await session.send({ toolResults: executed.map((e) => e.result) }, emitText);
    usage = addUsage(usage, turn.usage);
    steps++;
  }

  if (turn.stop === 'refusal') return done(replaceWith(MESSAGES[lang].refusal), 'refusal');
  if (turn.stop === 'max_tokens') return done(replaceWith(MESSAGES[lang].truncated), 'truncated');

  // --- guards on the final text ---------------------------------------------------------
  const allowed = collectAllowed([toolData, input.userText, input.allowedText ?? '', runtime.today]);
  const clean = (raw: string) => sanitizeLinks(raw).text.trim();

  let text = clean(turn.text);
  let verdict = checkNumbers(text, allowed);
  const firstViolations = verdict.violations;

  if (!verdict.ok) {
    // One retry with the violation spelled out (plan rule 3.4).
    onEvent?.({ type: 'reset' });
    const correction =
      `Your answer contained numbers that are not in the tool results: ${verdict.violations.join(', ')}. ` +
      'Rewrite the answer using only numbers copied exactly from the tool results. Do not calculate anything. ' +
      'If the user needs a figure you do not have, call the right tool or say it is not available.';
    turn = await session.send({ userText: correction }, emitText);
    usage = addUsage(usage, turn.usage);
    steps++;
    // The retry may not start another tool round - the answer must stand on the data already loaded.
    text = turn.stop === 'end' ? clean(turn.text) : '';
    verdict = text ? checkNumbers(text, allowed) : { ok: false, violations: [] };
    if (!verdict.ok) return done(replaceWith(MESSAGES[lang].guard_fallback), 'guard_fallback', firstViolations);
  }

  if (!text) return done(replaceWith(MESSAGES[lang].empty), 'truncated', firstViolations);
  // The streamed text may differ from the cleaned one (a removed link): send the final version.
  if (text !== turn.text) replaceWith(text);
  return done(text, 'answer', firstViolations);
}
