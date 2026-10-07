'use client';

// Rules tab: the REGULY table (one editable row per rule, explicit Save per dirty row), the
// configuration completeness control and the two routing policies.

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';
import { CRITERIA, OPERATORS, unconfiguredRules, type ApprovalRule, type Criterion, type Operator } from '@/lib/access/ruleEngine';
import type { ConflictPolicy, OrgScopeFallback } from '@/lib/access/types';
import { useAccessT } from '@/lib/i18n/access';
import {
  Badge,
  Card,
  Toggle,
  cellInputCls,
  dangerBtnCls,
  inputCls,
  labelCls,
  numOrNull,
  primaryBtnCls,
  secondaryBtnCls,
  tdCls,
  thCls,
  theadRowCls,
  useRun,
  type PanelProps,
  type Run,
} from './ui';

const SORT_STEP = 10;

/** Editable copy of a rule: numeric fields stay strings while typing. */
interface RuleDraft {
  key: string;
  id: number | null;
  flowId: number | null;
  criterion: Criterion;
  appliesToRoleId: number | null;
  conditionText: string;
  operator: Operator;
  threshold: string;
  referenceValue: string;
  unit: string;
  priority: string;
  targetLevelId: number;
  isActive: boolean;
  sortOrder: number;
}

const str = (n: number | null) => (n === null ? '' : String(n));

function draftOf(r: ApprovalRule): RuleDraft {
  return {
    key: `rule-${r.id}`,
    id: r.id,
    flowId: r.flowId,
    criterion: r.criterion,
    appliesToRoleId: r.appliesToRoleId,
    conditionText: r.conditionText,
    operator: r.operator,
    threshold: str(r.threshold),
    referenceValue: str(r.referenceValue),
    unit: r.unit,
    priority: String(r.priority),
    targetLevelId: r.targetLevelId,
    isActive: r.isActive,
    sortOrder: r.sortOrder,
  };
}

function bodyOf(d: RuleDraft) {
  return {
    ...(d.id !== null ? { id: d.id } : {}),
    flowId: d.flowId,
    criterion: d.criterion,
    appliesToRoleId: d.appliesToRoleId,
    conditionText: d.conditionText,
    operator: d.operator,
    threshold: numOrNull(d.threshold),
    referenceValue: d.criterion === 'margin_deficit_pp' ? numOrNull(d.referenceValue) : null,
    unit: d.unit,
    priority: Math.trunc(numOrNull(d.priority) ?? 0),
    targetLevelId: d.targetLevelId,
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  };
}

const idOrNull = (raw: string) => (raw === '' ? null : Number(raw));

