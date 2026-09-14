// Klient: generowanie oferty PDF przez serwerowy endpoint /api/generate-pdf
// (bogaty render HTML -> PDF przez usluge Abacusa). Zastepuje klientowy jsPDF.

import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';
import { PDF_DATE_LOCALE } from '@/lib/pdfLabels';

interface ClientInfoLike {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  nip: string;
  phone: string;
  email: string;
}

interface ZestItem {
  type: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  tons: number;
  finalPrice: number;
  totalValue: number;
  sumaHuta?: number;
  sumaSSC?: number;
  isCoil?: boolean;
  coating?: string;
  notes?: string[];
}

export interface ServerPdfInput {
  offerName: string;
  offerId?: number | null;
  clientInfo: ClientInfoLike;
  zestawienie: ZestItem[];
  createdAt?: string;
  // Waluta oferty i kurs ZAMROZONY przy jej zapisie. Kwoty w zestawieniu sa zawsze w EUR;
  // przeliczenie robi serwer, tym kursem, a nie biezacym z ustawien.
  currency?: Currency;
  eurPlnRate?: number;
  // Język UI handlowca w momencie eksportu — PDF renderuje się w tym języku.
  language: Language;
  // Okres ważności oferty (Ważna od/do) wybrany w kalkulatorze — surowy string YYYY-MM-DD
  // z <input type="date">, formatowany na wyświetlanie niżej (ten sam wzorzec co
  // createdAt -> offerDate). Brak = PDF nie pokazuje dodatkowej linijki.
  validFrom?: string;
  validTo?: string;
}

/**
 * Formatuje surowy string YYYY-MM-DD na lokalną datę do wyświetlenia. Rozbijamy cyfry ręcznie
 * i budujemy Date z lokalnych składowych — NIE przez `new Date(string)`, który czyta datę jako
 * UTC północ i w strefach na zachód od UTC cofnąłby wyświetlany dzień o jeden.
 */
function formatDateOnly(value: string | undefined, locale: string): string | undefined {
  const match = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!match) return undefined;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString(locale);
}

// Mapuje pozycje zestawienia na ksztalt oczekiwany przez /api/generate-pdf,
// wola endpoint i pobiera zwrocony plik PDF. Rzuca Error z komunikatem przy bledzie.
export async function downloadServerPdf(input: ServerPdfInput): Promise<void> {
  const items = (input.zestawienie || []).map((it, idx) => ({
    id: String(idx + 1),
    steelType: it.type,
    grade: it.grade,
    thickness: it.thickness,
    width: it.width,
    length: it.length,
    isCoil: it.isCoil ?? false,
    coating: it.coating ?? '',
    notes: it.notes ?? [],
    quantity: it.tons,
    pricePerTon: it.finalPrice,
    totalValue: it.totalValue,
    results: {
      sumaHuta: it.sumaHuta ?? 0,
      sumaSSC: it.sumaSSC ?? 0,
      cenaKoncowa: it.finalPrice,
    },
  }));

  const dateLocale = PDF_DATE_LOCALE[input.language];
  const offerDate = input.createdAt
    ? new Date(input.createdAt).toLocaleDateString(dateLocale)
    : new Date().toLocaleDateString(dateLocale);
  const validFrom = formatDateOnly(input.validFrom, dateLocale);
  const validTo = formatDateOnly(input.validTo, dateLocale);

  const res = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      clientInfo: input.clientInfo,
      offerName: input.offerName,
      offerDate,
      currency: input.currency,
      eurPlnRate: input.eurPlnRate,
      language: input.language,
      validFrom,
      validTo,
    }),
  });

  if (!res.ok) {
    let msg = 'Nie udało się wygenerować PDF';
    try {
      const j = await res.json();
      msg = j?.error || msg;
    } catch {
      /* body nie jest JSON-em */
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (input.offerName || 'oferta').replace(/[^\w.-]+/g, '_');
  a.download = `${safeName}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
