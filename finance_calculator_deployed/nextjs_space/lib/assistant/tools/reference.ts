// Small reference tools: who is asking, the admin-managed lists and the current thresholds.
//
// Thresholds (approval rules, minimum margin, approval validity) are admin settings that change
// month to month, so the knowledge base never states them - any concrete value in an answer has
// to come from get_approval_rules at question time (plan section 6).

import { z } from 'zod';
import { STEEL_TYPE_SERIES_ORDER } from '../../analytics';
import { loadBaseResolver, loadDefaultMarginPct, loadLevels, loadPolicies, loadRulesForFlow } from '../../access/config';
import { membershipFor } from '../../access/context';
import { BOOLEAN_CRITERIA } from '../../access/ruleEngine';
import { activeLostReasons } from '../../lostReasons';
import { loadLostReasons } from '../../lostReasonsDb';
import { scopeKind } from '../footer';
import { formatDate, formatMoney, formatNumber, formatPercent, quarterLabel } from '../format';
import { defineTool, pick } from './types';

const none = z.object({}).strict();

export const getMyContext = defineTool({
  name: 'get_my_context',
  description: 'Who is asking: name, role and level per flow, permissions in the active flow, team size, visibility scope, today\'s date.',
  schema: none,
  run: async (_input, rt) => {
    const { ctx, lang } = rt;
    const active = membershipFor(ctx, ctx.activeFlowId);
    return {
      result: {
        status: 'ok',
        me: { id: ctx.userId, name: ctx.fullName ?? ctx.email, is_admin: ctx.isSuperuser },
        today: formatDate(rt.today, lang),
        active_flow: ctx.flows.find((f) => f.id === ctx.activeFlowId)?.name ?? null,
        memberships: ctx.memberships.map((m) => ({ flow: m.flowName, role: m.roleName, level: m.level.code })),
        permissions_in_active_flow: ctx.isSuperuser
          ? 'all'
          : active
            ? {
                create_offer: active.permissions.canCreateOffer,
                submit_to_validation: active.permissions.canSubmitToValidation,
                approve_reject: active.permissions.canApproveReject,
                change_pgl_base: active.permissions.canChangePglBase,
                change_price_margin: active.permissions.canChangePriceMargin,
              }
            : 'none',
        team_members: ctx.teamUserIds.length,
        visibility_scope: scopeKind(ctx),
      },
    };
  },
});

export const listLostReasons = defineTool({
  name: 'list_lost_reasons',
  description: "The app's admin-managed list of reasons a client can give for a lost offer (active ones). Never invent or regroup reasons.",
  schema: none,
  run: async (_input, rt) => {
    const { reasons } = await loadLostReasons(rt.db);
    return {
      result: {
        status: 'ok',
        reasons: activeLostReasons(reasons).map((r) => ({ code: r.code, label: r.labels[rt.lang] || r.labels.pl })),
      },
    };
  },
});

export const getApprovalRules = defineTool({
  name: 'get_approval_rules',
  description:
    "The CURRENT approval rules of the user's active flow (criterion, condition, threshold, unit, level that must approve), the approval validity in hours " +
    'and the default / minimum margin of the calculator. These are admin settings - always call this before quoting any threshold.',
  schema: none,
  run: async (_input, rt) => {
    const { ctx, lang, db } = rt;
    if (ctx.activeFlowId === null) {
      return { result: { status: 'no_flow', message: pick(lang, 'Użytkownik nie ma aktywnego flow.', 'The user has no active flow.') } };
    }
    const [rules, levels, policies, marginPct] = await Promise.all([
      loadRulesForFlow(ctx.activeFlowId, db), loadLevels(db), loadPolicies(db), loadDefaultMarginPct(db),
    ]);
    const levelName = (id: number) => {
      const level = levels.find((l) => l.id === id);
      return level ? `${level.code} (${level.name})` : String(id);
    };
    return {
      result: {
        status: 'ok',
        flow: ctx.flows.find((f) => f.id === ctx.activeFlowId)?.name ?? null,
        rules: rules
          .filter((r) => r.isActive)
          .map((r) => ({
            criterion: r.criterion,
            condition: r.conditionText,
            operator: r.operator,
            threshold: r.threshold === null
              ? pick(lang, 'nieskonfigurowany', 'not configured')
              : BOOLEAN_CRITERIA.has(r.criterion) ? pick(lang, 'tak', 'yes') : `${formatNumber(r.threshold, Number.isInteger(r.threshold) ? 0 : 2, lang)} ${r.unit}`.trim(),
            ...(r.referenceValue !== null ? { reference_value: `${formatNumber(r.referenceValue, 2, lang)} ${r.unit}`.trim() } : {}),
            approver_level: levelName(r.targetLevelId),
          })),
        approval_validity_hours: policies.approvalValidityHours,
        calculator_default_margin: formatPercent(marginPct, 2, lang),
      },
    };
  },
});

export const getPgl = defineTool({
  name: 'get_pgl',
  description: 'PGL base price (EUR/t) per steel type for a quarter - the base the calculator uses. Omit year/quarter for the current quarter.',
  schema: z.object({
    year: z.number().int().min(2000).max(2100).optional(),
    quarter: z.number().int().min(1).max(4).optional(),
  }).strict(),
  run: async (input, rt) => {
    const year = input.year ?? Number(rt.today.slice(0, 4));
    const quarter = input.quarter ?? Math.floor((Number(rt.today.slice(5, 7)) - 1) / 3) + 1;
    const validFrom = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
    const baseOf = await loadBaseResolver(validFrom, rt.db);
    return {
      result: {
        status: 'ok',
        quarter: quarterLabel(year, quarter, rt.lang),
        pgl: STEEL_TYPE_SERIES_ORDER.map((type) => ({ type, base: `${formatMoney(baseOf(type), 'EUR', rt.lang)}/t` })),
      },
    };
  },
});
