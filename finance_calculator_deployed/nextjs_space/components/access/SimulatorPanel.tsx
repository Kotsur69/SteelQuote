'use client';

// Simulator tab (the spec's SYMULATOR sheet). Builds OfferFacts straight from the form and
// runs the same pure engine as submit (evaluateRules + planApproval) on the loaded config.

import { useState } from 'react';
import { AlertTriangle, FlaskConical } from 'lucide-react';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';
import { CRITERIA, evaluateRules, priceValidity, type ApprovalRule, type Criterion, type OfferFacts } from '@/lib/access/ruleEngine';
import { planApproval, type ApprovalPlan } from '@/lib/access/routing';
import type { FlowRole, HierarchyLevel } from '@/lib/access/types';
import { useAccessT } from '@/lib/i18n/access';
import { Badge, Card, inputCls, labelCls, numOrNull, rolesInFlow, secondaryBtnCls, tdCls, thCls, theadRowCls, type PanelProps } from './ui';

const HOURS_PER_DAY = 24;
const FLOW1_CODE = 'FLOW1';
const FLOW2_CODE = 'FLOW2';
const N0_CODE = 'N0';
const T5_LEVEL_CODE = 'N+3';
const T5_THRESHOLD = 50;
// Id of the hypothetical T5 rule; never collides with a database id.
const T5_RULE_ID = -1;

interface SimForm {
  flowId: number | null;
  roleId: number | null;
  margin: string;
  reduction: string;
  days: string;
  validFrom: string;
  validTo: string;
  value: string;
  withExtraRule: boolean;
}

interface Preset {
  id: string;
  flowCode: string;
  values: Pick<SimForm, 'margin' | 'reduction' | 'days' | 'validFrom' | 'validTo' | 'value'>;
  withExtraRule: boolean;
  /** Level code the sheet expects; null = no validation, 'conflict' = configuration conflict. */
  expected: string | null | 'conflict';
}

const BASE = { margin: '4.5', reduction: '0', days: '2', validFrom: '2026-10-01', validTo: '2026-10-30', value: '100' };
const PRESETS: Preset[] = [
  { id: 'T1', flowCode: FLOW1_CODE, values: BASE, withExtraRule: false, expected: null },
  { id: 'T2', flowCode: FLOW1_CODE, values: { ...BASE, margin: '4.0' }, withExtraRule: false, expected: 'N+1' },
  { id: 'T3', flowCode: FLOW1_CODE, values: { ...BASE, validTo: '2026-12-31' }, withExtraRule: false, expected: 'N+1' },
  { id: 'T4', flowCode: FLOW1_CODE, values: { ...BASE, validTo: '2027-01-31', value: '1500000' }, withExtraRule: false, expected: 'N+2' },
  { id: 'T5', flowCode: FLOW2_CODE, values: BASE, withExtraRule: true, expected: 'conflict' },
];

function firstN0Role(config: AdminAccessConfig, flowId: number | null): number | null {
  const rows = rolesInFlow(config, flowId);
  const n0 = config.levels.find((l) => l.code === N0_CODE);
  return (rows.find((r) => r.flowRole.levelId === n0?.id) ?? rows[0])?.role.id ?? null;
}

function extraRule(config: AdminAccessConfig): ApprovalRule | null {
  const level = config.levels.find((l) => l.code === T5_LEVEL_CODE);
  if (!level) return null;
  return {
    id: T5_RULE_ID, flowId: null, criterion: 'offer_value_eur', appliesToRoleId: null, conditionText: '',
    operator: '>', threshold: T5_THRESHOLD, referenceValue: null, unit: 'EUR', priority: 0,
    targetLevelId: level.id, isActive: true, sortOrder: Number.MAX_SAFE_INTEGER,
  };
}

function factsOf(f: SimForm): OfferFacts {
  const reduction = numOrNull(f.reduction) ?? 0;
  const validity = priceValidity(f.validFrom, f.validTo);
  return {
    minMarginPct: numOrNull(f.margin),
    baseChanged: reduction > 0 ? 1 : 0,
    baseReductionPct: reduction,
    quoteValidityHours: (numOrNull(f.days) ?? 0) * HOURS_PER_DAY,
    priceValidityQuarters: validity.quarters,
    priceValidityDays: validity.days,
    offerValueEur: numOrNull(f.value) ?? 0,
  };
}

