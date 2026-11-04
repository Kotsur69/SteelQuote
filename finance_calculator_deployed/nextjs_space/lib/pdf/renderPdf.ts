// HTML -> PDF entry point. The renderer is chosen by PDF_RENDERER and loaded lazily, so a server
// on the Abacus renderer never touches puppeteer and a local one never calls Abacus.

export type PdfRendererName = 'abacus' | 'local';

/** A typo must fail loudly: falling back would quietly send offer data to the external service. */
export function resolvePdfRenderer(value: string | undefined): PdfRendererName {
  if (!value || value === 'abacus') return 'abacus';
  if (value === 'local') return 'local';
  throw new Error(`Unknown PDF_RENDERER "${value}": use "abacus" or "local"`);
}

export async function renderPdf(html: string): Promise<Buffer> {
  if (resolvePdfRenderer(process.env.PDF_RENDERER) === 'local') {
    const { renderWithLocalChromium } = await import('./localRenderer');
    return renderWithLocalChromium(html);
  }
  const { renderWithAbacus } = await import('./abacusRenderer');
  return renderWithAbacus(html);
}
