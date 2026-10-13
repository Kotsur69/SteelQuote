'use client';

import { useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Pencil, Save, X } from 'lucide-react';
import { REASON_LANGS, type LostReasonDef, type ReasonLabels, type ReasonLang } from '@/lib/lostReasons';
import LabelFields from '@/components/lostReasons/LabelFields';
import type { LostReasonsAdminStrings } from '@/components/lostReasons/adminStrings';

export type RowError = { text: string; lang: ReasonLang | null };

type Props = {
  reason: LostReasonDef;
  usage: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled: boolean;
  s: LostReasonsAdminStrings;
  onMove: (direction: -1 | 1) => void;
  /** Resolves to an error, or null when saved. */
  onSaveLabels: (labels: ReasonLabels) => Promise<RowError | null>;
  onToggleArchive: () => void;
};

// Order + four languages + usage + actions.
export const REASON_TABLE_COLUMNS = REASON_LANGS.length + 3;

const buttonClass =
  'inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)]';
const neutral = 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]';
const iconButtonClass = `${buttonClass} ${neutral} min-h-[28px] min-w-[28px] justify-center px-1`;

// One reason in the editor: names in four languages (inline edit), order arrows, usage count,
// archive / restore. The catch-all 'other' is pinned last and cannot be archived.
export default function ReasonRow({
  reason, usage, canMoveUp, canMoveDown, disabled, s, onMove, onSaveLabels, onToggleArchive,
}: Props) {
  const [draft, setDraft] = useState<ReasonLabels | null>(null);
  const [error, setError] = useState<RowError | null>(null);
  const [saving, setSaving] = useState(false);
  const firstInput = useRef<HTMLInputElement | null>(null);
  const editButton = useRef<HTMLButtonElement | null>(null);
  // Set when editing ends, so focus goes back to the Edit button once it is mounted again.
  const returnFocus = useRef(false);
  const name = reason.labels.pl;
  const errorId = `reason-${reason.code}-error`;
  const isEditing = draft !== null;

  useEffect(() => {
    if (isEditing) {
      firstInput.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      editButton.current?.focus();
    }
  }, [isEditing]);

  const stopEditing = () => {
    returnFocus.current = true;
    setDraft(null);
    setError(null);
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const problem = await onSaveLabels(draft);
      if (problem) {
        setError(problem);
        return;
      }
      stopEditing();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr className={`border-b border-[rgba(127,127,127,0.12)] ${reason.archived ? 'opacity-60' : ''}`}>
        <td className="px-2 py-1.5 whitespace-nowrap">
          {!reason.isSystem && !reason.archived && (
            <span className="inline-flex gap-1">
              <button type="button" onClick={() => onMove(-1)} disabled={disabled || !canMoveUp} aria-label={`${s.moveUp}: ${name}`} title={s.moveUp} className={iconButtonClass}>
                <ChevronUp aria-hidden className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => onMove(1)} disabled={disabled || !canMoveDown} aria-label={`${s.moveDown}: ${name}`} title={s.moveDown} className={iconButtonClass}>
                <ChevronDown aria-hidden className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </td>

        {draft ? (
          <LabelFields
            idPrefix={`edit-${reason.code}`}
            value={draft}
            disabled={saving}
            s={s}
            compact
            errorId={error ? errorId : undefined}
            invalidLang={error?.lang}
            firstInputRef={(el) => { firstInput.current = el; }}
            onChange={(next) => { setDraft(next); setError(null); }}
          />
        ) : (
          REASON_LANGS.map((lang) => (
            <td key={lang} className="px-3 py-1.5 font-mono text-[12px] text-[var(--text-primary)]">
              {reason.labels[lang]}
              {lang === 'pl' && reason.isSystem && (
                <span className="ml-2 rounded border border-[var(--accent-cr)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-cr)]">{s.systemMark}</span>
              )}
              {lang === 'pl' && reason.archived && (
                <span className="ml-2 rounded border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">{s.archivedMark}</span>
              )}
            </td>
          ))
        )}

        <td className="px-3 py-1.5 text-right font-mono text-[12px] tabular-nums text-[var(--text-secondary)] whitespace-nowrap">
          {s.usage(usage)}
        </td>

        <td className="px-2 py-1.5 text-right whitespace-nowrap">
          <span className="inline-flex gap-1.5">
            {draft ? (
              <>
                <button type="button" onClick={save} disabled={disabled || saving} className={`${buttonClass} border-[#3b8ef5] text-[#3b8ef5] hover:bg-[rgba(59,142,245,0.12)]`}>
                  <Save aria-hidden className="h-3.5 w-3.5" /> {s.save}
                </button>
                <button type="button" onClick={stopEditing} disabled={saving} className={`${buttonClass} ${neutral}`}>
                  <X aria-hidden className="h-3.5 w-3.5" /> {s.cancel}
                </button>
              </>
            ) : (
              <>
                <button ref={editButton} type="button" onClick={() => setDraft({ ...reason.labels })} disabled={disabled} aria-label={`${s.edit}: ${name}`} className={`${buttonClass} ${neutral}`}>
                  <Pencil aria-hidden className="h-3.5 w-3.5" /> {s.edit}
                </button>
                {!reason.isSystem && (
                  <button type="button" onClick={onToggleArchive} disabled={disabled} aria-label={`${reason.archived ? s.restore : s.archive}: ${name}`} className={`${buttonClass} ${neutral}`}>
                    {reason.archived
                      ? <><ArchiveRestore aria-hidden className="h-3.5 w-3.5" /> {s.restore}</>
                      : <><Archive aria-hidden className="h-3.5 w-3.5" /> {s.archive}</>}
                  </button>
                )}
              </>
            )}
          </span>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={REASON_TABLE_COLUMNS} className="px-3 pb-2">
            <p id={errorId} role="alert" className="text-[11px] text-[var(--accent-sum)]">{error.text}</p>
          </td>
        </tr>
      )}
    </>
  );
}
