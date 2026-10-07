'use client';

// Roles & levels tab: (a) the roles of one flow with their hierarchy level and the six
// functional permissions, (b) the global role catalogue, (c) the hierarchy level catalogue.

import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { AdminRole } from '@/lib/access/adminConfig';
import { PERMISSION_KEYS, type HierarchyLevel, type LevelKind, type Permissions } from '@/lib/access/types';
import { useAccessT } from '@/lib/i18n/access';
import {
  Card,
  FlowSelect,
  Toggle,
  cellInputCls,
  dangerBtnCls,
  inputCls,
  labelCls,
  numOrNull,
  primaryBtnCls,
  rolesInFlow,
  secondaryBtnCls,
  tdCls,
  thCls,
  theadRowCls,
  useRun,
  type PanelProps,
  type Run,
} from './ui';

const DEFAULT_LEVEL_CODE = 'N0';
// Starting permissions of a role added to a flow: a plain salesperson.
const DEFAULT_PERMISSIONS: Permissions = {
  canCreateOffer: true,
  canEditOwnBeforeSubmit: true,
  canSubmitToValidation: true,
  canApproveReject: false,
  canChangePglBase: false,
  canChangePriceMargin: true,
};

function sortedLevels(levels: HierarchyLevel[]): HierarchyLevel[] {
  return [...levels].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

// --- (a) roles inside a flow ------------------------------------------------------------

function FlowRoleMatrix({ config, run, busy }: { config: PanelProps['config']; run: Run; busy: boolean }) {
  const t = useAccessT();
  const [flowId, setFlowId] = useState<number | null>(config.flows[0]?.id ?? null);
  const [newRoleId, setNewRoleId] = useState('');
  const levels = sortedLevels(config.levels);
  const rows = rolesInFlow(config, flowId);
  const available = config.roles.filter((r) => r.isActive && !rows.some((row) => row.role.id === r.id));

  const put = (roleId: number, levelId: number, permissions: Permissions) =>
    run('flow-roles', 'PUT', { flowId, roleId, levelId, permissions });

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const level = levels.find((l) => l.code === DEFAULT_LEVEL_CODE) ?? levels[0];
    if (!newRoleId || !level || flowId === null) return;
    if (await put(Number(newRoleId), level.id, DEFAULT_PERMISSIONS)) setNewRoleId('');
  };

  return (
    <Card title={t.rolesPanel.title}>
      <div className="mb-4">
        <FlowSelect id="roles-flow" label={t.flow} flows={config.flows} value={flowId} onChange={setFlowId} />
      </div>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className={theadRowCls}>
              <th className={thCls}>{t.role}</th>
              <th className={thCls}>{t.level}</th>
              {PERMISSION_KEYS.map((k) => (
                <th key={k} className={`${thCls} text-center min-w-[88px]`}>{t.rolesPanel.permissions[k]}</th>
              ))}
              <th className={`${thCls} text-center`}>{t.rolesPanel.memberCount}</th>
              <th className={`${thCls} text-right`}>{t.rolesPanel.removeFromFlow}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map(({ role, flowRole }) => (
              <tr key={role.id} className={role.isActive ? '' : 'opacity-60'}>
                <td className={`${tdCls} font-medium whitespace-nowrap`}>{role.name}</td>
                <td className={tdCls}>
                  <select
                    className={cellInputCls}
                    aria-label={`${t.level}: ${role.name}`}
                    value={flowRole.levelId}
                    disabled={busy}
                    onChange={(e) => void put(role.id, Number(e.target.value), flowRole.permissions)}
                  >
                    {levels.map((l) => (
                      <option key={l.id} value={l.id}>{l.code}</option>
                    ))}
                  </select>
                </td>
                {PERMISSION_KEYS.map((k) => (
                  <td key={k} className={`${tdCls} text-center`}>
                    <Toggle
                      pressed={flowRole.permissions[k]}
                      disabled={busy}
                      label={`${role.name}: ${t.rolesPanel.permissions[k]}`}
                      onChange={(v) => void put(role.id, flowRole.levelId, { ...flowRole.permissions, [k]: v })}
                    />
                  </td>
                ))}
                <td className={`${tdCls} text-center font-mono`}>{flowRole.memberCount}</td>
                <td className={`${tdCls} text-right`}>
                  <button
                    type="button" className={dangerBtnCls} disabled={busy}
                    aria-label={`${t.rolesPanel.removeFromFlow}: ${role.name}`}
                    onClick={() => void run('flow-roles', 'DELETE', { flowId, roleId: role.id })}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-[minmax(0,20rem)_auto] gap-3 items-end">
        <div>
          <label htmlFor="add-role-to-flow" className={labelCls}>{t.rolesPanel.addToFlow}</label>
          <select id="add-role-to-flow" className={inputCls} required value={newRoleId} onChange={(e) => setNewRoleId(e.target.value)}>
            <option value="">{t.flowsPanel.pickRole}</option>
            {available.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className={primaryBtnCls} disabled={busy || flowId === null}>
          <Plus size={16} aria-hidden="true" />
          {t.rolesPanel.addToFlow}
        </button>
      </form>
    </Card>
  );
}

// --- (b) role catalogue -----------------------------------------------------------------

function RoleRow({ role, run, busy }: { role: AdminRole; run: Run; busy: boolean }) {
  const t = useAccessT();
  const [name, setName] = useState(role.name);
  const dirty = name.trim() !== '' && name.trim() !== role.name;
  return (
    <tr className={role.isActive ? '' : 'opacity-60'}>
      <td className={`${tdCls} font-mono text-xs text-[var(--text-secondary)]`}>{role.code}</td>
      <td className={tdCls}>
        <div className="flex items-center gap-2">
          <input
            className={`${cellInputCls} w-full min-w-[160px]`} aria-label={`${t.name} ${role.code}`}
            value={name} onChange={(e) => setName(e.target.value)}
          />
          {dirty && (
            <button type="button" className={secondaryBtnCls} disabled={busy}
              onClick={() => void run('roles', 'PATCH', { id: role.id, name: name.trim() })}>
              <Save size={14} aria-hidden="true" />
              {t.save}
            </button>
          )}
        </div>
      </td>
      <td className={tdCls}>
        <Toggle pressed={role.isActive} disabled={busy} showLabel label={role.isActive ? t.active : t.inactive}
          onChange={(isActive) => void run('roles', 'PATCH', { id: role.id, isActive })} />
      </td>
      <td className={`${tdCls} text-right`}>
        <button type="button" className={dangerBtnCls} disabled={busy} aria-label={`${t.delete}: ${role.name}`}
          onClick={() => void run('roles', 'DELETE', { id: role.id })}>
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function RoleCatalogue({ config, run, busy }: { config: PanelProps['config']; run: Run; busy: boolean }) {
  const t = useAccessT();
  const [form, setForm] = useState({ code: '', name: '' });
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('roles', 'POST', { code: form.code.trim(), name: form.name.trim() })) setForm({ code: '', name: '' });
  };
  return (
    <Card title={t.rolesPanel.catalogTitle}>
      <div className="overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className={theadRowCls}>
              <th className={thCls}>{t.code}</th>
              <th className={thCls}>{t.name}</th>
              <th className={thCls}>{t.active}</th>
              <th className={`${thCls} text-right`}>{t.delete}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {config.roles.map((r) => (
              <RoleRow key={`${r.id}:${r.name}`} role={r} run={run} busy={busy} />
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] gap-3 items-end">
        <div>
          <label htmlFor="new-role-code" className={labelCls}>{t.code}</label>
          <input id="new-role-code" className={inputCls} required maxLength={30}
            value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div>
          <label htmlFor="new-role-name" className={labelCls}>{t.name}</label>
          <input id="new-role-name" className={inputCls} required maxLength={100}
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <button type="submit" className={primaryBtnCls} disabled={busy}>
          <Plus size={16} aria-hidden="true" />
          {t.rolesPanel.addRole}
        </button>
      </form>
    </Card>
  );
}

// --- (c) level catalogue ----------------------------------------------------------------

interface LevelDraft {
  code: string;
  name: string;
  kind: LevelKind;
  chainRank: string;
  sortOrder: string;
}

function draftOf(l: HierarchyLevel | null): LevelDraft {
  return {
    code: l?.code ?? '',
    name: l?.name ?? '',
    kind: l?.kind ?? 'chain',
    chainRank: l?.chainRank === null || l?.chainRank === undefined ? '' : String(l.chainRank),
    sortOrder: l ? String(l.sortOrder) : '',
  };
}

function bodyOf(d: LevelDraft) {
  return {
    code: d.code.trim(),
    name: d.name.trim(),
    kind: d.kind,
    chainRank: d.kind === 'chain' ? numOrNull(d.chainRank) ?? 0 : null,
    sortOrder: Math.trunc(numOrNull(d.sortOrder) ?? 0),
  };
}

function LevelFields({ draft, setDraft, idPrefix }: { draft: LevelDraft; setDraft: (d: LevelDraft) => void; idPrefix: string }) {
  const t = useAccessT();
  const field = (key: 'code' | 'name' | 'sortOrder', label: string, width: string, type = 'text') => (
    <td className={tdCls}>
      <input type={type} className={`${cellInputCls} ${width}`} aria-label={`${label} ${idPrefix}`}
        value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />
    </td>
  );
  return (
    <>
      {field('code', t.code, 'w-20')}
      {field('name', t.name, 'w-full min-w-[140px]')}
      <td className={tdCls}>
        <select className={cellInputCls} aria-label={`${t.rolesPanel.kind} ${idPrefix}`} value={draft.kind}
          onChange={(e) => setDraft({ ...draft, kind: e.target.value as LevelKind })}>
          <option value="chain">{t.rolesPanel.kindChain}</option>
          <option value="parallel">{t.rolesPanel.kindParallel}</option>
        </select>
      </td>
      <td className={tdCls}>
        {draft.kind === 'chain' ? (
          <input type="number" min={0} step={1} className={`${cellInputCls} w-20`} aria-label={`${t.rolesPanel.rank} ${idPrefix}`}
            value={draft.chainRank} onChange={(e) => setDraft({ ...draft, chainRank: e.target.value })} />
        ) : (
          <span className="text-[var(--text-muted)]">{t.none}</span>
        )}
      </td>
      {field('sortOrder', t.rolesPanel.sortOrder, 'w-20', 'number')}
    </>
  );
}

function LevelRow({ level, run, busy }: { level: HierarchyLevel; run: Run; busy: boolean }) {
  const t = useAccessT();
  const [draft, setDraft] = useState(() => draftOf(level));
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(level));
  return (
    <tr>
      <LevelFields draft={draft} setDraft={setDraft} idPrefix={level.code} />
      <td className={`${tdCls} text-right`}>
        <button type="button" className={secondaryBtnCls} disabled={busy || !dirty}
          onClick={() => void run('levels', 'PATCH', { id: level.id, ...bodyOf(draft) })}>
          <Save size={14} aria-hidden="true" />
          {t.save}
        </button>
      </td>
    </tr>
  );
}

function LevelCatalogue({ config, run, busy }: { config: PanelProps['config']; run: Run; busy: boolean }) {
  const t = useAccessT();
  const [draft, setDraft] = useState(() => draftOf(null));
  const levels = sortedLevels(config.levels);
  const handleAdd = async () => {
    if (await run('levels', 'POST', bodyOf(draft))) setDraft(draftOf(null));
  };
  return (
    <Card title={t.rolesPanel.levelsTitle}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={theadRowCls}>
              <th className={thCls}>{t.code}</th>
              <th className={thCls}>{t.name}</th>
              <th className={thCls}>{t.rolesPanel.kind}</th>
              <th className={thCls}>{t.rolesPanel.rank}</th>
              <th className={thCls}>{t.rolesPanel.sortOrder}</th>
              <th className={`${thCls} text-right`}>{t.save}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {levels.map((l) => (
              <LevelRow key={`${l.id}:${JSON.stringify(l)}`} level={l} run={run} busy={busy} />
            ))}
            <tr className="bg-[var(--bg-panel)]">
              <LevelFields draft={draft} setDraft={setDraft} idPrefix={t.rolesPanel.addLevel} />
              <td className={`${tdCls} text-right`}>
                <button type="button" className={secondaryBtnCls} onClick={() => void handleAdd()}
                  disabled={busy || draft.code.trim() === '' || draft.name.trim() === ''}>
                  <Plus size={14} aria-hidden="true" />
                  {t.rolesPanel.addLevel}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function RolesPanel({ config, mutate, report }: PanelProps) {
  const { busy, run } = useRun({ mutate, report });
  return (
    <>
      <FlowRoleMatrix config={config} run={run} busy={busy} />
      <RoleCatalogue config={config} run={run} busy={busy} />
      <LevelCatalogue config={config} run={run} busy={busy} />
    </>
  );
}
