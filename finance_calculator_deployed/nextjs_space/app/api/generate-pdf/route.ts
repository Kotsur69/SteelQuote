import { NextResponse } from 'next/server';
import pool from '@/lib/db';
import { requireAccess, requireSuperuser } from '@/lib/access/context';
import { loadVisibleOffer } from '@/lib/access/offerAccess';
import type { AccessContext } from '@/lib/access/types';
import { isCurrency, sanitizeRate, DEFAULT_CURRENCY, type Currency } from '@/lib/currency';
import { isLanguage, type Language } from '@/lib/translations';
import { PDF_LABELS, PDF_DATE_LOCALE } from '@/lib/pdfLabels';
import { fixedGrouped } from '@/lib/numberFormat';
import { resolveQuoteValidityHours, sanitizeQuoteValidityHours } from '@/lib/quoteValidity';
import fs from 'fs';
import path from 'path';

// Wszystkie pola ponizej (nazwa oferty, dane klienta, gatunek stali) to wolny
// tekst od uzytkownika i trafiaja do HTML wysylanego do zewnetrznej uslugi
// Abacusa (HTML -> PDF, prawdopodobnie headless-Chrome). Bez escapowania ktos
// wpisujac np. "<img src=x onerror=...>" w polu Firma dostalby wykonanie JS
// wewnatrz tej uslugi. Escapuj KAZDA wartosc user-input przed wstawieniem do HTML.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const dynamic = 'force-dynamic';

interface OrderItem {
  id: string;
  steelType: string;
  grade: string;
  thickness: number;
  width: number;
  length: number;
  isCoil: boolean;
  coating: string;
  notes?: string[];
  quantity: number;
  pricePerTon: number;
  totalValue: number;
  results: { sumaHuta: number; sumaSSC: number; cenaKoncowa: number };
}

// Lokalna kopia kształtu z lib/pdfGenerator.ts. Trasa generowania PDF-a jest
// świadomie samodzielna (renderuje HTML po stronie serwera), ale POLA MUSZĄ
// nadążać za tamtym typem — inaczej nowe dane cicho wypadają z oferty klienta.
interface ClientInfo {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  nip: string;
  sapId: string;
  phone: string;
  email: string;
}

// Brand assets for the offer PDF (AM branding policy: colour logo top-right, Gilroy, AM colours).
// Embedded as data URIs because the HTML goes to an external renderer that cannot reach us.
function readAsDataUri(relPath: string, mime: string): string {
  try {
    const buffer = fs.readFileSync(path.join(process.cwd(), 'public', relPath));
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error(`PDF asset missing: ${relPath}`, error);
    return '';
  }
}

function brandFontFaces(): string {
  return ([['GilroyW05-Regular.woff2', 400], ['GilroyW05-SemiBold.woff2', 600]] as const)
    .map(([file, weight]) => {
      const uri = readAsDataUri(`brand/fonts/${file}`, 'font/woff2');
      return uri ? `@font-face{font-family:Gilroy;src:url(${uri}) format('woff2');font-weight:${weight}}` : '';
    })
    .join('');
}

// Steel type badges in AM colours (Template 8). Unknown types fall back to the muted grey.
const TYPE_COLORS: Record<string, string> = {
  HRS: '#7F1878', CR: '#C12974', HDG: '#E74341', PICKLED: '#F58847', TEARDROP: '#414141', ZM: '#8a8a8a',
};

// Uwagi as running text: "Key: value" notes become a muted key + bold value, joined by dots.
function notesFlowHtml(notes: string[]): string {
  const parts = notes.map((note) => {
    const sep = note.indexOf(': ');
    if (sep === -1) return `<b>${escapeHtml(note)}</b>`;
    return `<span class="k">${escapeHtml(note.slice(0, sep))}:</span>&nbsp;<b>${escapeHtml(note.slice(sep + 2))}</b>`;
  });
  return `<div class="nf">${parts.map((p) => `<span class="nfi">${p}</span>`).join(' ')}</div>`;
}

