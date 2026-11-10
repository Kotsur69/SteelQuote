// Anthropic implementation of ChatProvider: Claude Sonnet 5.5 (plan D2), streaming, prompt
// caching on the stable prefix (tools + rules + knowledge base), typed error mapping.
//
// Server-only: reads ANTHROPIC_API_KEY. Never import from a client component.

import Anthropic from '@anthropic-ai/sdk';
import {
  ProviderBusyError,
  ProviderUnavailableError,
  type ChatProvider,
  type ChatSession,
  type ModelTurn,
  type ProviderUsage,
  type SessionInput,
  type SessionOptions,
  type TurnStop,
} from './provider';


const DEFAULT_MODEL = 'claude-sonnet-5-5';
// Thinking tokens count towards this cap, so it is well above the length of a chat answer.
const MAX_TOKENS = 8000;
// A safety classifier can decline a request; with this beta the API answers from a fallback
// model instead of returning a bare refusal. A refusal of the whole chain still reaches the loop.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const REQUEST_TIMEOUT_MS = 40_000;

// USD per million tokens, Claude Sonnet 5.5 list prices. A fallback answer may be billed at
// another model's rate; the budget treats this as an estimate, the console is authoritative.
const PRICE = { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 };

function toUsage(usage: Anthropic.Beta.BetaUsage): ProviderUsage {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

function toStop(reason: Anthropic.Beta.BetaMessage['stop_reason']): TurnStop {
  if (reason === 'tool_use') return 'tools';
  if (reason === 'refusal') return 'refusal';
  if (reason === 'max_tokens') return 'max_tokens';
  return 'end';
}

function mapError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderUnavailableError('The AI provider rejected the credentials.');
  }
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
    return new ProviderBusyError('The AI provider is busy.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new ProviderBusyError('The AI provider could not be reached.');
  }
  return error instanceof Error ? error : new Error(String(error));
}

class AnthropicSession implements ChatSession {
  private readonly messages: Anthropic.Beta.BetaMessageParam[];
  private readonly tools: Anthropic.Beta.BetaTool[];
  private readonly system: Anthropic.Beta.BetaTextBlockParam[];

  constructor(
    private readonly client: Anthropic,
    private readonly model: string,
    private readonly options: SessionOptions
  ) {
    this.messages = options.history.map((turn) => ({ role: turn.role, content: turn.text }));
    this.tools = options.tools.map((tool, index) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Beta.BetaTool['input_schema'],
      // Render order is tools -> system -> messages: a breakpoint on the last tool caches the
      // whole tool list, the one on the stable system block caches rules + knowledge.
      ...(index === options.tools.length - 1 ? { cache_control: { type: 'ephemeral' as const } } : {}),
    }));
    this.system = [
      { type: 'text', text: options.stableSystem, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: options.dynamicSystem },
    ];
  }

  async send(input: SessionInput, onText?: (delta: string) => void): Promise<ModelTurn> {
    if ('userText' in input) {
      this.messages.push({ role: 'user', content: input.userText });
    } else {
      // Every result of a turn goes back in ONE user message.
      this.messages.push({
        role: 'user',
        content: input.toolResults.map((r) => ({
          type: 'tool_result' as const,
          tool_use_id: r.id,
          content: r.content,
          ...(r.isError ? { is_error: true } : {}),
        })),
      });
    }

    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: MAX_TOKENS,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: 'medium' },
          system: this.system,
          tools: this.tools,
          messages: this.messages,
        },
        { signal: this.options.signal, timeout: REQUEST_TIMEOUT_MS }
      );
      if (onText) stream.on('text', onText);
      message = await stream.finalMessage();
    } catch (error) {
      throw mapError(error);
    }

    // The assistant turn goes back unchanged (thinking blocks included) on the next request.
    this.messages.push({ role: 'assistant', content: message.content as Anthropic.Beta.BetaContentBlockParam[] });

    const stop = toStop(message.stop_reason);
    return {
      text: message.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join(''),
      // A refusal or a cut-off can leave a half-written tool call behind - never run those.
      toolCalls: stop === 'tools'
        ? message.content
            .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
            .map((b) => ({ id: b.id, name: b.name, input: b.input }))
        : [],
      stop,
      usage: toUsage(message.usage),
    };
  }
}

export function createAnthropicProvider(): ChatProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new ProviderUnavailableError('ANTHROPIC_API_KEY is not configured.');
  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  return {
    model,
    startSession: (options) => new AnthropicSession(client, model, options),
    costUsd: (u) =>
      (u.inputTokens * PRICE.input + u.outputTokens * PRICE.output + u.cacheReadTokens * PRICE.cacheRead + u.cacheWriteTokens * PRICE.cacheWrite) / 1_000_000,
  };
}
