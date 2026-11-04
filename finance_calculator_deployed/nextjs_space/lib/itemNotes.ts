// Odtwarza z zapisanych `inputs` pozycji zestawienia listę "Label: wartość" dla
// wszystkich dopłat huty i SSC — używane do wypełnienia kolumny "Uwagi" w PDF.
// Stare zapisane oferty (sprzed dodania `inputs`) nie mają tych danych — zwracamy [].
import type { Translations, Language } from './translations';
import {
  TOL_THICK_OPTIONS,
  CERT_OPTIONS,
  CR_PROTECTION_OPTIONS,
  HDG_PROTECTION_OPTIONS,
  ZM_PROTECTION_OPTIONS,
  SSC_MAX_WEIGHT_OPTIONS,
  getHutaSscToggleOptions,
  ItemInputs,
  SteelType,
} from './calculatorData';
import { OPTION_GROUP_SPECS, resolveOptionIdx, type OptionGroup } from './priceBook';
import {
  asSteelType,
  itemTermKeys,
  offerTermKeys,
  packagingDescription,
  type DeliveryRoute,
  type ItemTermKeys,
} from './offerTerms';

export type { DeliveryRoute } from './offerTerms';

// Labels only - prices never appear in the notes. The option is picked by its stored index;
// items saved before the price book are matched by value against the CODE DEFAULTS, never the
// live price book, so a later price change cannot alter the PDF text of a saved offer.
function pick<T>(type: SteelType, inputs: ItemInputs, group: OptionGroup, options: T[]): T | undefined {
  const spec = OPTION_GROUP_SPECS[group];
  const idx = resolveOptionIdx(type, group, inputs[spec.idxField], inputs[spec.valueField]);
  return idx === null ? undefined : options[idx];
}

export function buildItemNotes(
  type: SteelType,
  inputs: ItemInputs | undefined,
  t: Translations,
  language: Language,
  route?: DeliveryRoute,
  // Offer-level terms printed once in the PDF terms block (lib/offerTerms.ts). An item whose
  // certificate / SSC packaging / delivery term equals it leaves that line out of its notes.
  offerTerms: ItemTermKeys = {}
): string[] {
  if (!inputs) return [];

  const opts = getHutaSscToggleOptions(t, language);
  const own = itemTermKeys(type, inputs, route);
  const lines: string[] = [];
  const push = (label: string, opt: { label: string } | undefined) => {
    if (opt) lines.push(`${label}: ${opt.label}`);
  };

  // Delivery terms first, but only when they differ from the offer's terms. DAP names the
  // offer's delivery address; FCA (place agreed with the client) and CPT (description still to
  // come) stay bare. Offer-wide self pickup = FCA for every item. Items saved before this field
  // have no line.
  const term = own.incoterm;
  if (term && term !== offerTerms.incoterm) {
    const place = term === 'DAP' ? route?.destAddress?.trim() ?? '' : '';
    lines.push(`${t.summary.delivery}: ${term}${place ? ` ${place}` : ''}`);
  }

  const p = <T,>(group: OptionGroup, options: T[]) => pick(type, inputs, group, options);

  // Huta (mill) — wspólne dla wszystkich typów
  push(t.huta.thicknessTolerance, p('tolerance', TOL_THICK_OPTIONS[type]));
  if (own.cert !== offerTerms.cert) push(t.huta.certificate, p('cert', CERT_OPTIONS));

  if ((type === 'HDG' || type === 'ZM') && inputs.selectedCoating) {
    lines.push(`${t.huta.coating}: ${inputs.selectedCoating}`);
  }

  if (type === 'CR') {
    push(t.huta.protection, p('crProtection', CR_PROTECTION_OPTIONS));
    push(t.huta.packaging, p('crPackaging', opts.crPackaging));
    push(t.huta.surface, p('crSurface', opts.crSurface));
    push(t.huta.surfaceFinish, p('crFinish', opts.crFinish));
    push(t.huta.weld, p('crWeld', opts.crWeld));
  }

  if (type === 'HDG') {
    push(t.huta.protection, p('hdgProtection', HDG_PROTECTION_OPTIONS));
    push(t.huta.packaging, p('hdgPackaging', opts.hdgPackaging));
    push(t.huta.surface, p('hdgSurface', opts.hdgSurface));
    push(t.huta.surfaceFinish, p('hdgFinish', opts.hdgFinish));
    push(t.huta.weld, p('hdgWeld', opts.hdgWeld));
  }

  // ZM: bez osobnego "wykonania" (finish) — tylko 4 grupy dopłat, jak w Calculator.tsx
  if (type === 'ZM') {
    push(t.huta.protection, p('zmProtection', ZM_PROTECTION_OPTIONS));
    push(t.huta.packaging, p('zmPackaging', opts.zmPackaging));
    push(t.huta.surface, p('zmSurface', opts.zmSurface));
    push(t.huta.weld, p('zmWeld', opts.zmWeld));
  }

  // SSC (processing) — wspólne dla wszystkich typów
  push(t.ssc.lengthTolerance, p('sscLenTol', opts.lengthTolerance));
  push(t.ssc.flatness, p('sscFlatness', opts.flatness));
  push(t.ssc.surface, p('sscSurface', opts.surface));
  push(t.ssc.maxPackWeight, p('sscMaxWeight', SSC_MAX_WEIGHT_OPTIONS));
  push(t.ssc.marking, p('sscMarking', opts.marking));
  push(t.ssc.edging, p('sscEdging', opts.edging));
  // Packaging prints its description (the UI hover text), not the S01..SB3 code.
  const packing = own.packing === undefined ? undefined : packagingDescription(t, own.packing);
  if (packing && own.packing !== offerTerms.packing) lines.push(`${t.ssc.packaging}: ${packing}`);
  push(t.ssc.labels, p('sscLabels', opts.labels));

  // Komentarz do dopłaty dodatkowej — tylko gdy handlowiec jawnie zaznaczył, że ma
  // trafić do PDF (opt-in), i tylko gdy dopłata faktycznie jest niezerowa.
  if (inputs.extra !== 0 && inputs.extraCommentInPdf && inputs.extraComment?.trim()) {
    lines.push(`${t.summary.extra}: ${inputs.extraComment.trim()}`);
  }

  return lines;
}

// Współdzielone przez wszystkie miejsca eksportu PDF (kalkulator, lista ofert handlowca,
// panel seniora, panel admina) — każde z nich woła downloadServerPdf z inną, luźno
// otypowaną wersją zapisanego offer_data.zestawienie, ale kształt danych jest ten sam.
// The offer-level terms are computed from the same items, so the notes only list exceptions.
export function attachNotesToZestawienie<T extends { type?: string; inputs?: ItemInputs }>(
  zestawienie: T[],
  t: Translations,
  language: Language,
  route?: DeliveryRoute
): (T & { notes: string[] })[] {
  const offerTerms = offerTermKeys(zestawienie, route);
  return zestawienie.map(item => ({
    ...item,
    notes: buildItemNotes(asSteelType(item.type), item.inputs, t, language, route, offerTerms),
  }));
}