// Offer PDF = Template 8 ("O_kompakt_pion_ciemny", Szablony PDF/Template 8): portrait, dense,
// dark table header, gradient rule under the header. Content is the same as before - only layout
// and branding changed.
function buildHtml(
  items: OrderItem[],
  client: ClientInfo,
  offerName: string,
  offerDate: string,
  userName: string,
  currency: Currency,
  eurPlnRate: number,
  language: Language,
  validFrom?: string,
  validTo?: string,
  paymentTermDays?: number,
  quoteValidityHours?: number
): string {
  const logo = readAsDataUri('brand/logo-color.svg', 'image/svg+xml');
  const L = PDF_LABELS[language];

  // Kwoty w pozycjach są zawsze w EUR (tak liczy kalkulator). Do PDF przeliczamy je
  // kursem PRZYSŁANYM W ŻĄDANIU — to kurs zamrożony w ofercie, nie bieżący z bazy.
  // Dzięki temu PDF wygenerowany po zmianie kursu przez admina pokazuje te same kwoty,
  // które klient widział przy wysyłce oferty.
  const isPln = currency === 'PLN';
  const fx = isPln ? eurPlnRate : 1;
  const unit = isPln ? 'zł' : '€';

  // Thousands grouping in the PDF uses the ASCII &nbsp; entity: the HTML -> PDF service is
  // external, so stay with a glyph every renderer and font is guaranteed to have.
  const num = (value: number, decimals: number) => fixedGrouped(value, decimals, '&nbsp;');
  const ceilNum = (value: number) => num(Math.ceil(value), 0);

  const totalTons = items.reduce((s, i) => s + i.quantity, 0);
  const totalValue = items.reduce((s, i) => s + i.pricePerTon * i.quantity, 0) * fx;

  const rows = items.map((item, idx) => {
    const dims = `${item.thickness} × ${item.width}${!item.isCoil ? ` × ${item.length}` : ''}`;
    const typeColor = TYPE_COLORS[item.steelType] ?? '#6f6a66';
    return `
      <tr>
        <td class="c g">${idx + 1}</td>
        <td>
          <div class="g">${escapeHtml(item.grade)}</div>
          <div class="ds">${dims}${item.coating ? ' / ' + escapeHtml(item.coating) : ''}${item.isCoil ? ' ' + L.coilSuffix : ''}</div>
        </td>
        <td class="c"><span class="tb" style="background:${typeColor}">${escapeHtml(item.steelType)}</span></td>
        <td class="r n">${item.thickness.toFixed(2)}</td>
        <td class="r n">${item.width.toFixed(0)}</td>
        <td class="r n">${item.isCoil ? '-' : item.length.toFixed(0)}</td>
        <td class="r n">${num(item.quantity, 2)}</td>
        <td class="r n g">${ceilNum(item.pricePerTon * fx)}</td>
        <td class="r n">${ceilNum(item.pricePerTon * item.quantity * fx)}</td>
        <td class="nt">${notesFlowHtml(item.notes ?? [])}</td>
      </tr>`;
  }).join('');

  // Wspólny <colgroup> dla tabeli pozycji i tabeli podsumowania — muszą mieć
  // identyczne szerokości kolumn, żeby "RAZEM" wizualnie wyrównywało się z
  // kolumnami powyżej mimo że to teraz DWIE osobne tabele (patrz niżej, dlaczego).
  const colgroup = `<colgroup>
    <col style="width:22px"><col style="width:96px"><col style="width:56px"><col style="width:40px"><col style="width:40px">
    <col style="width:40px"><col style="width:48px"><col style="width:50px"><col style="width:62px"><col>
  </colgroup>`;

  const infoRow = (label: string, value: string) => `<div class="ir"><span class="l">${label}</span><span class="v">${value}</span></div>`;
  const clientRows = [
    client.company ? infoRow(L.companyLabel, escapeHtml(client.company)) : '',
    (client.firstName || client.lastName) ? infoRow(L.personLabel, `${escapeHtml(client.firstName)} ${escapeHtml(client.lastName)}`) : '',
    client.address ? infoRow(L.addressLabel, escapeHtml(client.address)) : '',
    client.nip ? infoRow(L.taxIdLabel, escapeHtml(client.nip)) : '',
    client.sapId ? infoRow(L.sapIdLabel, escapeHtml(client.sapId)) : '',
    client.phone ? infoRow(L.phoneLabel, escapeHtml(client.phone)) : '',
    client.email ? infoRow(L.emailLabel, escapeHtml(client.email)) : '',
  ].join('');
  const summaryRows = [
    infoRow(L.itemsLabel, String(items.length)),
    infoRow(L.totalTonsLabel, `<span class="n">${num(totalTons, 2)} t</span>`),
    infoRow(L.valueLabel, `<span class="hlv n">${ceilNum(totalValue)} ${unit}</span>`),
    infoRow(L.typesLabel, escapeHtml([...new Set(items.map(i => i.steelType))].join(', '))),
  ].join('');

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
<meta charset="UTF-8">
<style>
  ${brandFontFaces()}
  :root { --ink:#414141; --mut:#6f6a66; --line:#e7e2dd; --soft:#f7f4f1; --or:#ff3700;
    --grad:linear-gradient(90deg,#7F1878 0%,#C12974 35%,#E74341 68%,#F58847 100%); }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: A4 portrait; margin: 10mm 10mm 12mm 10mm; }
  body { font-family: Gilroy, Arial, sans-serif; color: var(--ink); font-size: 8.5pt; line-height: 1.35; }
  .g { font-weight: 600; } .c { text-align: center; } .r { text-align: right; }
  .n { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .hd { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 8px; margin-bottom: 8px; position: relative; }
  .hd:after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 3px; background: var(--grad); border-radius: 2px; }
  .brand { text-align: right; } .brand .logo { height: 34px; display: block; margin-left: auto; }
  .brand .sub { font-size: 7.5pt; color: var(--mut); margin-top: 4px; }
  .meta .title { font-size: 16pt; font-weight: 600; line-height: 1.15; }
  .mr { font-size: 7.8pt; color: var(--mut); margin-top: 1px; } .mr b { color: var(--ink); font-weight: 600; }
  .info { display: flex; gap: 10px; margin-bottom: 8px; }
  .ib { flex: 1; background: var(--soft); border-radius: 6px; padding: 6px 10px; }
  .ib:first-child { flex: 1.7; } .ib:first-child .rows { columns: 2; column-gap: 12px; }
  .ibt { font-size: 6.8pt; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--or); margin-bottom: 4px; }
  .ir { font-size: 7.8pt; margin-bottom: 1px; display: flex; break-inside: avoid; }
  .ir .l { color: var(--mut); width: 56px; flex: none; } .ir .v { font-weight: 600; }
  .hlv { color: var(--or); font-size: 9.5pt; }
  table { width: 100%; table-layout: fixed; border-collapse: collapse; }
  th { font-size: 6.4pt; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; padding: 5px 4px; text-align: left; line-height: 1.2; background: var(--ink); color: #fff; }
  th.r { text-align: right; } th.c { text-align: center; }
  thead th:first-child { border-radius: 5px 0 0 0; } thead th:last-child { border-radius: 0 5px 0 0; }
  .it td { padding: 4px 4px; vertical-align: top; border-bottom: 1px solid var(--line); }
  .it tr { break-inside: avoid; page-break-inside: avoid; }
  .ds { font-size: 7.2pt; color: var(--mut); }
  .tb { display: inline-block; padding: 1px 5px; border-radius: 3px; color: #fff; font-size: 6.6pt; font-weight: 600; letter-spacing: .3px; white-space: nowrap; }
  .nt { font-size: 6.8pt; line-height: 1.35; color: var(--mut); }
  .nf b { color: var(--ink); font-weight: 600; } .nfi { white-space: nowrap; } .nfi:not(:last-child):after { content: ' ·'; color: #c9c2bb; }
  .tot { break-inside: avoid; page-break-inside: avoid; border-collapse: separate; border-spacing: 0; }
  .tot td { padding: 6px 4px; font-weight: 600; white-space: nowrap; background: var(--soft); }
  .tot td:first-child { border-radius: 0 0 0 5px; } .tot td:last-child { border-radius: 0 0 5px 0; }
  .tl { font-size: 7pt; letter-spacing: 1px; text-transform: uppercase; }
  .bt { display: inline-block; padding: 2px 9px; border-radius: 3px; background: var(--or); color: #fff; font-size: 9.5pt; }
  .ft { margin-top: 9px; padding-top: 8px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; gap: 20px; break-inside: avoid; page-break-inside: avoid; }
  .ft ul { flex: 1; list-style: none; font-size: 7.4pt; color: var(--mut); line-height: 1.55; columns: 2; column-gap: 16px; }
  .ft ul li { break-inside: avoid; }
  .sg { display: flex; gap: 22px; align-items: flex-end; } .sg > div { width: 150px; text-align: center; }
  .sn { font-weight: 600; font-size: 8pt; }
  .sl { border-top: 1px solid #b8b1ab; margin-top: 28px; padding-top: 3px; font-size: 7.2pt; color: var(--mut); }
</style>
</head>
<body>
  <div class="hd">
    <div class="meta">
      <div class="title">${escapeHtml(offerName) || L.defaultOfferTitle}</div>
      <div class="mr">${L.dateLabel} <b>${escapeHtml(offerDate)}</b></div>
      <div class="mr">${L.preparedByLabel} <b>${escapeHtml(userName) || '-'}</b></div>
    </div>
    <div class="brand">
      ${logo ? `<img class="logo" src="${logo}" alt="ArcelorMittal">` : '<div class="title">ArcelorMittal</div>'}
      <div class="sub">${L.companySub}</div>
    </div>
  </div>

  <div class="info">
    <div class="ib"><div class="ibt">${L.recipientTitle}</div><div class="rows">${clientRows}</div></div>
    <div class="ib"><div class="ibt">${L.summaryTitle}</div><div class="rows">${summaryRows}</div></div>
  </div>

  <table class="it">
    ${colgroup}
    <thead>
      <tr>
        <th class="c">${L.colNo}</th>
        <th>${L.colDesc}</th>
        <th class="c">${L.colType}</th>
        <th class="r">${L.colThickness}</th>
        <th class="r">${L.colWidth}</th>
        <th class="r">${L.colLength}</th>
        <th class="r">${L.colQty}</th>
        <th class="r">${L.colPrice} ${unit}/t</th>
        <th class="r">${L.colValue} ${unit}</th>
        <th>${L.colNotes}</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <!-- Podsumowanie jako OSOBNA tabela (nie <tfoot> tej samej tabeli) — silnik
       druku Chrome powtarza <thead>/<tfoot> na KAŻDEJ stronie, na którą tabela
       się rozleje. Jako osobny element idzie w flow strony jednorazowo, tuż po
       ostatnim wierszu pozycji, niezależnie od tego ile stron zajęły pozycje. -->
  <table class="tot">
    ${colgroup}
    <tbody>
      <tr>
        <td colspan="6" class="r tl">${L.totalRowLabel}</td>
        <td class="r n">${num(totalTons, 2)} t</td>
        <td></td>
        <td class="r"><span class="bt n">${ceilNum(totalValue)} ${unit}</span></td>
        <td></td>
      </tr>
    </tbody>
  </table>

  <div class="ft">
    <ul>
      <li>${L.pricesNote(isPln ? 'PLN' : 'EUR')}</li>
      ${isPln ? `<li>${L.rateNote(eurPlnRate.toFixed(4).replace(/0+$/, '').replace(/\.$/, ''))}</li>` : ''}
      <li>${L.invoiceNote}</li>
      ${validFrom && validTo ? `<li>${escapeHtml(L.validityRangeNote(validFrom, validTo))}</li>` : ''}
      ${quoteValidityHours !== undefined ? `<li>${escapeHtml(L.validityHoursNote(quoteValidityHours))}</li>` : ''}
      <li>${
        typeof paymentTermDays === 'number'
          ? paymentTermDays === 0
            ? L.paymentPrepaymentNote
            : escapeHtml(L.paymentTermDaysNote(paymentTermDays))
          : L.paymentNote
      }</li>
      <li>${L.minQuantityNote}</li>
      <li>${L.deliveryNote}</li>
      <li>${L.toleranceNote}</li>
    </ul>
    <div class="sg">
      <div><div class="sn">${escapeHtml(userName)}</div><div class="sl">${L.signPreparedBy}</div></div>
      <div><div class="sn">&nbsp;</div><div class="sl">${L.signClientAcceptance}</div></div>
    </div>
  </div>
</body>
</html>`;
}

/** Email of the offer's creator when the caller may see that offer, else null. */
async function offerCreatorEmail(ctx: AccessContext, offerId: unknown): Promise<string | null> {
  const id = typeof offerId === 'number' ? offerId : Number.NaN;
  if (!Number.isInteger(id) || id <= 0) return null;
  const offer = await loadVisibleOffer(ctx, id);
  if (!offer || offer.user_id === null) return null;
  const owner = await pool.query(`SELECT email FROM users WHERE id = $1`, [offer.user_id]);
  return typeof owner.rows[0]?.email === 'string' ? owner.rows[0].email : null;
}

export async function POST(request: Request) {
  try {
    const auth = await requireAccess();
    if ('error' in auth) {
      return auth.error;
    }
    const session = auth.ctx;

    const { items, clientInfo, offerName, offerDate, currency, eurPlnRate, language, validFrom, validTo, paymentTermDays, quoteValidityHours, offerId } = await request.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const client: ClientInfo = clientInfo || { firstName: '', lastName: '', company: '', address: '', nip: '', sapId: '', phone: '', email: '' };
    // A saved offer is always signed by its creator - an approver or admin downloading it must
    // not appear as the author (the offer and its client contact belong to the salesperson).
    const userName = (await offerCreatorEmail(session, offerId)) ?? session.email ?? '';
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

    const html_content = buildHtml(items, client, offerName || '', date, userName, pdfCurrency, pdfRate, pdfLanguage, validFromStr, validToStr, paymentTermDaysNum, quoteValidityHoursNum);

    // Step 1: Create PDF request
    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content,
        // Portrait, margins equal to the @page rule of Template 8 in buildHtml.
        pdf_options: { format: 'A4', landscape: false, print_background: true, margin: { top: '10mm', right: '10mm', bottom: '12mm', left: '10mm' } },
        base_url: process.env.NEXTAUTH_URL || '',
      }),
    });

    if (!createResponse.ok) {
      const err = await createResponse.json().catch(() => ({ error: 'PDF request failed' }));
      console.error('PDF create error:', err);
      return NextResponse.json({ success: false, error: err.error || 'PDF request failed' }, { status: 500 });
    }

    const { request_id } = await createResponse.json();
    if (!request_id) {
      return NextResponse.json({ success: false, error: 'No request ID' }, { status: 500 });
    }

    // Step 2: Poll for completion
    const maxAttempts = 120;
    let attempts = 0;
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
      });
      const statusResult = await statusResponse.json();
      const status = statusResult?.status || 'FAILED';
      const result = statusResult?.result || null;

      if (status === 'SUCCESS') {
        if (result && result.result) {
          const pdfBuffer = Buffer.from(result.result, 'base64');
          return new NextResponse(pdfBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="oferta_${Date.now()}.pdf"`,
            },
          });
        }
        return NextResponse.json({ success: false, error: 'PDF generated but no data' }, { status: 500 });
      } else if (status === 'FAILED') {
        const errorMsg = result?.error || 'PDF generation failed';
        console.error('PDF generation failed:', errorMsg);
        return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
      }
      attempts++;
    }

    return NextResponse.json({ success: false, error: 'PDF generation timed out' }, { status: 500 });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate PDF' }, { status: 500 });
  }
}
