// One chat request, end to end (docs/ai-assistant-plan.md section 5): input guard -> gate
// (switches, limits, budget) -> answer cache -> agent loop -> log. Emits events for the SSE
// stream; the route handler only authenticates and wires the stream.
//
// Stateless (plan D9): the browser sends the text turns of the current chat with every request.
// Tool results are never accepted from the client - the server re-runs tools when needed.

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import pool from '../db';
import type { AccessContext } from '../access/types';
import { fetchToday } from '../analyticsQuery';
import { isIsoDate } from '../analytics';
import { runAgent, type AgentOutcome } from './agentLoop';
import type { AnswerBlock } from './blocks';
import { checkGate, denialText, logTurn } from './budget';
import { cacheKey, readCache, writeCache } from './cache';
import type { Lang } from './format';
import { checkInput, MAX_MESSAGE_CHARS } from './guards/input';
import { ProviderBusyError, ProviderUnavailableError, ZERO_USAGE, type ChatProvider, type ProviderTool } from './provider';
import { PROMPT_VERSION, dynamicSystemPrompt, stableSystemPrompt } from './systemPrompt';
import { TOOLS } from './tools';

export const MAX_HISTORY_TURNS = 30;
const MAX_ASSISTANT_TURN_CHARS = 6000;

export const chatRequestSchema = z
  .object({
    message: z.string(),
    history: z
      .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(MAX_ASSISTANT_TURN_CHARS) }).strict())
      .max(MAX_HISTORY_TURNS)
      .default([]),
    lang: z.enum(['pl', 'en']).default('pl'),
    page: z
      .object({ path: z.string().max(200).regex(/^\/[\w\-/]*$/), offerId: z.number().int().positive().optional() })
      .strict()
      .optional(),
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'reset' }
  | { type: 'tool'; name: string }
  | { type: 'final'; text: string; blocks: AnswerBlock[]; turnId: number | null; cached: boolean }
  | { type: 'error'; message: string };

const ERRORS: Record<Lang, Record<'empty' | 'too_long' | 'too_many_turns' | 'unavailable' | 'busy' | 'failed', string>> = {
  pl: {
    empty: 'Wpisz pytanie.',
    too_long: `Pytanie jest za długie (maks. ${MAX_MESSAGE_CHARS} znaków).`,
    too_many_turns: 'Ten czat jest już długi. Zacznij nowy czat.',
    unavailable: 'Asystent nie jest jeszcze podłączony do modelu AI (brak klucza API).',
    busy: 'Model AI jest teraz zajęty. Spróbuj ponownie za chwilę.',
    failed: 'Coś poszło nie tak. Spróbuj ponownie.',
  },
  en: {
    empty: 'Type a question.',
    too_long: `The question is too long (max ${MAX_MESSAGE_CHARS} characters).`,
    too_many_turns: 'This chat is already long. Start a new chat.',
    unavailable: 'The assistant is not connected to an AI model yet (API key missing).',
    busy: 'The AI model is busy right now. Try again in a moment.',
    failed: 'Something went wrong. Try again.',
  },
};

let providerTools: ProviderTool[] | null = null;

/** JSON Schemas of the tools, built once: the tool list must be byte-stable for prompt caching. */
export function toolDefinitions(): ProviderTool[] {
  if (!providerTools) {
    providerTools = TOOLS.map((tool) => {
      const { $schema: _schema, ...inputSchema } = zodToJsonSchema(tool.schema, { $refStrategy: 'none' }) as Record<string, unknown>;
      return { name: tool.name, description: tool.description, inputSchema };
    });
  }
  return providerTools;
}

/**
 * "Today" for period presets: the database clock, like /analytics. The demo may pin it
 * (AI_FIXED_TODAY) so the golden set's relative periods resolve the same on any day - never
 * honoured outside demo mode.
 */
async function resolveToday(): Promise<string> {
  const fixed = process.env.AI_FIXED_TODAY;
  if (process.env.AI_DATA_MODE === 'demo' && isIsoDate(fixed)) return fixed;
  return fetchToday(pool);
}