function RuleRow({ initial, config, run, busy, onDiscard }: {
  initial: RuleDraft;
  config: AdminAccessConfig;
  run: Run;
  busy: boolean;
  onDiscard?: () => void;
}) {
  const t = useAccessT();
  const { t: tc } = useLanguage();
  const [d, setD] = useState(initial);
  const isNew = d.id === null;
  const dirty = isNew || JSON.stringify(d) !== JSON.stringify(initial);
  const set = (patch: Partial<RuleDraft>) => setD({ ...d, ...patch });
  const label = (what: string) => `${what} (${t.rulesPanel.criteria[d.criterion]})`;
  const levels = [...config.levels].sort((a, b) => a.sortOrder - b.sortOrder);
  const isUnconfigured = d.isActive && (d.threshold === '' || (d.criterion === 'margin_deficit_pp' && d.referenceValue === ''));

  const handleSave = async () => {
    if (await run('rules', isNew ? 'POST' : 'PATCH', bodyOf(d)) && isNew) onDiscard?.();
  };
  const handleDelete = () => {
    if (isNew) return onDiscard?.();
    if (confirm(t.rulesPanel.confirmDelete)) void run('rules', 'DELETE', { id: d.id });
  };

  return (
    <tr className={d.isActive ? '' : 'opacity-60'}>
      <td className={tdCls}>
        <select className={`${cellInputCls} min-w-[180px]`} aria-label={t.rulesPanel.criterion} value={d.criterion}
          onChange={(e) => set({ criterion: e.target.value as Criterion })}>
          {CRITERIA.map((c) => <option key={c} value={c}>{t.rulesPanel.criteria[c]}</option>)}
        </select>
        {isUnconfigured && <div className="mt-1"><Badge tone="warn">{t.rulesPanel.unconfigured}</Badge></div>}
      </td>
      <td className={tdCls}>
        <select className={cellInputCls} aria-label={label(t.flow)} value={d.flowId ?? ''}
          onChange={(e) => set({ flowId: idOrNull(e.target.value) })}>
          <option value="">{t.allFlows}</option>
          {config.flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </td>
      <td className={tdCls}>
        <select className={cellInputCls} aria-label={label(t.rulesPanel.appliesTo)} value={d.appliesToRoleId ?? ''}
          onChange={(e) => set({ appliesToRoleId: idOrNull(e.target.value) })}>
          <option value="">{t.allCreators}</option>
          {config.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </td>
      <td className={tdCls}>
        <input className={`${cellInputCls} min-w-[180px]`} aria-label={label(t.rulesPanel.condition)} maxLength={500}
          value={d.conditionText} onChange={(e) => set({ conditionText: e.target.value })} />
      </td>
      <td className={tdCls}>
        <select className={cellInputCls} aria-label={label(t.rulesPanel.operator)} value={d.operator}
          onChange={(e) => set({ operator: e.target.value as Operator })}>
          {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td className={tdCls}>
        {d.criterion === 'base_price_change' ? (
          <select className={cellInputCls} aria-label={label(t.rulesPanel.threshold)} value={d.threshold}
            onChange={(e) => set({ threshold: e.target.value })}>
            <option value="">{t.none}</option>
            <option value="1">{tc.common.yes}</option>
            <option value="0">{tc.common.no}</option>
          </select>
        ) : (
          <input type="number" step="any" className={`${cellInputCls} w-24`} aria-label={label(t.rulesPanel.threshold)}
            value={d.threshold} onChange={(e) => set({ threshold: e.target.value })} />
        )}
      </td>
      <td className={tdCls}>
        {d.criterion === 'margin_deficit_pp' ? (
          <input type="number" step="any" className={`${cellInputCls} w-24`} aria-label={label(t.rulesPanel.reference)}
            value={d.referenceValue} onChange={(e) => set({ referenceValue: e.target.value })} />
        ) : (
          <span className="text-[var(--text-muted)]">{t.none}</span>
        )}
      </td>
      <td className={tdCls}>
        <input className={`${cellInputCls} w-20`} aria-label={label(t.rulesPanel.unit)} maxLength={20}
          value={d.unit} onChange={(e) => set({ unit: e.target.value })} />
      </td>
      <td className={tdCls}>
        <input type="number" min={0} max={1000} step={1} className={`${cellInputCls} w-20`} aria-label={label(t.rulesPanel.priority)}
          value={d.priority} onChange={(e) => set({ priority: e.target.value })} />
      </td>
      <td className={tdCls}>
        <select className={cellInputCls} aria-label={label(t.rulesPanel.targetLevel)} value={d.targetLevelId}
          onChange={(e) => set({ targetLevelId: Number(e.target.value) })}>
          {levels.map((l) => <option key={l.id} value={l.id}>{l.code}</option>)}
        </select>
      </td>
      <td className={tdCls}>
        <Toggle pressed={d.isActive} label={label(t.active)} onChange={(isActive) => set({ isActive })} />
      </td>
      <td className={`${tdCls} text-right whitespace-nowrap`}>
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryBtnCls} disabled={busy || !dirty} onClick={() => void handleSave()}>
            <Save size={14} aria-hidden="true" />
            {t.save}
          </button>
          <button type="button" className={dangerBtnCls} disabled={busy} onClick={handleDelete}
            aria-label={`${isNew ? t.cancel : t.delete}: ${t.rulesPanel.criteria[d.criterion]}`}>
            {isNew ? <X size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** Missing chain approvers: a level some active rule targets that no role in the flow can approve. */
function missingChainTops(config: AdminAccessConfig) {
  const out: { key: string; flow: string; level: string }[] = [];
  for (const flow of config.flows) {
    for (const level of config.levels) {
      if (level.kind !== 'chain' || (level.chainRank ?? 0) <= 0) continue;
      const targeted = config.rules.some(
        (r) => r.isActive && r.targetLevelId === level.id && (r.flowId === null || r.flowId === flow.id)
      );
      const covered = config.flowRoles.some(
        (fr) => fr.flowId === flow.id && fr.levelId === level.id && fr.permissions.canApproveReject
      );
      if (targeted && !covered) out.push({ key: `${flow.id}-${level.id}`, flow: flow.name, level: level.code });
    }
  }
  return out;
}

function Completeness({ config }: { config: AdminAccessConfig }) {
  const t = useAccessT();
  const missing = unconfiguredRules(config.rules);
  const tops = missingChainTops(config);
  const flowName = (id: number | null) => (id === null ? t.allFlows : config.flows.find((f) => f.id === id)?.name ?? t.none);
  const levelCode = (id: number) => config.levels.find((l) => l.id === id)?.code ?? t.none;
  return (
    <Card title={t.rulesPanel.completenessTitle}>
      {missing.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-[var(--accent-hdg)]">
          <CheckCircle2 size={16} aria-hidden="true" />
          {t.rulesPanel.completenessOk}
        </p>
      ) : (
        <ul className="space-y-2">
          {missing.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="warn">{t.rulesPanel.unconfigured}</Badge>
              <span className="text-[var(--text-primary)]">{t.rulesPanel.criteria[r.criterion]}</span>
              <span className="text-xs text-[var(--text-secondary)] font-mono">{flowName(r.flowId)} · {levelCode(r.targetLevelId)}</span>
            </li>
          ))}
        </ul>
      )}
      {tops.length > 0 && (
        <ul className="mt-3 space-y-2">
          {tops.map((m) => (
            <li key={m.key} className="flex items-start gap-2 text-sm text-[var(--accent-hrs)]">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" aria-hidden="true" />
              {t.rulesPanel.noChainTop(m.flow, m.level)}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function RadioGroup<V extends string>({ name, legend, options, value, disabled, onChange }: {
  name: string;
  legend: string;
  options: { value: V; label: string }[];
  value: V;
  disabled: boolean;
  onChange: (v: V) => void;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className={labelCls}>{legend}</legend>
      <div className="space-y-1">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 min-h-[40px] text-sm text-[var(--text-primary)] cursor-pointer">
            <input type="radio" name={name} value={o.value} checked={value === o.value} disabled={disabled}
              onChange={() => onChange(o.value)} className="w-4 h-4 accent-[var(--accent-cr)]" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Policies({ config, run, busy }: { config: AdminAccessConfig; run: Run; busy: boolean }) {
  const t = useAccessT();
  const { conflictPolicy, orgScopeFallback } = config.policies;
  const save = (patch: Partial<{ conflictPolicy: ConflictPolicy; orgScopeFallback: OrgScopeFallback }>) =>
    void run('policies', 'PUT', { conflictPolicy, orgScopeFallback, ...patch });
  const policies = (['escalate_next', 'block', 'escalate_top'] as const).map((v) => ({ value: v, label: t.rulesPanel.policies[v] }));
  const scopes = (['team', 'flow'] as const).map((v) => ({ value: v, label: t.rulesPanel.orgScopes[v] }));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <RadioGroup name="conflict-policy" legend={t.rulesPanel.policyTitle} options={policies} value={conflictPolicy}
        disabled={busy} onChange={(v) => save({ conflictPolicy: v })} />
      <RadioGroup name="org-scope" legend={t.rulesPanel.orgScopeTitle} options={scopes} value={orgScopeFallback}
        disabled={busy} onChange={(v) => save({ orgScopeFallback: v })} />
    </div>
  );
}

export default function RulesPanel({ config, mutate, report }: PanelProps) {
  const t = useAccessT();
  const { busy, run } = useRun({ mutate, report });
  const [filter, setFilter] = useState<number | 'all'>('all');
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [seq, setSeq] = useState(0);

  const visible = [...config.rules]
    .filter((r) => filter === 'all' || r.flowId === null || r.flowId === filter)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const addDraft = () => {
    const level = [...config.levels].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!level) return;
    const maxSort = config.rules.reduce((m, r) => Math.max(m, r.sortOrder), 0);
    setDrafts([...drafts, {
      key: `draft-${seq}`, id: null, flowId: filter === 'all' ? null : filter, criterion: CRITERIA[0],
      appliesToRoleId: null, conditionText: '', operator: '<', threshold: '', referenceValue: '', unit: '',
      priority: '0', targetLevelId: level.id, isActive: true, sortOrder: maxSort + SORT_STEP + drafts.length,
    }]);
    setSeq(seq + 1);
  };
  const discard = (key: string) => setDrafts((list) => list.filter((d) => d.key !== key));

  const headers = [
    t.rulesPanel.criterion, t.flow, t.rulesPanel.appliesTo, t.rulesPanel.condition, t.rulesPanel.operator,
    t.rulesPanel.threshold, t.rulesPanel.reference, t.rulesPanel.unit, t.rulesPanel.priority,
    t.rulesPanel.targetLevel, t.active, t.save,
  ];

  return (
    <>
      <Completeness config={config} />
      <Card title={t.rulesPanel.policyTitle}>
        <Policies config={config} run={run} busy={busy} />
      </Card>
      <Card title={t.rulesPanel.title} aside={<span className="text-[10px] text-[var(--text-secondary)] font-mono">{visible.length}</span>}>
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="max-w-xs w-full">
            <label htmlFor="rules-flow-filter" className={labelCls}>{t.flow}</label>
            <select id="rules-flow-filter" className={inputCls} value={filter}
              onChange={(e) => setFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
              <option value="all">{t.allFlows}</option>
              {config.flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <button type="button" className={primaryBtnCls} onClick={addDraft}>
            <Plus size={16} aria-hidden="true" />
            {t.rulesPanel.addRule}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRowCls}>
                {headers.map((h, i) => <th key={i} className={thCls}>{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.map((r) => (
                <RuleRow key={JSON.stringify(r)} initial={draftOf(r)} config={config} run={run} busy={busy} />
              ))}
              {drafts.map((d) => (
                <RuleRow key={d.key} initial={d} config={config} run={run} busy={busy} onDiscard={() => discard(d.key)} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
