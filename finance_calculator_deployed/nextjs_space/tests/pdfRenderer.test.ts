import http from 'http';
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildOfferHtml, type ClientInfo, type OrderItem } from '@/lib/pdf/offerHtml';
import { resolvePdfRenderer } from '@/lib/pdf/renderPdf';
import { closeLocalBrowser, renderWithLocalChromium } from '@/lib/pdf/localRenderer';

const CLIENT: ClientInfo = {
  firstName: 'Jan',
  lastName: 'Testowy',
  company: 'Firma <img src=x onerror=alert(1)>',
  address: '',
  nip: '',
  sapId: '',
  phone: '',
  email: '',
};

const ITEM: OrderItem = {
  id: '1',
  steelType: 'HRS',
  grade: 'S235JR',
  thickness: 2,
  width: 1250,
  length: 2500,
  isCoil: false,
  coating: '',
  notes: [],
  quantity: 3,
  pricePerTon: 700.2,
  totalValue: 2100.6,
  results: { sumaHuta: 0, sumaSSC: 0, cenaKoncowa: 700.2 },
};

function offerHtml(currency: 'EUR' | 'PLN'): string {
  return buildOfferHtml([ITEM], CLIENT, '04.11.2026', 'jan@example.com', 'offer_30.2', currency, 4.25, 'pl', { offerTerms: {} });
}

describe('resolvePdfRenderer', () => {
  test('stays on Abacus when nothing is configured', () => {
    expect(resolvePdfRenderer(undefined)).toBe('abacus');
    expect(resolvePdfRenderer('')).toBe('abacus');
  });

  test('selects the local renderer', () => {
    expect(resolvePdfRenderer('local')).toBe('local');
  });

  test('rejects a typo instead of silently sending offers to the external service', () => {
    expect(() => resolvePdfRenderer('locl')).toThrow(/PDF_RENDERER/);
  });
});

describe('buildOfferHtml', () => {
  test('escapes user input', () => {
    const html = offerHtml('EUR');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  test('rounds prices up per item in EUR: 700.2 -> 701, 3 t -> 2101', () => {
    const html = offerHtml('EUR');
    expect(html).toContain('>701<');
    expect(html).toContain('2&nbsp;101');
  });

  test('converts with the frozen rate in PLN: 700.2 x 4.25 = 2975.85 -> 2976, 3 t = 8927.55 -> 8928', () => {
    const html = offerHtml('PLN');
    expect(html).toContain('2&nbsp;976');
    expect(html).toContain('8&nbsp;928');
  });
});

describe('renderWithLocalChromium limits', () => {
  test('rejects oversized HTML before starting a browser', async () => {
    const html = 'x'.repeat(8 * 1024 * 1024 + 1);
    await expect(renderWithLocalChromium(html)).rejects.toThrow('too large');
  });
});

// Needs a real browser: PDF_CHROME_PATH=<chrome or edge> npm test
describe.skipIf(!process.env.PDF_CHROME_PATH)('renderWithLocalChromium', () => {
  let server: http.Server;
  let hits: string[] = [];
  let origin = '';

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits = [...hits, req.url ?? ''];
      res.end('x');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await closeLocalBrowser();
    await new Promise((resolve) => server.close(resolve));
  });

  test('produces a PDF', async () => {
    const pdf = await renderWithLocalChromium(offerHtml('EUR'));
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  }, 60_000);

  test('neither fetches external resources nor runs scripts', async () => {
    hits = [];
    const html = `<!DOCTYPE html><html><head><link rel="stylesheet" href="${origin}/css"></head><body>
      <img src="${origin}/img"><iframe src="${origin}/frame"></iframe>
      <script>new Image().src = "${origin}/script";</script><p>x</p></body></html>`;
    const pdf = await renderWithLocalChromium(html);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(hits).toEqual([]);
  }, 60_000);

  test('renders offers in parallel beyond the concurrency limit', async () => {
    const pdfs = await Promise.all(Array.from({ length: 5 }, () => renderWithLocalChromium(offerHtml('EUR'))));
    expect(pdfs).toHaveLength(5);
  }, 60_000);
});
