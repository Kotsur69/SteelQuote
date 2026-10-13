'use client';

// Visibility tab (WIDOCZNOSC sheet): per role in a flow, the seven visibility flags, the
// effective scope they grant (computed live) and a note. One explicit Save per row.

import { useState } from 'react';
import { Save } from 'lucide-react';
import type { AdminFlowRole, AdminRole } from '@/lib/access/adminConfig';
import { effectiveScope } from '@/lib/access/scope';
import { VISIBILITY_KEYS, type VisibilityFlags } from '@/lib/access/types';
import { useAccessT } from '@/lib/i18n/access';
import { Badge, Card, FlowSelect, Toggle, cellInputCls, rolesInFlow, secondaryBtnCls, tdCls, thCls, theadRowCls, useRun, type PanelProps, type Run } from './ui';

// A role without a matrix row sees only its own offers (see AdminFlowRole.visibility).
const DEFAULT_VISIBILITY: VisibilityFlags = {
  seeOwn: true,
  seeTeam: false,
  seeBranch: false,
  seeRegion: false,
  seeAllInFlow: false,
  seeAllFlows: false,
  seeAwaitingMyReview: false,
};

const ALL_VISIBLE: VisibilityFlags = Object.fromEntries(VISIBILITY_KEYS.map((k) => [k, true])) as VisibilityFlags;

function VisibilityRow({ role, flowRole, run, busy }: { role: AdminRole; flowRole: AdminFlowRole; run: Run; busy: boolean }) {
  const t = useAccessT();
  const initial = flowRole.visibility ?? DEFAULT_VISIBILITY;
  const [flags, setFlags] = useState<VisibilityFlags>(initial);
  const [note, setNote] = useState(flowRole.visibilityNote);
  const dirty = flowRole.visibility === null || note !== flowRole.visibilityNote ||
    VISIBILITY_KEYS.some((k) => flags[k] !== initial[k]);

  const handleSave = () =>
    void run('visibility', 'PUT', { flowId: flowRole.flowId, roleId: role.id, visibility: flags, note });

  return (
    <tr className={role.isActive ? '' : 'opacity-60'}>
      <td className={`${tdCls} font-medium whitespace-nowrap`}>{role.name}</td>
      {VISIBILITY_KEYS.map((k) => (
        <td key={k} className={`${tdCls} text-center`}>
          <Toggle pressed={flags[k]} label={`${role.name}: ${t.visibilityPanel.columns[k]}`}
            onChange={(v) => setFlags({ ...flags, [k]: v })} />
        </td>
      ))}
      <td className={tdCls}><Badge tone="muted">{t.visibilityPanel.scopes[effectiveScope(flags)]}</Badge></td>
      <td className={tdCls}>
        <input className={`${cellInputCls} min-w-[160px] w-full`} maxLength={500}
          aria-label={`${t.visibilityPanel.note}: ${role.name}`} value={note} onChange={(e) => setNote(e.target.value)} />
      </td>
      <td className={`${tdCls} text-right`}>
        <button type="button" className={secondaryBtnCls} disabled={busy || !dirty} onClick={handleSave}>
          <Save size={14} aria-hidden="true" />
          {t.save}
        </button>
      </td>
    </tr>
  );
}

export default function VisibilityPanel({ config, mutate, report }: PanelProps) {
  const t = useAccessT();
  const { busy, run } = useRun({ mutate, report });
  const [flowId, setFlowId] = useState<number | null>(config.flows[0]?.id ?? null);
  const rows = rolesInFlow(config, flowId);

  return (
    <Card title={t.visibilityPanel.title}>
      <p className="text-xs text-[var(--text-secondary)] mb-4">{t.visibilityPanel.intro}</p>
      <div className="mb-4">
        <FlowSelect id="visibility-flow" label={t.flow} flows={config.flows} value={flowId} onChange={setFlowId} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={theadRowCls}>
              <th className={thCls}>{t.role}</th>
              {VISIBILITY_KEYS.map((k) => (
                <th key={k} className={`${thCls} text-center min-w-[80px]`}>{t.visibilityPanel.columns[k]}</th>
              ))}
              <th className={thCls}>{t.visibilityPanel.effective}</th>
              <th className={thCls}>{t.visibilityPanel.note}</th>
              <th className={`${thCls} text-right`}>{t.save}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            <tr className="bg-[var(--bg-panel)]">
              <td className={`${tdCls} font-medium`}>{t.superuser}</td>
              {VISIBILITY_KEYS.map((k) => (
                <td key={k} className={`${tdCls} text-center`}>
                  <Toggle pressed disabled label={`${t.superuser}: ${t.visibilityPanel.columns[k]}`} onChange={() => undefined} />
                </td>
              ))}
              <td className={tdCls}><Badge tone="ok">{t.visibilityPanel.scopes[effectiveScope(ALL_VISIBLE)]}</Badge></td>
              <td className={`${tdCls} text-xs text-[var(--text-secondary)]`} colSpan={2}>{t.visibilityPanel.superuserRow}</td>
            </tr>
            {rows.map(({ role, flowRole }) => (
              <VisibilityRow
                key={`${flowRole.flowId}:${role.id}:${JSON.stringify(flowRole.visibility)}:${flowRole.visibilityNote}`}
                role={role} flowRole={flowRole} run={run} busy={busy}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
