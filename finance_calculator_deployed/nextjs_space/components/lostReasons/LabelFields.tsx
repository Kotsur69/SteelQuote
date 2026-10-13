'use client';

import { MAX_LABEL_LENGTH, REASON_LANGS, type ReasonLabels, type ReasonLang } from '@/lib/lostReasons';
import type { LostReasonsAdminStrings } from '@/components/lostReasons/adminStrings';

type Props = {
  idPrefix: string;
  value: ReasonLabels;
  disabled: boolean;
  s: LostReasonsAdminStrings;
  /** Compact = inline in a table row: no visible labels, aria-labels instead. */
  compact?: boolean;
  /** id of the element holding the current error; every field points at it. */
  errorId?: string;
  /** The language the error is about, marked aria-invalid. */
  invalidLang?: ReasonLang | null;
  /** Receives the first input, so a row can focus it when editing starts. */
  firstInputRef?: (el: HTMLInputElement | null) => void;
  onChange: (next: ReasonLabels) => void;
};

export const inputClass =
  'bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1.5 text-[12px] font-mono text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)] disabled:opacity-50';

export const EMPTY_LABELS: ReasonLabels = { pl: '', en: '', cs: '', de: '' };

// The four required names of one reason (PL / EN / CS / DE).
export default function LabelFields({
  idPrefix, value, disabled, s, compact = false, errorId, invalidLang, firstInputRef, onChange,
}: Props) {
  return (
    <>
      {REASON_LANGS.map((lang) => {
        const id = `${idPrefix}-${lang}`;
        const input = (
          <input
            id={id}
            ref={lang === REASON_LANGS[0] ? firstInputRef : undefined}
            aria-invalid={invalidLang === lang || undefined}
            aria-describedby={errorId}
            value={value[lang]}
            maxLength={MAX_LABEL_LENGTH}
            required
            aria-required="true"
            aria-label={compact ? s.langNames[lang] : undefined}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
            className={`${inputClass} w-full min-w-[9rem]`}
          />
        );
        if (compact) return <td key={lang} className="px-2 py-1">{input}</td>;
        return (
          <label key={lang} htmlFor={id} className="flex min-w-[10rem] flex-1 flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
            <span>
              {s.langNames[lang]} <span aria-hidden className="text-[var(--accent-sum)]">*</span>
            </span>
            {input}
          </label>
        );
      })}
    </>
  );
}