function flowRolesOf(config: AdminAccessConfig, flowId: number | null): FlowRole[] {
  const levelById = new Map(config.levels.map((l) => [l.id, l]));
  return rolesInFlow(config, flowId).flatMap(({ role, flowRole }) => {
    const level = levelById.get(flowRole.levelId);
    return level
      ? [{ flowId: flowRole.flowId, roleId: role.id, roleCode: role.code, roleName: role.name, level, permissions: flowRole.permissions }]
      : [];
  });
}

/** Highest level demanded per criterion: the top chain level plus any parallel ones. */
function levelsByCriterion(results: ReturnType<typeof evaluateRules>['results'], levels: HierarchyLevel[]) {
  const byId = new Map(levels.map((l) => [l.id, l]));
  const out = new Map<Criterion, string[]>();
  for (const c of CRITERIA) {
    const fired = results.filter((r) => r.outcome === 'fired' && r.rule.criterion === c).map((r) => byId.get(r.rule.targetLevelId));
    const chain = fired.filter((l): l is HierarchyLevel => !!l && l.kind === 'chain' && (l.chainRank ?? 0) > 0);
    const top = chain.sort((a, b) => (b.chainRank ?? 0) - (a.chainRank ?? 0))[0];
    const parallel = fired.filter((l): l is HierarchyLevel => !!l && l.kind === 'parallel').map((l) => l.code);
    out.set(c, [...(top ? [top.code] : []), ...Array.from(new Set(parallel))]);
  }
  return out;
}

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => React.ReactNode }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children(id)}
    </div>
  );
}

function StatusLine({ plan }: { plan: ApprovalPlan }) {
  const t = useAccessT();
  if (plan.blocked) return <Badge tone="bad">{t.simulator.statusBlocked}</Badge>;
  const escalated = plan.conflicts.filter((c) => c.resolvedLevel !== null);
  return (
    <div className="space-y-1">
      {escalated.map((c) => (
        <div key={c.requiredLevel.id}>
          <Badge tone="warn">{t.simulator.statusEscalated(c.requiredLevel.code, c.resolvedLevel?.code ?? t.none)}</Badge>
        </div>
      ))}
      <Badge tone={plan.steps.length > 0 ? 'warn' : 'ok'}>
        {plan.steps.length > 0 ? t.simulator.statusRequired : t.simulator.statusNone}
      </Badge>
    </div>
  );
}

