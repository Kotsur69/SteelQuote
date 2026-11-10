// Provider-neutral contract between the agent loop and a model API (plan D2: Claude Sonnet 5.5
// today, adapter kept so a go-live decision - e.g. Claude on Microsoft Foundry - is a new file,
// not a rewrite). The loop never sees provider-native message shapes: a session keeps those
// internally and exposes only "say this / here are the tool results -> what did the model do".

export interface ProviderTool {
  name: string;
  description: string;
  /** JSON Schema of the input object. */
  inputSchema: Record<string, unknown>;
}

export interface ProviderUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface ToolResult {
  id: string;
  /** JSON text the model reads. */
  content: string;
  isError?: boolean;
}

export type TurnStop = 'end' | 'tools' | 'refusal' | 'max_tokens';

export interface ModelTurn {
  text: string;
  toolCalls: ToolCall[];
  stop: TurnStop;
  usage: ProviderUsage;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface SessionOptions {
  /** Identical for every request: rules + knowledge base. Cached by the provider. */
  stableSystem: string;
  /** Per-request context (who asks, today, page). Kept after the cache breakpoint. */
  dynamicSystem: string;
  tools: readonly ProviderTool[];
  /** Earlier turns of this chat, text only (the browser never supplies tool results). */
  history: readonly HistoryTurn[];
  signal?: AbortSignal;
}

export type SessionInput = { userText: string } | { toolResults: ToolResult[] };

export interface ChatSession {
  /** One model call. `onText` receives the visible text as it streams. */
  send(input: SessionInput, onText?: (delta: string) => void): Promise<ModelTurn>;
}

export interface ChatProvider {
  readonly model: string;
  startSession(options: SessionOptions): ChatSession;
  /** USD cost of a usage record at this provider's list prices. */
  costUsd(usage: ProviderUsage): number;
}

export const ZERO_USAGE: ProviderUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export function addUsage(a: ProviderUsage, b: ProviderUsage): ProviderUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}

/** The provider is not usable (missing key, disabled). Surfaces as a clear message, not a 500. */
export class ProviderUnavailableError extends Error {}
/** Rate limited or overloaded after the SDK's own retries. */
export class ProviderBusyError extends Error {}
