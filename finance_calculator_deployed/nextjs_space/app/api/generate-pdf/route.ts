import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess } from '@/lib/access/context';
import { loadVisibleOffer } from '@/lib/access/offerAccess';
import { offerNumberLabel } from '@/lib/offerVersions';
import type { AccessContext } from '@/lib/access/types';
import { isCurrency, sanitizeRate, DEFAULT_CURRENCY, type Currency } from '@/lib/currency';
import { isLanguage, type Language } from '@/lib/translations';
import { PDF_DATE_LOCALE } from '@/lib/pdfLabels';
import { resolveQuoteValidityHours, sanitizeQuoteValidityHours } from '@/lib/quoteValidity';
import { sanitizeOfferTermKeys } from '@/lib/offerTerms';
import { buildOfferHtml, type ClientInfo } from '@/lib/pdf/offerHtml';
import { renderPdf } from '@/lib/pdf/renderPdf';
import { PdfRenderError } from '@/lib/pdf/errors';

export const dynamic = 'force-dynamic';

interface SavedOfferMeta {
  creatorEmail: string | null;
  // "offer_30.2" - the number the client quotes when ordering (terms, point 2).
  numberLabel: string | null;
}

/** Creator email and offer number of a saved offer the caller may see; nulls otherwise. */
async function savedOfferMeta(ctx: AccessContext, offerId: unknown): Promise<SavedOfferMeta> {
  const none: SavedOfferMeta = { creatorEmail: null, numberLabel: null };
  const id = typeof offerId === 'number' ? offerId : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) return none;
  const offer = await loadVisibleOffer(ctx, id);
  if (!offer) return none;
  const numberLabel = offerNumberLabel(offer);
  if (offer.user_id === null) return { creatorEmail: null, numberLabel };
  const owner = await pool.query(`SELECT email FROM users WHERE id = $1`, [offer.user_id]);
  const creatorEmail = typeof owner.rows[0]?.email === 'string' ? owner.rows[0].email : null;
  return { creatorEmail, numberLabel };
}

export async function POST(request: Request) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) {
      return auth.error;
    }
    const session = auth.ctx;

    const { items, clientInfo, offerDate, currency, eurPlnRate, language, validFrom, validTo, paymentTermDays, quoteValidityHours, offerTerms, offerId } = await request.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const client: ClientInfo = clientInfo || { firstName: '', lastName: '', company: '', address: '', nip: '', sapId: '', phone: '', email: '' };
    // A saved offer is always signed by its creator - an approver or admin downloading it must
    // not appear as the author (the offer and its client contact belong to the salesperson).
    const savedMeta = await savedOfferMeta(session, offerId);
    const userName = savedMeta.creatorEmail ?? session.email ?? '';
    // Brak/nieznany język (stare wywołanie) => polski, tak jak dotąd zachowywał się PDF.
    const pdfLanguage: Language = isLanguage(language) ? language : 'pl';
    const date = offerDate || new Date().toLocaleDateString(PDF_DATE_LOCALE[pdfLanguage]);

    // Waluta i kurs przychodzą z klienta (kurs zamrożony w ofercie). Sanityzujemy je,
    // bo zepsuty kurs w payloadzie zawyżyłby wszystkie kwoty w PDF wysłanym do klienta.
    // Brak pól = stare wywołanie => EUR, czyli zachowanie sprzed tej zmiany.
    const pdfCurrency: Currency = isCurrency(currency) ? currency : DEFAULT_CURRENCY;
    const pdfRate = sanitizeRate(eurPlnRate);

    // Zakres "okresu ważności oferty" — opcjonalny, już sformatowany string od klienta
    // (ten sam wzorzec co `offerDate` powyżej). Puste/brak = linijka po prostu się nie pojawia.
    const validFromStr: string | undefined = typeof validFrom === 'string' && validFrom ? validFrom : undefined;
    const validToStr: string | undefined = typeof validTo === 'string' && validTo ? validTo : undefined;
    // Termin płatności jako liczba dni (przyciski 0/15/30/45/60/90 + "Inny" w kalkulatorze) —
    // spoza sensownego zakresu (literówka, zepsuty payload) traktujemy jak brak wyboru,
    // tak samo jak sanitizeRate wyżej dla kursu.
    const paymentTermDaysNum: number | undefined =
      typeof paymentTermDays === 'number' && Number.isFinite(paymentTermDays) && paymentTermDays >= 0 && paymentTermDays <= 365
        ? paymentTermDays
        : undefined;
    // Quote validity hours; a payload without the field (older caller) keeps the legacy
    // days x 24 line, same as resolveQuoteValidityHours does for saved offers.
    const quoteValidityHoursNum: number | undefined =
      sanitizeQuoteValidityHours(resolveQuoteValidityHours({ quoteValidityHours, paymentTermDays: paymentTermDaysNum }));

    const html = buildOfferHtml(items, client, date, userName, savedMeta.numberLabel, pdfCurrency, pdfRate, pdfLanguage, {
      validFrom: validFromStr,
      validTo: validToStr,
      paymentTermDays: paymentTermDaysNum,
      quoteValidityHours: quoteValidityHoursNum,
      offerTerms: sanitizeOfferTermKeys(offerTerms),
    });

    const pdfBuffer = await renderPdf(html);
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="oferta_${Date.now()}.pdf"`,
      },
    });
  } catch (error) {
    if (error instanceof PdfRenderError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    console.error('Error generating PDF:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate PDF' }, { status: 500 });
  }
}
