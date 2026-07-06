import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import fs from 'fs';
import path from 'path';

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
  quantity: number;
  pricePerTon: number;
  totalValue: number;
  results: { sumaHuta: number; sumaSSC: number; cenaKoncowa: number };
}

interface ClientInfo {
  firstName: string;
  lastName: string;
  company: string;
  address: string;
  nip: string;
  phone: string;
  email: string;
}

function getLogoBase64(): string {
  try {
    const logoPath = path.join(process.cwd(), 'public', 'logo.jpg');
    const logoBuffer = fs.readFileSync(logoPath);
    return `data:image/jpeg;base64,${logoBuffer.toString('base64')}`;
  } catch {
    return '';
  }
}

function buildHtml(
  items: OrderItem[],
  client: ClientInfo,
  offerName: string,
  offerDate: string,
  userName: string
): string {
  const logo = getLogoBase64();
  const totalTons = items.reduce((s, i) => s + i.quantity, 0);
  const totalValue = items.reduce((s, i) => s + i.pricePerTon * i.quantity, 0);

  const rows = items.map((item, idx) => {
    const dims = `${item.thickness} × ${item.width}${!item.isCoil ? ` × ${item.length}` : ''}`;
    const typeClass = item.steelType === 'HRS' ? '#3b82f6' : item.steelType === 'CR' ? '#8b5cf6' : '#10b981';
    return `
      <tr>
        <td style="text-align:center;font-weight:600;">${idx + 1}</td>
        <td>
          <div style="font-weight:600;font-size:11px;">${item.grade}</div>
          <div style="font-size:10px;color:#64748b;">${dims}${item.coating ? ' / ' + item.coating : ''}${item.isCoil ? ' (KRĄG)' : ''}</div>
        </td>
        <td style="text-align:center;"><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${typeClass};color:#fff;font-size:10px;font-weight:700;">${item.steelType}</span></td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${item.thickness.toFixed(2)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${item.width.toFixed(0)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${item.isCoil ? '-' : item.length.toFixed(0)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${item.quantity.toFixed(2)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;font-weight:600;">${item.pricePerTon.toFixed(2)}</td>
        <td style="text-align:right;font-family:'Courier New',monospace;">${(item.pricePerTon * item.quantity).toFixed(2)}</td>
        <td style="font-size:10px;color:#64748b;"></td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="UTF-8">
<style>
  @page { margin: 20mm 15mm 25mm 15mm; size: A4 landscape; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1e293b; line-height: 1.5; }
  .page { padding: 0; }
  .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px; padding-bottom: 16px; border-bottom: 3px solid #1e40af; }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .logo { width: 52px; height: 52px; border-radius: 12px; object-fit: cover; }
  .company-name { font-size: 18px; font-weight: 800; color: #1e40af; letter-spacing: 0.5px; }
  .company-sub { font-size: 10px; color: #64748b; margin-top: 2px; }
  .offer-meta { text-align: right; }
  .offer-meta .offer-title { font-size: 16px; font-weight: 700; color: #1e293b; }
  .offer-meta .meta-row { font-size: 10px; color: #64748b; margin-top: 3px; }
  .offer-meta .meta-val { font-weight: 600; color: #1e293b; }
  .info-grid { display: flex; gap: 24px; margin-bottom: 18px; }
  .info-block { flex: 1; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; }
  .info-block-title { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #1e40af; margin-bottom: 8px; }
  .info-row { font-size: 10px; margin-bottom: 3px; }
  .info-row .lbl { color: #64748b; display: inline-block; width: 70px; }
  .info-row .val { font-weight: 600; color: #1e293b; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  thead th { background: #1e40af; color: #fff; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 8px 10px; border: none; }
  thead th:first-child { border-radius: 6px 0 0 0; }
  thead th:last-child { border-radius: 0 6px 0 0; }
  tbody td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
  tbody tr:hover { background: #eff6ff; }
  tfoot td { padding: 10px; font-weight: 700; font-size: 12px; background: #1e293b; color: #fff; border: none; }
  tfoot td:first-child { border-radius: 0 0 0 6px; }
  tfoot td:last-child { border-radius: 0 0 6px 0; }
  .footer { margin-top: 24px; padding-top: 14px; border-top: 2px solid #e2e8f0; }
  .footer-notes { font-size: 10px; color: #64748b; line-height: 1.6; }
  .footer-notes li { margin-bottom: 2px; }
  .footer-sign { margin-top: 20px; display: flex; justify-content: space-between; }
  .sign-block { text-align: center; }
  .sign-line { width: 180px; border-top: 1px solid #94a3b8; margin-top: 40px; padding-top: 4px; font-size: 10px; color: #64748b; }
  .sign-name { font-weight: 600; color: #1e293b; font-size: 11px; }
  .badge-total { background: #059669; color: #fff; padding: 4px 12px; border-radius: 4px; font-weight: 700; font-size: 12px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="header-left">
      ${logo ? `<img src="${logo}" class="logo" alt="Logo">` : ''}
      <div>
        <div class="company-name">Steel Pricing Hub</div>
        <div class="company-sub">Kalkulator Dopłat Stalowych</div>
      </div>
    </div>
    <div class="offer-meta">
      <div class="offer-title">${offerName || 'Oferta cenowa'}</div>
      <div class="meta-row"><span class="lbl">Data: </span><span class="meta-val">${offerDate}</span></div>
      <div class="meta-row"><span class="lbl">Sporządził: </span><span class="meta-val">${userName || '-'}</span></div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-block">
      <div class="info-block-title">Odbiorca</div>
      ${client.company ? `<div class="info-row"><span class="lbl">Firma:</span><span class="val">${client.company}</span></div>` : ''}
      ${(client.firstName || client.lastName) ? `<div class="info-row"><span class="lbl">Osoba:</span><span class="val">${client.firstName} ${client.lastName}</span></div>` : ''}
      ${client.address ? `<div class="info-row"><span class="lbl">Adres:</span><span class="val">${client.address}</span></div>` : ''}
      ${client.nip ? `<div class="info-row"><span class="lbl">NIP:</span><span class="val">${client.nip}</span></div>` : ''}
      ${client.phone ? `<div class="info-row"><span class="lbl">Telefon:</span><span class="val">${client.phone}</span></div>` : ''}
      ${client.email ? `<div class="info-row"><span class="lbl">Email:</span><span class="val">${client.email}</span></div>` : ''}
    </div>
    <div class="info-block">
      <div class="info-block-title">Podsumowanie</div>
      <div class="info-row"><span class="lbl">Pozycji:</span><span class="val">${items.length}</span></div>
      <div class="info-row"><span class="lbl">Łącznie t:</span><span class="val">${totalTons.toFixed(2)} t</span></div>
      <div class="info-row"><span class="lbl">Wartość:</span><span class="val" style="color:#059669;font-size:12px;">${totalValue.toFixed(2)} €</span></div>
      <div class="info-row"><span class="lbl">Typy:</span><span class="val">${[...new Set(items.map(i => i.steelType))].join(', ')}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:35px;text-align:center;">Nr</th>
        <th style="text-align:left;">Gatunek / Opis</th>
        <th style="text-align:center;width:55px;">Typ</th>
        <th style="text-align:right;width:65px;">Grub. mm</th>
        <th style="text-align:right;width:65px;">Szer. mm</th>
        <th style="text-align:right;width:65px;">Dł. mm</th>
        <th style="text-align:right;width:60px;">Ilość t</th>
        <th style="text-align:right;width:75px;">Cena €/t</th>
        <th style="text-align:right;width:85px;">Wartość €</th>
        <th style="width:90px;">Uwagi</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6" style="text-align:right;text-transform:uppercase;letter-spacing:1px;font-size:10px;">RAZEM:</td>
        <td style="text-align:right;">${totalTons.toFixed(2)} t</td>
        <td style="text-align:right;"></td>
        <td style="text-align:right;"><span class="badge-total">${totalValue.toFixed(2)} €</span></td>
        <td></td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <ul class="footer-notes">
      <li>Ceny w EUR/t, bez podatku VAT.</li>
      <li>Faktura wystawiana na podstawie wagi brutto.</li>
      <li>Ważność oferty: 48h od daty wystawienia.</li>
      <li>Warunki płatności: wg ustaleń indywidualnych.</li>
      <li>Minimalna ilość: 5 ton na pozycję.</li>
      <li>Termin dostawy: po potwierdzeniu dostępności materiału.</li>
      <li>Tolerancja wagowa +/- 10%.</li>
    </ul>
    <div class="footer-sign">
      <div class="sign-block">
        <div class="sign-name">${userName || ''}</div>
        <div class="sign-line">Sporządził</div>
      </div>
      <div class="sign-block">
        <div class="sign-name">&nbsp;</div>
        <div class="sign-line">Akceptacja klienta</div>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { items, clientInfo, offerName, offerDate } = await request.json();
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'No items provided' }, { status: 400 });
    }

    const client: ClientInfo = clientInfo || { firstName: '', lastName: '', company: '', address: '', nip: '', phone: '', email: '' };
    const userName = session.user.name || session.user.email || '';
    const date = offerDate || new Date().toLocaleDateString('pl-PL');

    const html_content = buildHtml(items, client, offerName || '', date, userName);

    // Step 1: Create PDF request
    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content,
        pdf_options: { format: 'A4', landscape: true, print_background: true, margin: { top: '10mm', right: '10mm', bottom: '15mm', left: '10mm' } },
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