export default function SimulatorPanel({ config }: PanelProps) {
  const t = useAccessT();
  const [form, setForm] = useState<SimForm>(() => {
    const flowId = (config.flows.find((f) => f.code === FLOW1_CODE) ?? config.flows[0])?.id ?? null;
    return { flowId, roleId: firstN0Role(config, flowId), ...BASE, withExtraRule: false };
  });
  const set = (patch: Partial<SimForm>) => setForm({ ...form, ...patch });

  const loadPreset = (p: Preset) => {
    const flowId = (config.flows.find((f) => f.code === p.flowCode) ?? config.flows[0])?.id ?? null;
    setForm({ flowId, roleId: firstN0Role(config, flowId), ...p.values, withExtraRule: p.withExtraRule });
  };

  const hypothetical = form.withExtraRule ? extraRule(config) : null;
  const rules = [
    ...config.rules.filter((r) => r.flowId === null || r.flowId === form.flowId),
    ...(hypothetical ? [hypothetical] : []),
  ];
  const flowRoles = flowRolesOf(config, form.flowId);
  const creator = flowRoles.find((fr) => fr.roleId === form.roleId) ?? null;
  const evaluation = evaluateRules(rules, factsOf(form), config.levels, form.roleId);
  const plan = planApproval(evaluation, flowRoles, { isSuperuser: false, flowRole: creator }, config.policies.conflictPolicy);
  const perCriterion = levelsByCriterion(evaluation.results, config.levels);
  const criteriaShown = CRITERIA.filter((c) => rules.some((r) => r.criterion === c));

  const approvers = plan.steps.map((s) => {
    const roles = flowRoles.filter((fr) => fr.level.id === s.level.id && fr.permissions.canApproveReject);
    const people = config.users.filter((u) =>
      u.isActive && u.memberships.some((m) => m.flowId === form.flowId && roles.some((r) => r.roleId === m.roleId))
    );
    return { level: s.level.code, roles: roles.map((r) => r.roleName), people: people.map((u) => u.name) };
  });
  const codes = (list: { level: HierarchyLevel }[]) => list.map((s) => s.level.code).join(' + ');
  const t5Level = config.levels.find((l) => l.code === T5_LEVEL_CODE)?.code ?? T5_LEVEL_CODE;

  return (
    <>
      <Card title={t.simulator.testCases}>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" className={secondaryBtnCls} onClick={() => loadPreset(p)}
              aria-label={`${t.simulator.run} ${p.id}`}>
              <FlaskConical size={14} aria-hidden="true" />
              <span className="font-semibold">{p.id}</span>
              <span className="font-mono text-[var(--text-muted)]">→</span>
              {p.expected === 'conflict' ? (
                <span className="inline-flex items-center gap-1 text-[var(--accent-hrs)]" title={t.errors.level_conflict}>
                  <AlertTriangle size={14} aria-hidden="true" />
                  {t.errors.level_conflict.split(':')[0]}
                </span>
              ) : (
                <span className="font-mono">{p.expected ?? t.simulator.noValidation}</span>
              )}
            </button>
          ))}
        </div>
        {form.withExtraRule && (
          <p className="mt-3 text-xs text-[var(--text-secondary)] flex items-center gap-1.5">
            <FlaskConical size={14} aria-hidden="true" />
            T5: + {t.rulesPanel.criteria.offer_value_eur} &gt; {T5_THRESHOLD} → {t5Level}
          </p>
        )}
      </Card>

      <Card title={t.simulator.title}>
        <p className="text-xs text-[var(--text-secondary)] mb-4">{t.simulator.intro}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field id="sim-flow" label={t.flow}>
            {(id) => (
              <select id={id} className={inputCls} value={form.flowId ?? ''}
                onChange={(e) => { const flowId = Number(e.target.value); set({ flowId, roleId: firstN0Role(config, flowId) }); }}>
                {config.flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </Field>
          <Field id="sim-role" label={t.simulator.creatorRole}>
            {(id) => (
              <select id={id} className={inputCls} value={form.roleId ?? ''} onChange={(e) => set({ roleId: Number(e.target.value) })}>
                {flowRoles.map((fr) => <option key={fr.roleId} value={fr.roleId}>{fr.roleName} ({fr.level.code})</option>)}
              </select>
            )}
          </Field>
          {([
            ['margin', t.simulator.offerMargin, 'number'],
            ['reduction', t.simulator.pglReductionPct, 'number'],
            ['days', t.simulator.paymentTermDays, 'number'],
            ['value', t.simulator.offerValue, 'number'],
            ['validFrom', t.simulator.validFrom, 'date'],
            ['validTo', t.simulator.validTo, 'date'],
          ] as const).map(([key, label, type]) => (
            <Field key={key} id={`sim-${key}`} label={label}>
              {(id) => (
                <input id={id} type={type} step={type === 'number' ? 'any' : undefined} className={inputCls}
                  value={form[key]} onChange={(e) => set({ [key]: e.target.value })} />
              )}
            </Field>
          ))}
        </div>
      </Card>

      <Card title={t.simulator.perCriterion}>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRowCls}>
                <th className={thCls}>{t.rulesPanel.criterion}</th>
                <th className={thCls}>{t.level}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {criteriaShown.map((c) => {
                const lv = perCriterion.get(c) ?? [];
                return (
                  <tr key={c}>
                    <td className={tdCls}>{t.rulesPanel.criteria[c]}</td>
                    <td className={`${tdCls} font-mono`}>
                      {lv.length > 0 ? lv.join(' + ') : <span className="text-[var(--text-muted)]">{t.simulator.noValidation}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
          <dt className={labelCls}>{t.simulator.finalLevel}</dt>
          <dd className="font-mono text-[var(--text-value)]">{plan.steps.length > 0 ? codes(plan.steps) : t.simulator.noValidation}</dd>
          {plan.autoSatisfied.length > 0 && (
            <>
              <dt className={labelCls}>{t.simulator.autoSatisfied}</dt>
              <dd className="font-mono text-[var(--text-secondary)]">{codes(plan.autoSatisfied)}</dd>
            </>
          )}
          <dt className={labelCls}>{t.simulator.approvers}</dt>
          <dd>
            {approvers.length === 0 ? (
              <span className="text-[var(--text-muted)]">{t.none}</span>
            ) : (
              <ul className="space-y-1">
                {approvers.map((a) => (
                  <li key={a.level}>
                    <span className="font-mono">{a.level}</span>: {a.roles.join(', ') || t.none}
                    {a.people.length > 0 && <span className="text-[var(--text-secondary)]"> ({a.people.join(', ')})</span>}
                  </li>
                ))}
              </ul>
            )}
          </dd>
          <dt className={labelCls}>{t.simulator.status}</dt>
          <dd><StatusLine plan={plan} /></dd>
        </dl>
      </Card>
    </>
  );
}
