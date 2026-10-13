'use client';

// Small shared building blocks of the access admin panels. Styling uses only the theme CSS
// variables (see AdminLayout), so dark, light and high-contrast all work unchanged.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import type { AdminAccessConfig } from '@/lib/access/adminConfig';
import type { Mutate, MutationResult } from './useAdminAccess';

/** What every panel receives from the page. `report` flashes the outcome of a mutation. */
export interface PanelProps {
  config: AdminAccessConfig;
  mutate: Mutate;
  report: (result: MutationResult) => boolean;
}

export type Run = (
  resource: Parameters<Mutate>[0],
  method: Parameters<Mutate>[1],
  body: unknown
) => Promise<boolean>;

/** Wraps mutate + report with a busy flag shared by one panel's controls. */
export function useRun({ mutate, report }: Pick<PanelProps, 'mutate' | 'report'>): { busy: boolean; run: Run } {
  const [busy, setBusy] = useState(false);
  const run: Run = async (resource, method, body) => {
    setBusy(true);
    try {
      return report(await mutate(resource, method, body));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Roles that exist inside a flow, joined with the catalogue (name order). */
export function rolesInFlow(config: AdminAccessConfig, flowId: number | null) {
  if (flowId === null) return [];
  const byId = new Map(config.roles.map((r) => [r.id, r]));
  return config.flowRoles
    .filter((fr) => fr.flowId === flowId)
    .flatMap((fr) => {
      const role = byId.get(fr.roleId);
      return role ? [{ flowRole: fr, role }] : [];
    })
    .sort((a, b) => a.role.name.localeCompare(b.role.name));
}

export const inputCls =
  'w-full bg-[var(--bg-input)] border border-[var(--border)] rounded px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-cr)] outline-none';

/** Compact input for table cells (still >= 36px tall for touch). */
export const cellInputCls =
  'bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent-cr)] min-h-[36px]';

export const labelCls = 'block text-[10px] uppercase tracking-wider text-[var(--text-secondary)] mb-1';

export const thCls = 'px-3 py-2.5 font-medium';
export const tdCls = 'px-3 py-2 align-middle';
export const theadRowCls =
  'text-left text-[10px] uppercase tracking-wider text-[var(--text-secondary)] border-b border-[var(--border)]';

export const primaryBtnCls =
  'inline-flex items-center gap-1.5 min-h-[40px] px-4 py-2 bg-[var(--accent-cr)] text-white rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50';

export const secondaryBtnCls =
  'inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium rounded border border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50';

export const dangerBtnCls =
  'inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 text-xs font-medium rounded border border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.08)] hover:bg-[rgba(245,71,90,0.15)] transition-colors disabled:opacity-50';

export function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-[var(--bg-card)] border border-[var(--border)] rounded-md mb-6 min-w-0">
      <div className="flex flex-wrap items-center gap-2.5 px-4 py-3 border-b border-[var(--border)]">
        <span className="w-2 h-2 rounded-full bg-[var(--accent-cr)]" aria-hidden="true" />
        <h2 className="text-xs font-semibold tracking-widest uppercase text-[var(--text-primary)]">{title}</h2>
        {aside && <div className="ml-auto flex flex-wrap items-center gap-2">{aside}</div>}
      </div>
      <div className="p-4 min-w-0">{children}</div>
    </section>
  );
}

/** A yes/no switch rendered as a pressed/unpressed button (40px touch target). */
export function Toggle({
  pressed,
  onChange,
  label,
  disabled,
  showLabel = false,
}: {
  pressed: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={showLabel ? undefined : label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!pressed)}
      className={`inline-flex items-center justify-center gap-1.5 min-w-[40px] min-h-[40px] px-2 rounded border text-xs font-medium transition-colors disabled:opacity-50 ${
        pressed
          ? 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.12)]'
          : 'border-[var(--border)] text-[var(--text-muted)] hover:border-[var(--border-hi)]'
      }`}
    >
      <span
        aria-hidden="true"
        className={`w-4 h-4 rounded-sm border flex items-center justify-center ${
          pressed ? 'border-[var(--accent-hdg)] bg-[var(--accent-hdg)] text-white' : 'border-[var(--text-muted)]'
        }`}
      >
        {pressed && <Check size={12} strokeWidth={3} />}
      </span>
      {showLabel && <span>{label}</span>}
    </button>
  );
}

export function Badge({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'muted'; children: ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'border-[var(--accent-hdg)] text-[var(--accent-hdg)] bg-[rgba(46,204,113,0.12)]'
      : tone === 'warn'
        ? 'border-[var(--accent-hrs)] text-[var(--accent-hrs)] bg-[rgba(232,160,32,0.12)]'
        : tone === 'bad'
          ? 'border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.12)]'
          : 'border-[var(--text-muted)] text-[var(--text-muted)]';
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${cls}`}>
      {children}
    </span>
  );
}

export type FlashMessage = { type: 'success' | 'error'; text: string } | null;
const FLASH_MS = 3500;

/** Toast like the salespeople page; `report` turns a mutation result into a flash. */
export function useFlash(savedText: string) {
  const [message, setMessage] = useState<FlashMessage>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = useCallback((type: 'success' | 'error', text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage({ type, text });
    timer.current = setTimeout(() => setMessage(null), FLASH_MS);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const report = useCallback(
    (result: MutationResult): boolean => {
      if (result.ok) flash('success', savedText);
      else flash('error', result.error ?? '');
      return result.ok;
    },
    [flash, savedText]
  );

  return { message, flash, report };
}

export function Flash({ message }: { message: FlashMessage }) {
  if (!message) return null;
  return (
    <div
      role={message.type === 'error' ? 'alert' : 'status'}
      className={`fixed top-4 right-4 left-4 sm:left-auto max-w-md px-4 py-3 rounded-lg border shadow-lg z-50 ${
        message.type === 'success'
          ? 'bg-[rgba(46,204,113,0.15)] border-[#2ecc71] text-[#2ecc71]'
          : 'bg-[rgba(245,71,90,0.15)] border-[#f5475a] text-[#f5475a]'
      }`}
    >
      {message.text}
    </div>
  );
}

/** Flow picker shared by the per-flow panels. */
export function FlowSelect({
  id,
  label,
  flows,
  value,
  onChange,
}: {
  id: string;
  label: string;
  flows: { id: number; name: string; code: string }[];
  value: number | null;
  onChange: (flowId: number) => void;
}) {
  return (
    <div className="max-w-xs">
      <label htmlFor={id} className={labelCls}>
        {label}
      </label>
      <select id={id} className={inputCls} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))}>
        {flows.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name} ({f.code})
          </option>
        ))}
      </select>
    </div>
  );
}

/** Parse a number input: '' -> null, invalid -> null. */
export function numOrNull(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
