'use client';

import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAccessT } from '@/lib/i18n/access';
import type { Criterion } from '@/lib/access/ruleEngine';

/** Shape of offers.validation_snapshot / the `validation` field of GET /api/offers/[id]. */
export interface ValidationSnapshot {
  fired?: {
    ruleId: number;
    criterion: Criterion;
    operator: string;
    threshold: number | null;
    unit: string;
    value: number | null;
    targetLevel?: string | null;
  }[];
  steps?: { level: string; requiredLevel: string; escalated: boolean }[];
  blocked?: boolean;
  noValidationReason?: string | null;
}

interface Props {
  validation: ValidationSnapshot | null | undefined;
}

function formatNumber(n: number | null): string {
  if (n === null) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// Why an offer needs (or does not need) validation, straight from the rule engine's snapshot:
// each fired rule as "criterion: value op threshold -> level", plus escalations and conflicts.
export default function ValidationNotice({ validation }: Props) {
  const at = useAccessT();
  if (!validation) return null;

  const fired = validation.fired ?? [];
  const steps = validation.steps ?? [];
  const escalated = steps.filter((s) => s.escalated);

  if (fired.length === 0 && !validation.blocked) {
    return (
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--accent-hdg)]">
        <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
        {at.workflow.noValidationNeeded}
      </p>
    );
  }

  return (
    <div
      role="note"
      className="mt-2 rounded border border-[var(--accent-hrs)] bg-[rgba(232,160,32,0.08)] px-3 py-2 text-[11px] text-[var(--text-primary)]"
    >
      {steps.length > 0 && (
        <p className="flex items-center gap-1.5 font-semibold text-[var(--accent-hrs)]">
          <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
          {at.workflow.awaitingLevels(steps.map((s) => s.level).join(' + '))}
        </p>
      )}
      {validation.blocked && (
        <p className="font-semibold text-[var(--accent-sum)]">{at.simulator.statusBlocked}</p>
      )}
      <ul className="mt-1 space-y-0.5">
        {fired.map((f) => (
          <li key={f.ruleId} className="font-mono">
            {at.rulesPanel.criteria[f.criterion] ?? f.criterion}: {formatNumber(f.value)} {f.operator}{' '}
            {formatNumber(f.threshold)} {f.unit}
            {f.targetLevel ? ` → ${f.targetLevel}` : ''}
          </li>
        ))}
      </ul>
      {escalated.map((s) => (
        <p key={`${s.requiredLevel}-${s.level}`} className="mt-1 text-[var(--accent-sum)]">
          {at.workflow.escalated(s.requiredLevel, s.level)}
        </p>
      ))}
    </div>
  );
}
