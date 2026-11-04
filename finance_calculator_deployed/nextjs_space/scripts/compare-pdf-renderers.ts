// Renders the same fictional demo offers with Abacus and local Chromium, for side-by-side review.
// Usage: PDF_CHROME_PATH=<chrome> ABACUSAI_API_KEY=<key> npx tsx scripts/compare-pdf-renderers.ts <out-dir>
import fs from 'fs';
import path from 'path';
import { buildOfferHtml, type ClientInfo, type OrderItem } from '@/lib/pdf/offerHtml';
import { renderWithAbacus } from '@/lib/pdf/abacusRenderer';
import { closeLocalBrowser, renderWithLocalChromium } from '@/lib/pdf/localRenderer';
import type { Currency } from '@/lib/currency';
import type { Language } from '@/lib/translations';

const CLIENT: ClientInfo = {
  firstName: 'Łukasz',
  lastName: 'Żółkiewski-Świątek',
  company: 'Przykładowa Stal Sp. z o.o.',
  address: 'ul. Łąkowa 15, 40-101 Gdańsk',
  nip: '0000000000',
  sapId: '100200',
  phone: '+48 500 000 000',
  email: 'demo@example.com',
};

const TYPES = ['HRS', 'CR', 'HDG', 'PICKLED', 'TEARDROP', 'ZM'];
const NOTES = ['Certyfikat: 3.1', 'Pakowanie: paleta drewniana, żółta folia', 'Dostawa: DAP Gdańsk', 'Uwaga: ± 5% ilość · ½ transportu'];

function demoItem(index: number): OrderItem {
  const pricePerTon = 612.35 + index * 17.4;
  const quantity = 1.25 + index * 3.5;
  const isCoil = index % 3 === 0;
  return {
    id: String(index + 1),
    steelType: TYPES[index % TYPES.length],
    grade: index % 2 === 0 ? 'S235JR' : 'DX51D+Z',
    thickness: 1.5 + (index % 8) * 0.25,
    width: 1000 + (index % 4) * 250,
    length: 2000 + (index % 3) * 500,
    isCoil,
    coating: index % 2 === 0 ? '' : 'Z275',
    notes: NOTES.slice(0, (index % NOTES.length) + 1),
    quantity,
    pricePerTon,
    totalValue: pricePerTon * quantity,
    results: { sumaHuta: 0, sumaSSC: 0, cenaKoncowa: pricePerTon },
  };
}

interface Scenario {
  name: string;
  items: number;
  currency: Currency;
  language: Language;
}

const SCENARIOS: readonly Scenario[] = [
  { name: 'pl-eur-1-item', items: 1, currency: 'EUR', language: 'pl' },
  { name: 'pl-pln-12-items', items: 12, currency: 'PLN', language: 'pl' },
  { name: 'pl-eur-60-items-multipage', items: 60, currency: 'EUR', language: 'pl' },
  { name: 'en-eur-12-items', items: 12, currency: 'EUR', language: 'en' },
  { name: 'cs-eur-12-items', items: 12, currency: 'EUR', language: 'cs' },
  { name: 'de-eur-12-items', items: 12, currency: 'EUR', language: 'de' },
];

async function timed(render: () => Promise<Buffer>): Promise<{ pdf: Buffer; ms: number }> {
  const start = Date.now();
  const pdf = await render();
  return { pdf, ms: Date.now() - start };
}

async function main(): Promise<void> {
  const outDir = process.argv[2];
  if (!outDir) throw new Error('Usage: compare-pdf-renderers.ts <out-dir>');
  fs.mkdirSync(outDir, { recursive: true });

  for (const scenario of SCENARIOS) {
    const items = Array.from({ length: scenario.items }, (_, index) => demoItem(index));
    const html = buildOfferHtml(items, CLIENT, '04.11.2026', 'demo@example.com', 'offer_30.2', scenario.currency, 4.25, scenario.language, {
      validFrom: '04.11.2026',
      validTo: '30.11.2026',
      paymentTermDays: 30,
      quoteValidityHours: 48,
      offerTerms: { cert: 1, packing: 0, incoterm: 'DAP', destAddress: 'ul. Łąkowa 15, Gdańsk' },
    });
    const abacus = await timed(() => renderWithAbacus(html));
    const local = await timed(() => renderWithLocalChromium(html));
    fs.writeFileSync(path.join(outDir, `${scenario.name}.abacus.pdf`), abacus.pdf);
    fs.writeFileSync(path.join(outDir, `${scenario.name}.local.pdf`), local.pdf);
    process.stdout.write(`${scenario.name}: abacus ${abacus.ms} ms, local ${local.ms} ms\n`);
  }
  await closeLocalBrowser();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
