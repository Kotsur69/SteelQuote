import { PdfRenderError } from './errors';
import { PDF_MARGIN } from './pageOptions';

const ABACUS_API = 'https://apps.abacus.ai/api';
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 120;

export async function renderWithAbacus(html: string): Promise<Buffer> {
  const createResponse = await fetch(`${ABACUS_API}/createConvertHtmlToPdfRequest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deployment_token: process.env.ABACUSAI_API_KEY,
      html_content: html,
      pdf_options: { format: 'A4', landscape: false, print_background: true, margin: PDF_MARGIN },
      base_url: process.env.NEXTAUTH_URL || '',
    }),
  });

  if (!createResponse.ok) {
    const err = await createResponse.json().catch(() => ({ error: 'PDF request failed' }));
    console.error('PDF create error:', err);
    throw new PdfRenderError(err.error || 'PDF request failed');
  }

  const { request_id } = await createResponse.json();
  if (!request_id) throw new PdfRenderError('No request ID');

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const statusResponse = await fetch(`${ABACUS_API}/getConvertHtmlToPdfStatus`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY }),
    });
    const statusResult = await statusResponse.json();
    const status = statusResult?.status || 'FAILED';
    const result = statusResult?.result || null;

    if (status === 'SUCCESS') {
      if (result?.result) return Buffer.from(result.result, 'base64');
      throw new PdfRenderError('PDF generated but no data');
    }
    if (status === 'FAILED') {
      const errorMsg = result?.error || 'PDF generation failed';
      console.error('PDF generation failed:', errorMsg);
      throw new PdfRenderError(errorMsg);
    }
  }

  throw new PdfRenderError('PDF generation timed out');
}
