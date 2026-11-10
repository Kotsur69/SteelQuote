// Who may use the assistant right now, and the usage log behind that decision
// (docs/ai-assistant-plan.md 9.3): env switch, admin kill switch, per-user switch, per-minute and
// per-day limits, hard monthly budget. Everything is derived from ai_turns - metadata only, no
// chat text (plan D11).

import type { Db } from '../access/config';
import type { AccessContext } from '../access/types';
import type { AgentOutcome, ToolCallLog } from './agentLoop';
import type { Lang } from './format';
import type { ProviderUsage } from './provider';

const PER_MINUTE_LIMIT = 10;

export type GateDenial =
  | 'disabled' // env switch or admin kill switch
  | 'not_configured' // migration 037 not applied
  | 'user_disabled'
  | 'rate_limited'
  | 'daily_limit'
  | 'budget_exhausted';

export type Gate = { ok: true; dataVersion: number } | { ok: false; reason: GateDenial };

/** 42P01 undefined_table / 42703 undefined_column: the code is deployed, migration 037 is not. */
const isMissingSchema = (error: unknown): boolean => {
  const code = (error as { code?: string })?.code;
  return code === '42P01' || code === '42703';
};

function envBudgetUsd(): number | null {
  const raw = Number.parseFloat(process.env.AI_MONTHLY_BUDGET_USD ?? '');
  return Number.isFinite(raw) && raw >= 0 ? raw : null;
}

export async function checkGate(ctx: AccessContext, db: Db): Promise<Gate> {
  if (process.env.AI_ASSISTANT_ENABLED !== 'true') return { ok: false, reason: 'disabled' };

  try {
    const result = await db.query(
      `SELECT s.ai_enabled, s.ai_monthly_budget_usd, s.ai_user_daily_limit,
              (SELECT data_version FROM ai_state WHERE id = 1) AS data_version,
              (SELECT ai_assistant_enabled FROM users WHERE id = $1) AS user_enabled,
              (SELECT COALESCE(SUM(cost_usd), 0) FROM ai_turns
                WHERE created_at >= date_trunc('month', CURRENT_TIMESTAMP)) AS month_cost,
              (SELECT COUNT(*) FROM ai_turns
                WHERE user_id = $1 AND created_at >= CURRENT_DATE) AS today_count,
              (SELECT COUNT(*) FROM ai_turns
                WHERE user_id = $1 AND created_at >= CURRENT_TIMESTAMP - interval '1 minute') AS minute_count
       FROM app_settings s WHERE s.id = 1`,
      [ctx.userId]
    );
    const row = result.rows[0];
    if (!row || row.data_version === null) return { ok: false, reason: 'not_configured' };
    if (row.ai_enabled !== true) return { ok: false, reason: 'disabled' };
    if (row.user_enabled !== true) return { ok: false, reason: 'user_disabled' };

    // The stricter of the admin setting and the deployment's env cap wins.
    const budget = Math.min(Number(row.ai_monthly_budget_usd), envBudgetUsd() ?? Number.POSITIVE_INFINITY);
    if (Number(row.month_cost) >= budget) return { ok: false, reason: 'budget_exhausted' };
    if (Number(row.minute_count) >= PER_MINUTE_LIMIT) return { ok: false, reason: 'rate_limited' };
    if (Number(row.today_count) >= Number(row.ai_user_daily_limit)) return { ok: false, reason: 'daily_limit' };

    return { ok: true, dataVersion: Number(row.data_version) };
  } catch (error) {
    if (isMissingSchema(error)) return { ok: false, reason: 'not_configured' };
    throw error;
  }
}

const DENIAL_TEXT: Record<Lang, Record<GateDenial, string>> = {
  pl: {
    disabled: 'Asystent jest wyłączony.',
    not_configured: 'Asystent nie jest jeszcze skonfigurowany (brak migracji 037).',
    user_disabled: 'Asystent jest wyłączony dla Twojego konta. Skontaktuj się z administratorem.',
    rate_limited: 'Za dużo pytań w krótkim czasie. Spróbuj ponownie za minutę.',
    daily_limit: 'Wykorzystano dzienny limit pytań. Limit odnowi się jutro.',
    budget_exhausted: 'Asystent jest wstrzymany - wykorzystano miesięczny budżet.',
  },
  en: {
    disabled: 'The assistant is switched off.',
    not_configured: 'The assistant is not configured yet (migration 037 is missing).',
    user_disabled: 'The assistant is switched off for your account. Contact the administrator.',
    rate_limited: 'Too many questions in a short time. Try again in a minute.',
    daily_limit: 'The daily question limit is used up. It resets tomorrow.',
    budget_exhausted: 'The assistant is paused - the monthly budget is used up.',
  },
};

export const denialText = (reason: GateDenial, lang: Lang): string => DENIAL_TEXT[lang][reason];

export interface TurnLog {
  userId: number;
  model: string;
  lang: Lang;
  outcome: AgentOutcome | 'error';
  cacheHit: boolean;
  steps: number;
  toolCalls: ToolCallLog[];
  guardViolations: number;
  injectionFlag: boolean;
  usage: ProviderUsage;
  costUsd: number;
  durationMs: number;
}

/** Returns the turn id (the handle feedback refers to), or null when logging itself failed. */
export async function logTurn(log: TurnLog, db: Db): Promise<number | null> {
  try {
    const result = await db.query(
      `INSERT INTO ai_turns (user_id, model, lang, outcome, cache_hit, steps, tool_calls, guard_violations,
                             injection_flag, input_tokens, output_tokens, cache_read_tokens,
                             cache_write_tokens, cost_usd, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id`,
      [
        log.userId, log.model, log.lang, log.outcome, log.cacheHit, log.steps, JSON.stringify(log.toolCalls),
        log.guardViolations, log.injectionFlag, log.usage.inputTokens, log.usage.outputTokens,
        log.usage.cacheReadTokens, log.usage.cacheWriteTokens, log.costUsd, log.durationMs,
      ]
    );
    return Number(result.rows[0].id);
  } catch (error) {
    // The answer already exists; losing one log row must not turn it into an error for the user.
    console.error('[assistant] could not log the turn:', error);
    return null;
  }
}