/** Only complete, read-only answers are cached - never questions back to the user or fallbacks. */
function isCacheable(outcome: AgentOutcome, blocks: AnswerBlock[]): boolean {
  return outcome === 'answer' && !blocks.some((b) => b.type === 'clarify');
}

export interface ChatDeps {
  /** Injected so the eval and the tests can run without the network. */
  createProvider: () => ChatProvider;
  signal?: AbortSignal;
}

export async function handleChat(
  ctx: AccessContext,
  request: ChatRequest,
  emit: (event: ChatEvent) => void,
  deps: ChatDeps
): Promise<void> {
  const lang = request.lang;
  const started = Date.now();
  const fail = (key: keyof (typeof ERRORS)['pl']) => emit({ type: 'error', message: ERRORS[lang][key] });

  const input = checkInput(request.message);
  if (!input.ok) return fail(input.reason);
  if (request.history.length >= MAX_HISTORY_TURNS) return fail('too_many_turns');

  const gate = await checkGate(ctx, pool);
  if (!gate.ok) return emit({ type: 'error', message: denialText(gate.reason, lang) });

  let provider: ChatProvider;
  try {
    provider = deps.createProvider();
  } catch (error) {
    if (error instanceof ProviderUnavailableError) return fail('unavailable');
    throw error;
  }

  const today = await resolveToday();
  const base = { userId: ctx.userId, model: provider.model, lang, injectionFlag: input.injectionSuspected };

  // Only the first turn of a chat is cacheable: later ones depend on the conversation.
  const key = request.history.length === 0
    ? cacheKey({
        ctx, question: input.text, lang, today, dataVersion: gate.dataVersion, promptVersion: PROMPT_VERSION,
        model: provider.model, page: request.page ? `${request.page.path}#${request.page.offerId ?? ''}` : '',
      })
    : null;

  if (key) {
    const hit = await readCache(key, ctx.userId, pool);
    if (hit) {
      const turnId = await logTurn(
        { ...base, outcome: 'answer', cacheHit: true, steps: 0, toolCalls: [], guardViolations: 0, usage: ZERO_USAGE, costUsd: 0, durationMs: Date.now() - started },
        pool
      );
      return emit({ type: 'final', text: hit.text, blocks: hit.blocks, turnId, cached: true });
    }
  }

  try {
    const stable = stableSystemPrompt();
    const session = provider.startSession({
      stableSystem: stable,
      dynamicSystem: dynamicSystemPrompt(ctx, today, lang, request.page),
      tools: toolDefinitions(),
      history: request.history,
      signal: deps.signal,
    });
    const result = await runAgent({
      session,
      tools: TOOLS,
      runtime: { ctx, today, lang, db: pool },
      userText: input.text,
      allowedText: stable,
      onEvent: emit,
    });

    const turnId = await logTurn(
      {
        ...base, outcome: result.outcome, cacheHit: false, steps: result.steps, toolCalls: result.toolCalls,
        guardViolations: result.guardViolations.length, usage: result.usage, costUsd: provider.costUsd(result.usage),
        durationMs: Date.now() - started,
      },
      pool
    );
    if (key && isCacheable(result.outcome, result.blocks)) {
      await writeCache(key, ctx.userId, { text: result.text, blocks: result.blocks }, pool);
    }
    emit({ type: 'final', text: result.text, blocks: result.blocks, turnId, cached: false });
  } catch (error) {
    await logTurn(
      { ...base, outcome: 'error', cacheHit: false, steps: 0, toolCalls: [], guardViolations: 0, usage: ZERO_USAGE, costUsd: 0, durationMs: Date.now() - started },
      pool
    );
    if (error instanceof ProviderUnavailableError) return fail('unavailable');
    if (error instanceof ProviderBusyError) return fail('busy');
    // Details go to the server log only - never to the browser.
    console.error('[assistant] chat failed:', error);
    fail('failed');
  }
}
