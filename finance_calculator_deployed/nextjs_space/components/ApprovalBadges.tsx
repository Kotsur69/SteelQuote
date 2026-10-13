'use client';

import { useAccessT } from '@/lib/i18n/access';
import type { ApprovalState } from '@/lib/access/workflow';

interface Props {
  /** actions.approval of the offer (null outside review / approved). */
  approval: ApprovalState | null | undefined;
  /** 'reviewer' reads a rule change as "approving passes it higher", 'owner' as "resubmit". */
  audience: 'owner' | 'reviewer';
  /** Set when the viewer may decide only as a stand-in: the level codes actually required. */
  standInLevels?: string | null;
}

const BADGE = 'px-2 py-0.5 rounded text-[10px] font-mono font-semibold tracking-wider border';
const WARN = `${BADGE} border-[var(--accent-sum)] text-[var(--accent-sum)] bg-[rgba(245,71,90,0.12)]`;
const INFO = `${BADGE} border-[var(--accent-cr)] text-[var(--accent-cr)] bg-[rgba(59,142,245,0.12)]`;
const MUTED = `${BADGE} border-[var(--border-hi)] text-[var(--text-secondary)] bg-[rgba(125,136,170,0.10)]`;

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
}

// Compact badges next to the status: why an approved offer has to go back to validation,
// that the rules changed since it was approved, how long the approval holds, and - for an
// approver above the required level - that they may, but need not, decide it.
export default function ApprovalBadges({ approval, audience, standInLevels }: Props) {
  const at = useAccessT();
  const badges: { key: string; cls: string; text: string }[] = [];

  if (standInLevels) badges.push({ key: 'standIn', cls: INFO, text: at.workflow.standIn(standInLevels) });
  if (approval?.rulesStricter) {
    badges.push({
      key: 'stricter',
      cls: WARN,
      text: audience === 'reviewer' ? at.workflow.rulesStricterReview : at.workflow.rulesStricter,
    });
  } else if (approval?.needsRevalidation && approval.expired) {
    badges.push({ key: 'expired', cls: WARN, text: at.workflow.approvalExpired });
  }
  if (approval?.rulesRelaxed) badges.push({ key: 'relaxed', cls: INFO, text: at.workflow.rulesRelaxed });
  if (audience === 'owner' && approval && !approval.needsRevalidation && !approval.expired && approval.expiresAt) {
    badges.push({ key: 'validUntil', cls: MUTED, text: at.workflow.approvalValidUntil(formatWhen(approval.expiresAt)) });
  }

  if (badges.length === 0) return null;
  return (
    <>
      {badges.map((b) => (
        <span key={b.key} className={b.cls}>
          {b.text}
        </span>
      ))}
    </>
  );
}
