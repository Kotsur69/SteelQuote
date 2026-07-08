// Klient: generowanie oferty PDF przez serwerowy endpoint /api/generate-pdf
// (bogaty render HTML -> PDF przez usluge Abacusa). Zastepuje klientowy jsPDF.

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
}

export interface ServerPdfInput {
  offerName: string;
  offerId?: number | null;
  clientInfo: ClientInfoLike;
  zestawienie: ZestItem[];
  createdAt?: string;
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
    quantity: it.tons,
    pricePerTon: it.finalPrice,
    totalValue: it.totalValue,
    results: {
      sumaHuta: it.sumaHuta ?? 0,
      sumaSSC: it.sumaSSC ?? 0,
      cenaKoncowa: it.finalPrice,
    },
  }));

  const offerDate = input.createdAt
    ? new Date(input.createdAt).toLocaleDateString('pl-PL')
    : new Date().toLocaleDateString('pl-PL');

  const res = await fetch('/api/generate-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      items,
      clientInfo: input.clientInfo,
      offerName: input.offerName,
      offerDate,
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
