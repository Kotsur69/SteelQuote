import { z } from 'zod';
import { STEEL_TYPES } from '@/lib/pglQuarterly';

// Server-side guard for offer_data.zestawienie on create/update. The calculator always sends
// complete, self-consistent items; this rejects anything else (hand-made API payloads, broken
// clients) so an offer can never be stored with a value that does not follow from its inputs.

// Money fields are stored in EUR with up to 2 decimals; allow one cent of float noise.
const MONEY_TOLERANCE = 0.01;

const finite = z.number().finite();
const positive = finite.positive();

const itemSchema = z
  .object({
    type: z.enum(STEEL_TYPES as [string, ...string[]]),
    grade: z.string().trim().min(1),
    thickness: positive,
    width: positive,
    length: finite.nonnegative(),
    isCoil: z.boolean().optional(),
    tons: positive,
    pgl: positive,
    sumaHuta: finite,
    sumaSSC: finite,
    marza: finite,
    finalPrice: positive,
    totalValue: positive,
    // Snapshot of the calculator inputs; legacy items may lack it, so it is optional and
    // only the fields the consistency checks need are typed here.
    inputs: z
      .object({
        marginPct: finite,
        extra: finite,
        transport: finite,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type OfferItem = z.infer<typeof itemSchema>;

const near = (a: number, b: number) => Math.abs(a - b) <= MONEY_TOLERANCE;

// Mirrors pricingEngine.computeCenaKoncowa: marza = (PGL + Σ Mill) × pct / 100 and
// finalPrice = PGL + Σ Mill + marza + extra + transport + Σ SSC; totalValue = finalPrice × tons
// rounded to cents (as Calculator.tsx stores it).
function consistencyError(item: OfferItem): string | null {
  if (!item.isCoil && item.length <= 0) return 'length must be > 0 for sheets';
  if (!near(item.totalValue, Math.round(item.finalPrice * item.tons * 100) / 100)) {
    return 'totalValue does not equal finalPrice × tons';
  }
  if (!item.inputs) return null;
  const cenaWsadu = item.pgl + item.sumaHuta;
  if (!near(item.marza, cenaWsadu * (item.inputs.marginPct / 100))) {
    return 'marza does not match (PGL + Σ Mill) × margin %';
  }
  const expectedPrice = cenaWsadu + item.marza + item.inputs.extra + item.inputs.transport + item.sumaSSC;
  if (!near(item.finalPrice, expectedPrice)) {
    return 'finalPrice does not equal PGL + Σ Mill + margin + extra + transport + Σ SSC';
  }
  return null;
}

/** Returns a human-readable error for the first invalid item, or null when all are valid. */
export function validateOfferItems(offerData: Record<string, unknown>): string | null {
  const items = offerData.zestawienie;
  if (items === undefined) return null;
  if (!Array.isArray(items)) return 'zestawienie must be an array';

  for (let i = 0; i < items.length; i++) {
    const parsed = itemSchema.safeParse(items[i]);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return `Item ${i + 1}: invalid ${issue.path.join('.') || 'item'} (${issue.message})`;
    }
    const error = consistencyError(parsed.data);
    if (error) return `Item ${i + 1}: ${error}`;
  }
  return null;
}
