'use client';

import { useMemo, useState } from 'react';
import { Archive, ArchiveRestore, Plus, Search, X } from 'lucide-react';
import type { SteelType } from '@/lib/calculatorData';
import type { BookGrade, PriceBook } from '@/lib/priceBook';
import type { Translations } from '@/lib/translations';
import PriceCellInput from '@/components/priceBook/PriceCellInput';
import {
  formatPrice,
  gradeNameProblem,
  parsePrice,
  withGradeEdit,
  type TypeDraft,
} from '@/components/priceBook/draft';

type Props = {
  type: SteelType;
  book: PriceBook;
  draft: TypeDraft;
  disabled: boolean;
  t: Translations;
  onDraft: (update: (draft: TypeDraft) => TypeDraft) => void;
};

const inputClass = 'bg-[var(--bg-input)] border border-[var(--border)] rounded px-2 py-1 text-[12px] font-mono text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)] disabled:opacity-50';
const iconButtonClass = 'inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-cr)]';

let addSeq = 0;

// Grade list of one type: surcharge, yield flag, retire/restore (never a hard delete) and new
// grades. Everything stays a draft until the panel's Save.
export default function GradesSection({ type, book, draft, disabled, t, onDraft }: Props) {
  const [query, setQuery] = useState('');
  const [showRetired, setShowRetired] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSurcharge, setNewSurcharge] = useState('');
  const [newYield, setNewYield] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const grades = book[type].grades;
  const retiredCount = grades.filter((g) => g.retired).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return grades.filter((g) => {
      const edit = g.id !== null ? draft.gradeEdits[g.id] : undefined;
      const isRetired = edit?.retired ?? g.retired;
      if (isRetired && !showRetired && edit?.retired === undefined) return false;
      return q === '' || g.name.toLowerCase().includes(q);
    });
  }, [grades, draft.gradeEdits, query, showRetired]);

  const addGrade = () => {
    const problem = gradeNameProblem(book, type, draft, newName);
    if (problem) {
      setAddError(problem === 'required' ? t.priceBook.gradeNameRequired : t.priceBook.gradeDuplicate);
      return;
    }
    if (parsePrice(newSurcharge) === null) {
      setAddError(t.priceBook.invalidValue);
      return;
    }
    addSeq += 1;
    const add = { key: `new-${addSeq}`, name: newName.trim(), surcharge: newSurcharge, hasYieldSurcharge: newYield };
    onDraft((d) => ({ ...d, gradeAdds: [...d.gradeAdds, add] }));
    setNewName('');
    setNewSurcharge('');
    setNewYield(false);
    setAddError(null);
  };

  const editable = (g: BookGrade) => !disabled && g.id !== null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex items-center">
          <Search aria-hidden className="absolute left-2 h-3.5 w-3.5 text-[var(--text-muted)]" />
          <span className="sr-only">{t.priceBook.gradeSearch}</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.priceBook.gradeSearch}
            className={`${inputClass} pl-7 w-56`}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          {t.priceBook.showRetired}
          <span className="text-[var(--text-muted)]">({t.priceBook.gradeRetiredCount.replace('{count}', String(retiredCount))})</span>
        </label>
      </div>

      {/* New grade */}
      <fieldset disabled={disabled} className="flex flex-wrap items-end gap-2 rounded border border-dashed border-[var(--border)] p-2.5">
        <legend className="px-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{t.priceBook.gradeAdd}</legend>
        <label className="flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
          {t.priceBook.gradeName}
          <input value={newName} maxLength={100} onChange={(e) => { setNewName(e.target.value); setAddError(null); }} className={`${inputClass} w-48`} />
        </label>
        <label className="flex flex-col gap-1 text-[10px] text-[var(--text-secondary)]">
          {t.priceBook.gradeSurcharge}
          <input value={newSurcharge} inputMode="decimal" onChange={(e) => { setNewSurcharge(e.target.value); setAddError(null); }} className={`${inputClass} w-20 text-right`} />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-[11px] text-[var(--text-secondary)] cursor-pointer">
          <input type="checkbox" checked={newYield} onChange={(e) => setNewYield(e.target.checked)} />
          {t.priceBook.gradeYield}
        </label>
        <button type="button" onClick={addGrade} className={`${iconButtonClass} border-[var(--accent-cr)] text-[var(--accent-cr)] hover:bg-[rgba(59,142,245,0.12)]`}>
          <Plus aria-hidden className="h-3.5 w-3.5" /> {t.priceBook.gradeAdd}
        </button>
        {addError && <p role="alert" className="basis-full text-[11px] text-[var(--accent-sum)]">{addError}</p>}
      </fieldset>

      <div className="max-h-[420px] overflow-y-auto rounded border border-[var(--border)]">
        <table className="w-full border-collapse text-[12px]">
          <thead className="sticky top-0 z-10 bg-[var(--bg-card)]">
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-secondary)]">
              <th scope="col" className="px-3 py-2 text-left font-semibold">{t.priceBook.gradeName}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">{t.priceBook.gradeSurcharge}</th>
              <th scope="col" className="px-3 py-2 text-center font-semibold">{t.priceBook.gradeYield}</th>
              <th scope="col" className="px-3 py-2 text-right font-semibold"><span className="sr-only">{t.priceBook.gradeRetire}</span></th>
            </tr>
          </thead>
          <tbody>
            {draft.gradeAdds.map((a) => (
              <tr key={a.key} className="border-b border-[rgba(127,127,127,0.12)] bg-[rgba(232,160,32,0.06)]">
                <td className="px-3 py-1.5 font-mono">
                  {a.name}
                  <span className="ml-2 rounded border border-[var(--accent-hrs)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--accent-hrs)]">{t.priceBook.gradeNew}</span>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatPrice(parsePrice(a.surcharge) ?? 0)}</td>
                <td className="px-3 py-1.5 text-center">{a.hasYieldSurcharge ? '✓' : '—'}</td>
                <td className="px-3 py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => onDraft((d) => ({ ...d, gradeAdds: d.gradeAdds.filter((x) => x.key !== a.key) }))}
                    className={`${iconButtonClass} border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-sum)] hover:text-[var(--accent-sum)]`}
                  >
                    <X aria-hidden className="h-3.5 w-3.5" /> {t.priceBook.gradeRemoveNew}
                  </button>
                </td>
              </tr>
            ))}
            {visible.map((g) => {
              const edit = g.id !== null ? draft.gradeEdits[g.id] : undefined;
              const isRetired = edit?.retired ?? g.retired;
              const hasYield = edit?.hasYieldSurcharge ?? g.hasYieldSurcharge;
              const retiredChanged = isRetired !== g.retired;
              const yieldChanged = hasYield !== g.hasYieldSurcharge;
              const canEdit = editable(g);
              return (
                <tr key={g.id ?? g.name} className={`border-b border-[rgba(127,127,127,0.12)] ${isRetired ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-1.5 font-mono text-[var(--text-primary)]">
                    {g.name}
                    {isRetired && (
                      <span className="ml-2 rounded border border-[var(--border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        {t.priceBook.retiredMark}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1 text-right">
                    <PriceCellInput
                      current={g.surcharge}
                      defaultValue={undefined}
                      raw={edit?.surcharge}
                      label={`${t.priceBook.gradeSurcharge}: ${g.name}`}
                      defaultHint={t.priceBook.defaultValue}
                      invalidHint={t.priceBook.invalidValue}
                      disabled={!canEdit}
                      onChange={(raw) => g.id !== null && onDraft((d) => withGradeEdit(d, g.id as number, { surcharge: raw }))}
                    />
                  </td>
                  <td className={`px-3 py-1 text-center ${yieldChanged ? 'bg-[rgba(232,160,32,0.10)]' : ''}`}>
                    <input
                      type="checkbox"
                      checked={hasYield}
                      disabled={!canEdit}
                      aria-label={`${t.priceBook.gradeYield}: ${g.name}`}
                      onChange={(e) => g.id !== null && onDraft((d) => withGradeEdit(d, g.id as number, { hasYieldSurcharge: e.target.checked }))}
                    />
                  </td>
                  <td className="px-3 py-1 text-right">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => g.id !== null && onDraft((d) => withGradeEdit(d, g.id as number, { retired: !isRetired }))}
                      className={`${iconButtonClass} ${retiredChanged ? 'border-[var(--accent-hrs)] text-[var(--accent-hrs)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-hi)] hover:text-[var(--text-primary)]'}`}
                    >
                      {isRetired
                        ? <><ArchiveRestore aria-hidden className="h-3.5 w-3.5" /> {t.priceBook.gradeRestore}</>
                        : <><Archive aria-hidden className="h-3.5 w-3.5" /> {t.priceBook.gradeRetire}</>}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
