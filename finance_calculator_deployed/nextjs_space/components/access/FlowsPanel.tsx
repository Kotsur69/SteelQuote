'use client';

// Flows tab: the flow catalogue (rename, activate, add) and the members of one flow
// (move to another role, remove, add a user with a role that exists in that flow).

import { useState } from 'react';
import { Plus, Save, UserMinus, UserPlus } from 'lucide-react';
import type { FlowSummary } from '@/lib/access/types';
import { useAccessT } from '@/lib/i18n/access';
import {
  Card,
  FlowSelect,
  Toggle,
  cellInputCls,
  dangerBtnCls,
  inputCls,
  labelCls,
  primaryBtnCls,
  rolesInFlow,
  secondaryBtnCls,
  tdCls,
  thCls,
  theadRowCls,
  useRun,
  type PanelProps,
} from './ui';

function FlowRow({ flow, busy, onRename, onToggle }: {
  flow: FlowSummary;
  busy: boolean;
  onRename: (name: string) => void;
  onToggle: (isActive: boolean) => void;
}) {
  const t = useAccessT();
  const [name, setName] = useState(flow.name);
  const dirty = name.trim() !== flow.name && name.trim() !== '';
  return (
    <tr className={flow.isActive ? '' : 'opacity-60'}>
      <td className={`${tdCls} font-mono text-xs text-[var(--text-secondary)]`}>{flow.code}</td>
      <td className={tdCls}>
        <div className="flex items-center gap-2">
          <input
            className={`${cellInputCls} w-full min-w-[160px]`}
            aria-label={`${t.name} ${flow.code}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty) onRename(name.trim());
            }}
          />
          {dirty && (
            <button type="button" className={secondaryBtnCls} disabled={busy} onClick={() => onRename(name.trim())}>
              <Save size={14} aria-hidden="true" />
              {t.save}
            </button>
          )}
        </div>
      </td>
      <td className={tdCls}>
        <Toggle
          pressed={flow.isActive}
          onChange={onToggle}
          disabled={busy}
          label={flow.isActive ? t.active : t.inactive}
          showLabel
        />
      </td>
    </tr>
  );
}

export default function FlowsPanel({ config, mutate, report }: PanelProps) {
  const t = useAccessT();
  const { busy, run } = useRun({ mutate, report });
  const [form, setForm] = useState({ code: '', name: '' });
  const [flowId, setFlowId] = useState<number | null>(config.flows[0]?.id ?? null);
  const [newMember, setNewMember] = useState({ userId: '', roleId: '' });

  const handleAddFlow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run('flows', 'POST', { code: form.code.trim(), name: form.name.trim() })) {
      setForm({ code: '', name: '' });
    }
  };

  const flowRoles = rolesInFlow(config, flowId);
  const members = config.users
    .map((u) => ({ user: u, roleId: u.memberships.find((m) => m.flowId === flowId)?.roleId ?? null }))
    .filter((m) => m.roleId !== null);
  const candidates = config.users.filter(
    (u) => u.isActive && !u.isSuperuser && !u.memberships.some((m) => m.flowId === flowId)
  );

  const setMembership = (userId: number, roleId: number | null) =>
    run('memberships', 'PUT', { userId, flowId, roleId });

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMember.userId || !newMember.roleId) return;
    if (await setMembership(Number(newMember.userId), Number(newMember.roleId))) {
      setNewMember({ userId: '', roleId: '' });
    }
  };

  return (
    <>
      <Card title={t.flowsPanel.title}>
        <p className="text-xs text-[var(--text-secondary)] mb-3">{t.flowsPanel.deactivateHint}</p>
        <div className="overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className={theadRowCls}>
                <th className={thCls}>{t.code}</th>
                <th className={thCls}>{t.name}</th>
                <th className={thCls}>{t.active}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {config.flows.map((f) => (
                <FlowRow
                  key={`${f.id}:${f.name}`}
                  flow={f}
                  busy={busy}
                  onRename={(name) => void run('flows', 'PATCH', { id: f.id, name })}
                  onToggle={(isActive) => void run('flows', 'PATCH', { id: f.id, isActive })}
                />
              ))}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleAddFlow} className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] gap-3 items-end">
          <div>
            <label htmlFor="new-flow-code" className={labelCls}>{t.code}</label>
            <input
              id="new-flow-code" className={inputCls} required maxLength={30}
              value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="new-flow-name" className={labelCls}>{t.name}</label>
            <input
              id="new-flow-name" className={inputCls} required maxLength={100}
              value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <button type="submit" className={primaryBtnCls} disabled={busy}>
            <Plus size={16} aria-hidden="true" />
            {t.flowsPanel.addFlow}
          </button>
        </form>
      </Card>

      <Card
        title={t.flowsPanel.members}
        aside={<span className="text-[10px] text-[var(--text-secondary)] font-mono">{members.length}</span>}
      >
        <div className="mb-4">
          <FlowSelect id="members-flow" label={t.flow} flows={config.flows} value={flowId} onChange={setFlowId} />
        </div>

        {members.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)] mb-4">{t.flowsPanel.noMembers}</p>
        ) : (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className={theadRowCls}>
                  <th className={thCls}>{t.name}</th>
                  <th className={thCls}>{t.flowsPanel.moveToRole}</th>
                  <th className={`${thCls} text-right`}>{t.remove}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {members.map(({ user, roleId }) => (
                  <tr key={user.id} className={user.isActive ? '' : 'opacity-60'}>
                    <td className={tdCls}>
                      <div className="font-medium text-[var(--text-primary)]">{user.name}</div>
                      <div className="text-[11px] text-[var(--text-secondary)] font-mono">{user.email}</div>
                    </td>
                    <td className={tdCls}>
                      <select
                        className={cellInputCls}
                        aria-label={`${t.flowsPanel.moveToRole}: ${user.name}`}
                        value={roleId ?? ''}
                        disabled={busy}
                        onChange={(e) => void setMembership(user.id, Number(e.target.value))}
                      >
                        {flowRoles.map(({ role }) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <button
                        type="button" className={dangerBtnCls} disabled={busy}
                        aria-label={`${t.remove}: ${user.name}`}
                        onClick={() => void setMembership(user.id, null)}
                      >
                        <UserMinus size={14} aria-hidden="true" />
                        <span className="hidden sm:inline">{t.remove}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 items-end">
          <div>
            <label htmlFor="add-member-user" className={labelCls}>{t.flowsPanel.pickUser}</label>
            <select
              id="add-member-user" className={inputCls} required
              value={newMember.userId} onChange={(e) => setNewMember({ ...newMember, userId: e.target.value })}
            >
              <option value="">{t.flowsPanel.pickUser}</option>
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="add-member-role" className={labelCls}>{t.flowsPanel.pickRole}</label>
            <select
              id="add-member-role" className={inputCls} required
              value={newMember.roleId} onChange={(e) => setNewMember({ ...newMember, roleId: e.target.value })}
            >
              <option value="">{t.flowsPanel.pickRole}</option>
              {flowRoles.map(({ role }) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={primaryBtnCls} disabled={busy || flowId === null}>
            <UserPlus size={16} aria-hidden="true" />
            {t.flowsPanel.addMember}
          </button>
        </form>
      </Card>
    </>
  );
}
