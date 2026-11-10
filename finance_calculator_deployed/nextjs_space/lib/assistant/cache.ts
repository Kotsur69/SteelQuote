// Data-versioned answer cache (docs/ai-assistant-plan.md section 8): a repeated question is
// answered instantly and for free, and never stale - the key contains ai_state.data_version,
// which every write to a table an answer can depend on bumps (migration 037).
//
// Exact match only, after light normalisation. "Similar question" matching would need embeddings
// and can return the answer to a DIFFERENT question, which the accuracy contract forbids.

import { createHash } from 'node:crypto';
import type { Db } from '../access/config';
import type { AccessContext } from '../access/types';
import type { AnswerBlock } from './blocks';
import type { Lang } from './format';
import { foldDiacritics } from './polish';

const CLEANUP_AFTER = '24 hours';

export interface CachedAnswer {
  text: string;
  blocks: AnswerBlock[];
}

/** "Ile ofert wysłał Marek?" and "ile ofert wyslal marek" are the same question. */
export function normalizeQuestion(question: string): string {
  return foldDiacritics(question).replace(/\s+/g, ' ').trim().replace(/[?!.\s]+$/, '');
}

/** Everything that decides what the user may see: a change in any of it must miss the cache. */
function visibilityFingerprint(ctx: AccessContext): string {
  return JSON.stringify({
    user: ctx.userId,
    superuser: ctx.isSuperuser,
    activeFlow: ctx.activeFlowId,
    memberships: ctx.memberships.map((m) => [m.flowId, m.roleId, m.level.id, m.visibility, m.permissions]),
    team: [...ctx.teamUserIds].sort((a, b) => a - b),
    fallback: ctx.orgScopeFallback,
  });
}

export interface CacheKeyParts {
  ctx: AccessContext;
  question: string;
  lang: Lang;
  today: string;
  dataVersion: number;
  promptVersion: string;
  model: string;
  page: string;
}

export function cacheKey(parts: CacheKeyParts): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        normalizeQuestion(parts.question), visibilityFingerprint(parts.ctx), parts.lang, parts.today,
        parts.dataVersion, parts.promptVersion, parts.model, parts.page,
      ])
    )
    .digest('hex');
}

export async function readCache(key: string, userId: number, db: Db): Promise<CachedAnswer | null> {
  // user_id is in the key already; matching it again keeps a hash collision or a bug in the
  // fingerprint from ever serving one user's answer to another.
  const result = await db.query(`SELECT answer FROM ai_answer_cache WHERE cache_key = $1 AND user_id = $2`, [key, userId]);
  return (result.rows[0]?.answer as CachedAnswer | undefined) ?? null;
}

export async function writeCache(key: string, userId: number, answer: CachedAnswer, db: Db): Promise<void> {
  try {
    await db.query(
      `INSERT INTO ai_answer_cache (cache_key, user_id, answer) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (cache_key) DO NOTHING`,
      [key, userId, JSON.stringify(answer)]
    );
    // Entries behind an older data_version can never be read again; sweep them lazily.
    await db.query(`DELETE FROM ai_answer_cache WHERE created_at < CURRENT_TIMESTAMP - interval '${CLEANUP_AFTER}'`);
  } catch (error) {
    console.error('[assistant] could not write the answer cache:', error);
  }
}
