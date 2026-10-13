// Calculator option selection: one index per option group. Prices are never stored in the
// selection - they are looked up in the live price book by index, so a selection re-prices
// itself whenever the book changes. Saved data keeps both the index and the value it was
// priced at (flat ItemInputs-style fields: `cert` + `certIdx`, ...).
import type { SteelType } from './calculatorData';
import {
  OPTION_GROUPS,
  OPTION_GROUP_SPECS,
  optionValue,
  resolveOptionIdx,
  type OptionGroup,
  type PriceBook,
} from './priceBook';

export type OptionSelection = Readonly<Record<OptionGroup, number>>;

/** Defaults of a freshly selected steel type (the same choices the calculator always had). */
export function defaultOptionSelection(type: SteelType): OptionSelection {
  return {
    tolerance: 0,
    cert: type === 'CR' || type === 'ZM' ? 0 : 1, // 2.2 for CR/ZM, 3.1 otherwise
    crProtection: 0,
    crPackaging: 1, // paperPlastic
    crSurface: 0,
    crFinish: 0, // normalFinish
    crWeld: 0, // allowed (-3)
    hdgProtection: 3, // CE
    hdgPackaging: 1, // paperPlastic
    hdgSurface: 0,
    hdgFinish: 0,
    hdgWeld: 0, // allowed (-3)
    zmProtection: 2, // CE
    zmPackaging: 1, // paperPlastic
    zmSurface: 0,
    zmWeld: 0, // allowed (-3)
    sscLenTol: 0,
    sscFlatness: 0,
    sscSurface: type === 'HRS' || type === 'PICKLED' ? 1 : 0, // improved for HRS/PICKLED
    sscMaxWeight: 4, // 2,5–3,5T (0)
    sscMarking: 0,
    sscEdging: 0,
    sscPacking: 0, // S01
    sscLabels: 0,
  };
}

/**
 * Restores a selection from saved flat fields (offer_data or ItemInputs). Each group takes its
 * stored index, else - for data saved before the price book - its value matched against the
 * code defaults; groups that cannot be resolved keep `fallback`.
 */
export function restoreOptionSelection(
  fallback: OptionSelection,
  type: SteelType,
  source: Readonly<Record<string, unknown>>
): OptionSelection {
  const next = { ...fallback };
  for (const group of OPTION_GROUPS) {
    const spec = OPTION_GROUP_SPECS[group];
    const idx = resolveOptionIdx(type, group, source[spec.idxField], source[spec.valueField]);
    if (idx !== null) next[group] = idx;
  }
  return next;
}

/** Flat `value` + `idx` fields of a selection priced from `book` (ItemInputs / offer_data shape). */
export function optionSelectionFields(
  book: PriceBook,
  type: SteelType,
  selection: OptionSelection
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const group of OPTION_GROUPS) {
    const spec = OPTION_GROUP_SPECS[group];
    out[spec.valueField] = optionValue(book, type, group, selection[group]);
    out[spec.idxField] = selection[group];
  }
  return out;
}
