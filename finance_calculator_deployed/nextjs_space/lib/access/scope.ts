// Visibility scope (pure). Builds the SQL predicate that limits which offers a user may see,
// from the WIDOCZNOSC matrix rows of their memberships (migration 027). Every offer list,
// review queue and analytics query goes through offerVisibilitySql, so the matrix is enforced
// in one place and never trusted from the client.
//
// Rules:
//   - superuser: everything
//   - a user always sees offers they created and offers they decided as a reviewer (their own
//     history), whatever the matrix says
//   - per membership: all flows / all in flow / team / awaiting my validation
//   - branch and region have no org model yet: they resolve to the team ('team' fallback,
//     default) or to the whole flow ('flow' fallback), see app_settings.org_scope_fallback
// Visibility never implies edit or approval rights - those are checked separately.

import type { AccessContext, EffectiveScope, VisibilityFlags } from './types';

/** The sheet's "Efektywny zakres" formula: the broadest scope the flags grant. */
export function effectiveScope(v: VisibilityFlags): EffectiveScope {
  if (v.seeAllFlows) return 'allFlows';
  if (v.seeAllInFlow) return 'allInFlow';
  if (v.seeRegion) return 'region';
  if (v.seeBranch) return 'branch';
  if (v.seeTeam) return 'team';
  if (v.seeOwn) return 'own';
  if (v.seeAwaitingMyReview) return 'reviewQueueOnly';
  return 'none';
}

/**
 * SQL predicate over an offers alias. Pushes its values onto `params` and references them
 * by position, so it composes with any query that builds params the same way.
 */
export function offerVisibilitySql(ctx: AccessContext, params: unknown[], alias = 'o'): string {
  if (ctx.isSuperuser) return 'TRUE';
  if (ctx.memberships.some((m) => m.visibility.seeAllFlows)) return 'TRUE';

  params.push(ctx.userId);
  const me = `$${params.length}`;
  const clauses: string[] = [`${alias}.user_id = ${me}`];
  // Offers the user decided as a reviewer stay visible - but only in flows where they still
  // hold the approve permission, so a lost role does not keep a permanent window open.
  const approverFlows = ctx.memberships.filter((m) => m.permissions.canApproveReject).map((m) => m.flowId);
  if (approverFlows.length > 0) {
    params.push(approverFlows);
    clauses.push(
      `(${alias}.flow_id = ANY($${params.length}::int[]) AND EXISTS (SELECT 1 FROM offer_approval_steps hs ` +
        `WHERE hs.offer_id = ${alias}.id AND hs.decided_by = ${me}))`
    );
  }

  for (const m of ctx.memberships) {
    const v = m.visibility;
    // The flow id is bound lazily: a membership that grants nothing beyond the always-visible
    // own offers must not leave an unreferenced parameter behind (Postgres rejects those).
    let flowParam: string | null = null;
    const flowRef = () => {
      if (flowParam === null) {
        params.push(m.flowId);
        flowParam = `$${params.length}`;
      }
      return flowParam;
    };
    const orgUnitIsFlow = ctx.orgScopeFallback === 'flow' && (v.seeBranch || v.seeRegion);

    if (v.seeAllInFlow || orgUnitIsFlow) {
      clauses.push(`${alias}.flow_id = ${flowRef()}`);
    } else if ((v.seeTeam || v.seeBranch || v.seeRegion) && ctx.teamUserIds.length > 0) {
      const flow = flowRef();
      params.push(ctx.teamUserIds);
      clauses.push(`(${alias}.flow_id = ${flow} AND ${alias}.user_id = ANY($${params.length}::int[]))`);
    }

    if (v.seeAwaitingMyReview && m.permissions.canApproveReject) {
      const flow = flowRef();
      params.push(m.level.id);
      clauses.push(
        `(${alias}.flow_id = ${flow} AND EXISTS (SELECT 1 FROM offer_approval_steps qs ` +
          `WHERE qs.offer_id = ${alias}.id AND qs.status = 'pending' AND qs.level_id = $${params.length}))`
      );
    }
  }

  return `(${clauses.join(' OR ')})`;
}

/**
 * Predicate for "offers awaiting MY validation": pending steps at a level I may approve in
 * the offer's flow, never my own offers. Independent of the visibility matrix - holding the
 * approve permission at that level is what puts an offer in my queue.
 */
export function awaitingMyReviewSql(ctx: AccessContext, params: unknown[], alias = 'o'): string {
  const clauses: string[] = [];
  if (ctx.isSuperuser) {
    clauses.push(
      `EXISTS (SELECT 1 FROM offer_approval_steps aq WHERE aq.offer_id = ${alias}.id AND aq.status = 'pending')`
    );
  } else {
    for (const m of ctx.memberships) {
      if (!m.permissions.canApproveReject) continue;
      params.push(m.flowId);
      const flow = `$${params.length}`;
      params.push(m.level.id);
      clauses.push(
        `(${alias}.flow_id = ${flow} AND EXISTS (SELECT 1 FROM offer_approval_steps aq ` +
          `WHERE aq.offer_id = ${alias}.id AND aq.status = 'pending' AND aq.level_id = $${params.length}))`
      );
    }
  }
  if (clauses.length === 0) return 'FALSE';
  params.push(ctx.userId);
  return `((${clauses.join(' OR ')}) AND ${alias}.user_id IS DISTINCT FROM $${params.length})`;
}
