'use client';

import {
  CERT_OPTIONS,
  CR_PROTECTION_OPTIONS,
  HDG_PROTECTION_OPTIONS,
  SSC_MAX_WEIGHT_OPTIONS,
  SSC_PACKING_OPTIONS,
  TOL_THICK_OPTIONS,
  ZM_PROTECTION_OPTIONS,
  getHutaSscToggleOptions,
  type SteelType,
} from '@/lib/calculatorData';
import { defaultCell, optionGroupsFor, optionValues, type OptionGroup, type PriceBook } from '@/lib/priceBook';
import type { Language, Translations } from '@/lib/translations';
import PriceCellInput from '@/components/priceBook/PriceCellInput';
import { cellId, type TypeDraft } from '@/components/priceBook/draft';

type Props = {
  section: 'huta' | 'ssc';
  type: SteelType;
  book: PriceBook;
  draft: TypeDraft;
  disabled: boolean;
  t: Translations;
  language: Language;
  onCell: (id: string, raw: string, current: number) => void;
};

// Labels are the same ones the calculator renders (code, per UI language); prices come from the book.
export function groupLabels(group: OptionGroup, type: SteelType, t: Translations, language: Language): { title: string; labels: string[] } {
  const loc = getHutaSscToggleOptions(t, language);
  const names = (opts: readonly { label: string }[]) => opts.map((o) => o.label);
  switch (group) {
    case 'tolerance': return { title: t.huta.thicknessTolerance, labels: names(TOL_THICK_OPTIONS[type]) };
    case 'cert': return { title: t.huta.certificate, labels: names(CERT_OPTIONS) };
    case 'crProtection': return { title: t.huta.protection, labels: names(CR_PROTECTION_OPTIONS) };
    case 'crPackaging': return { title: t.huta.packaging, labels: names(loc.crPackaging) };
    case 'crSurface': return { title: t.huta.surface, labels: names(loc.crSurface) };
    case 'crFinish': return { title: t.huta.surfaceFinish, labels: names(loc.crFinish) };
    case 'crWeld': return { title: t.huta.weld, labels: names(loc.crWeld) };
    case 'hdgProtection': return { title: t.huta.protection, labels: names(HDG_PROTECTION_OPTIONS) };
    case 'hdgPackaging': return { title: t.huta.packaging, labels: names(loc.hdgPackaging) };
    case 'hdgSurface': return { title: t.huta.surface, labels: names(loc.hdgSurface) };
    case 'hdgFinish': return { title: t.huta.surfaceFinish, labels: names(loc.hdgFinish) };
    case 'hdgWeld': return { title: t.huta.weld, labels: names(loc.hdgWeld) };
    case 'zmProtection': return { title: t.huta.protection, labels: names(ZM_PROTECTION_OPTIONS) };
    case 'zmPackaging': return { title: t.huta.packaging, labels: names(loc.zmPackaging) };
    case 'zmSurface': return { title: t.huta.surface, labels: names(loc.zmSurface) };
    case 'zmWeld': return { title: t.huta.weld, labels: names(loc.zmWeld) };
    case 'sscLenTol': return { title: t.ssc.lengthTolerance, labels: names(loc.lengthTolerance) };
    case 'sscFlatness': return { title: t.ssc.flatness, labels: names(loc.flatness) };
    case 'sscSurface': return { title: t.ssc.surface, labels: names(loc.surface) };
    case 'sscMaxWeight': return { title: t.ssc.maxPackWeight, labels: names(SSC_MAX_WEIGHT_OPTIONS) };
    case 'sscMarking': return { title: t.ssc.marking, labels: names(loc.marking) };
    case 'sscEdging': return { title: t.ssc.edging, labels: names(loc.edging) };
    case 'sscPacking': return { title: t.ssc.packaging, labels: names(SSC_PACKING_OPTIONS) };
    case 'sscLabels': return { title: t.ssc.labels, labels: names(loc.labels) };
  }
}

export default function OptionsSection({ section, type, book, draft, disabled, t, language, onCell }: Props) {
  const groups = optionGroupsFor(type, section);

  return (
    <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {groups.map((group) => {
        const { title, labels } = groupLabels(group, type, t, language);
        const prices = optionValues(book, type, group);
        return (
          <fieldset key={group} className="min-w-0">
            <legend className="mb-1.5 text-[11px] font-semibold text-[var(--text-primary)]">{title}</legend>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              {labels.map((label, idx) => {
                const id = cellId('option', group, String(idx));
                return (
                  <label key={id} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                    <span className="font-mono">{label}</span>
                    <PriceCellInput
                      current={prices[idx]}
                      defaultValue={defaultCell(type, 'option', group, String(idx))}
                      raw={draft.cells[id]}
                      label={`${title}: ${label}`}
                      defaultHint={t.priceBook.defaultValue}
                      invalidHint={t.priceBook.invalidValue}
                      disabled={disabled}
                      width="w-[58px]"
                      onChange={(raw) => onCell(id, raw, prices[idx])}
                    />
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
