// Odtwarza z zapisanych `inputs` pozycji zestawienia listę "Label: wartość" dla
// wszystkich dopłat huty i SSC — używane do wypełnienia kolumny "Uwagi" w PDF.
// Stare zapisane oferty (sprzed dodania `inputs`) nie mają tych danych — zwracamy [].
import type { Translations, Language } from './translations';
import {
  TOL_THICK_OPTIONS,
  CERT_OPTIONS,
  CR_PROTECTION_OPTIONS,
  HDG_PROTECTION_OPTIONS,
  SSC_MAX_WEIGHT_OPTIONS,
  SSC_PACKING_OPTIONS,
  getHutaSscToggleOptions,
  ItemInputs,
  SteelType,
} from './calculatorData';

function byValue<T extends { label: string; value: number }>(options: T[], value: number): T | undefined {
  return options.find(o => o.value === value);
}

function byIdx<T>(options: T[], idx: number): T | undefined {
  return options[idx];
}

export function buildItemNotes(
  type: SteelType,
  inputs: ItemInputs | undefined,
  t: Translations,
  language: Language
): string[] {
  if (!inputs) return [];

  const opts = getHutaSscToggleOptions(t, language);
  const lines: string[] = [];
  const push = (label: string, opt: { label: string } | undefined) => {
    if (opt) lines.push(`${label}: ${opt.label}`);
  };

  // Huta (mill) — wspólne dla wszystkich typów
  push(t.huta.thicknessTolerance, byIdx(TOL_THICK_OPTIONS[type], inputs.tolThickIdx));
  push(t.huta.certificate, byValue(CERT_OPTIONS, inputs.cert));

  if (type === 'HDG' && inputs.selectedCoating) {
    lines.push(`${t.huta.coating}: ${inputs.selectedCoating}`);
  }

  if (type === 'CR') {
    push(t.huta.protection, byValue(CR_PROTECTION_OPTIONS, inputs.crZabezp));
    push(t.huta.packaging, byIdx(opts.crPackaging, inputs.crOpakIdx));
    push(t.huta.surface, byValue(opts.crSurface, inputs.crPowierz));
    push(t.huta.surfaceFinish, byIdx(opts.crFinish, inputs.crWykonIdx));
    push(t.huta.weld, byValue(opts.crWeld, inputs.crZgrzew));
  }

  if (type === 'HDG') {
    push(t.huta.protection, byIdx(HDG_PROTECTION_OPTIONS, inputs.hdgZabezpIdx));
    push(t.huta.packaging, byIdx(opts.hdgPackaging, inputs.hdgOpakIdx));
    push(t.huta.surface, byValue(opts.hdgSurface, inputs.hdgPowierz));
    push(t.huta.surfaceFinish, byValue(opts.hdgFinish, inputs.hdgWykon));
    push(t.huta.weld, byValue(opts.hdgWeld, inputs.hdgZgrzew));
  }

  // SSC (processing) — wspólne dla wszystkich typów
  push(t.ssc.lengthTolerance, byValue(opts.lengthTolerance, inputs.sscLenTol));
  push(t.ssc.flatness, byValue(opts.flatness, inputs.sscFlatness));
  push(t.ssc.surface, byValue(opts.surface, inputs.sscSurface));
  push(t.ssc.maxPackWeight, byValue(SSC_MAX_WEIGHT_OPTIONS, inputs.sscMaxWeight));
  push(t.ssc.marking, byValue(opts.marking, inputs.sscMarking));
  push(t.ssc.edging, byValue(opts.edging, inputs.sscEdging));
  push(t.ssc.packaging, byIdx(SSC_PACKING_OPTIONS, inputs.sscPackingIdx));
  push(t.ssc.labels, byValue(opts.labels, inputs.sscLabels));

  return lines;
}

// Współdzielone przez wszystkie miejsca eksportu PDF (kalkulator, lista ofert handlowca,
// panel seniora, panel admina) — każde z nich woła downloadServerPdf z inną, luźno
// otypowaną wersją zapisanego offer_data.zestawienie, ale kształt danych jest ten sam.
export function attachNotesToZestawienie<T extends { type?: string; inputs?: ItemInputs }>(
  zestawienie: T[],
  t: Translations,
  language: Language
): (T & { notes: string[] })[] {
  return zestawienie.map(item => ({
    ...item,
    notes: buildItemNotes((item.type as SteelType) ?? 'HRS', item.inputs, t, language),
  }));
}
