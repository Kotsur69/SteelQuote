// The agent loop with a scripted fake model (no network): tool execution, input validation,
// loop limits, and the guards on the final text (docs/ai-assistant-plan.md 3.4, 9.1, 9.2).

import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { MAX_STEPS, runAgent, type AgentEvent } from '@/lib/assistant/agentLoop';
import type { ChatSession, ModelTurn, SessionInput } from '@/lib/assistant/provider';
import { defineTool, type ToolRuntime } from '@/lib/assistant/tools/types';

const USAGE = { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };
const say = (text: string): ModelTurn => ({ text, toolCalls: [], stop: 'end', usage: USAGE });
const call = (name: string, input: unknown, id = 'c1'): ModelTurn => ({ text: '', toolCalls: [{ id, name, input }], stop: 'tools', usage: USAGE });

/** Replays a fixed list of model turns and records what the loop sent. */
function scripted(turns: ModelTurn[]): ChatSession & { sent: SessionInput[] } {
  const sent: SessionInput[] = [];
  let i = 0;
  return {
    sent,
    send: async (input, onText) => {
      sent.push(input);
      const turn = turns[Math.min(i++, turns.length - 1)];
      if (turn.text) onText?.(turn.text);
      return turn;
    },
  };
}

const runtime = { ctx: {}, today: '2026-11-09', lang: 'pl', db: {} } as unknown as ToolRuntime;

const countOffers = defineTool({
  name: 'count_offers',
  description: 'test tool',
  schema: z.object({ month: z.number().int().min(1).max(12) }).strict(),
  run: async ({ month }) => ({
    result: { status: 'ok', month, offers: 12, text: '12' },
    blocks: [{ type: 'footer', lines: ['Okres: 10.2026'] }],
  }),
});
const failing = defineTool({
  name: 'boom',
  description: 'always throws',
  schema: z.object({}).strict(),
  run: async () => {
    throw new Error('connection string postgres://secret');
  },
});
const tools = [countOffers, failing];

const run = (session: ChatSession, onEvent?: (e: AgentEvent) => void) =>
  runAgent({ session, tools, runtime, userText: 'Ile ofert w październiku?', onEvent });

describe('agent loop', () => {
  test('runs the tool and returns the answer with the server blocks', async () => {
    const session = scripted([call('count_offers', { month: 10 }), say('Wysłaliśmy 12 ofert.')]);
    const result = await run(session);
    expect(result).toMatchObject({ text: 'Wysłaliśmy 12 ofert.', outcome: 'answer', steps: 2 });
    expect(result.blocks).toEqual([{ type: 'footer', lines: ['Okres: 10.2026'] }]);
    expect(result.toolCalls).toMatchObject([{ name: 'count_offers', ok: true, status: 'ok' }]);
    expect(result.usage.inputTokens).toBe(20);
  });

  test('invalid tool input is rejected before the tool runs', async () => {
    const session = scripted([call('count_offers', { month: 13, sql: 'drop' }), say('Nie udało się.')]);
    const result = await run(session);
    expect(result.toolCalls[0]).toMatchObject({ ok: false });
    const reply = session.sent[1] as { toolResults: { content: string; isError?: boolean }[] };
    expect(reply.toolResults[0].isError).toBe(true);
    expect(reply.toolResults[0].content).toContain('Invalid input');
  });

  test('an unknown tool and a throwing tool become error results without leaking details', async () => {
    const session = scripted([call('delete_everything', {}), call('boom', {}, 'c2'), say('Nie udało się wczytać danych.')]);
    const result = await run(session);
    expect(result.toolCalls.map((c) => c.ok)).toEqual([false, false]);
    expect(JSON.stringify(session.sent)).not.toContain('postgres://');
  });

  test('a number that is not in the tool results triggers one retry, then passes', async () => {
    const session = scripted([call('count_offers', { month: 10 }), say('Wysłaliśmy 13 ofert.'), say('Wysłaliśmy 12 ofert.')]);
    const events: AgentEvent[] = [];
    const result = await run(session, (e) => events.push(e));
    expect(result).toMatchObject({ text: 'Wysłaliśmy 12 ofert.', outcome: 'answer', guardViolations: ['13'] });
    expect((session.sent[2] as { userText: string }).userText).toContain('13');
    expect(events.some((e) => e.type === 'reset')).toBe(true);
  });

  test('a second violation falls back to the neutral sentence, keeping the server blocks', async () => {
    const session = scripted([call('count_offers', { month: 10 }), say('Wysłaliśmy 13 ofert.'), say('To 14 ofert.')]);
    const result = await run(session);
    expect(result.outcome).toBe('guard_fallback');
    expect(result.text).not.toMatch(/\d/);
    expect(result.blocks).toHaveLength(1);
  });

  test('numbers the user typed may be repeated', async () => {
    const session = scripted([say('Pytasz o październik.')]);
    const result = await runAgent({ session, tools, runtime, userText: 'transport 42 t', allowedText: '' });
    expect(result.outcome).toBe('answer');
    const echo = await runAgent({ session: scripted([say('Dla 42 t potrzebuję adresu.')]), tools, runtime, userText: 'transport 42 t' });
    expect(echo.outcome).toBe('answer');
  });

  test('images and external links are stripped from the answer', async () => {
    const session = scripted([say('Gotowe ![x](https://evil.example/?q=offers) [tu](https://evil.example)')]);
    const result = await run(session);
    expect(result.text).toBe('Gotowe  tu');
  });

  test('the step limit stops a model that keeps calling tools', async () => {
    const turns = Array.from({ length: MAX_STEPS + 3 }, (_, i) => call('count_offers', { month: (i % 12) + 1 }, `c${i}`));
    const result = await run(scripted(turns));
    expect(result.outcome).toBe('step_limit');
    expect(result.steps).toBe(MAX_STEPS);
  });

  test('the same call is not executed more than three times', async () => {
    const turns = [...Array.from({ length: 5 }, (_, i) => call('count_offers', { month: 10 }, `c${i}`)), say('12 ofert.')];
    const result = await run(scripted(turns));
    expect(result.toolCalls.map((c) => c.ok)).toEqual([true, true, true, false, false]);
  });

  test('a refusal yields the fixed refusal text and runs no tools', async () => {
    const refusal: ModelTurn = { text: 'partial', toolCalls: [], stop: 'refusal', usage: USAGE };
    const result = await run(scripted([refusal]));
    expect(result.outcome).toBe('refusal');
    expect(result.text).toContain('Nie mogę pomóc');
    expect(result.toolCalls).toEqual([]);
  });

  test('a pending clarification replaces other blocks', async () => {
    const ask = defineTool({
      name: 'ask',
      description: 'returns buttons',
      schema: z.object({}).strict(),
      run: async () => ({ result: { status: 'ambiguous' }, blocks: [{ type: 'clarify', options: [{ label: 'A', value: 'A' }] }] }),
    });
    const session = scripted([call('count_offers', { month: 10 }), call('ask', {}, 'c2'), say('O którą osobę chodzi?')]);
    const result = await runAgent({ session, tools: [countOffers, ask], runtime, userText: 'x' });
    expect(result.blocks).toEqual([{ type: 'clarify', options: [{ label: 'A', value: 'A' }] }]);
  });
});
