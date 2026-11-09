// Deterministic demo data for the AI assistant (docs/ai-assistant-plan.md, phase 0).
//
// Pure data, no database and no app imports: the seed writer (seed.ts) turns this into rows,
// and the golden-set oracle (oracle.ts) computes expected answers from the SAME spec without
// touching the analytics engine - so the golden numbers are an independent check of it.
//
// Everything is fixed by a seeded PRNG: re-running the seed on an empty database produces
// identical offers, so the golden answers never drift.

export type SteelType = 'HRS' | 'CR' | 'HDG' | 'PICKLED' | 'TEARDROP' | 'ZM';
export type Status = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'sent';
export type Decision = 'pending' | 'won' | 'lost';

/** Seed reference date. Golden questions with relative periods resolve against this day. */
export const SPEC_TODAY = '2026-11-09';

export interface PersonSpec {
  key: string;
  email: string;
  fullName: string;
  flow: 'FLOW1' | 'FLOW2';
  role: string;
  /** Email of the team lead (team_members.senior_id), if any. */
  teamLead?: string;
}

// Two "Marek"s on purpose (name ambiguity), a surname shared with a client (Wąsik) and a
// client named after a person (Marek-Stal) - all cases the assistant must ask about.
export const PEOPLE: PersonSpec[] = [
  { key: 'marekN', email: 'marek.nowak@steelquote.test', fullName: 'Marek Nowak', flow: 'FLOW1', role: 'IFO', teamLead: 'asm.f1@steelquote.test' },
  { key: 'marekW', email: 'marek.wisniewski@steelquote.test', fullName: 'Marek Wiśniewski', flow: 'FLOW1', role: 'EFO', teamLead: 'asm.f1@steelquote.test' },
  { key: 'anna', email: 'anna.kowalska@steelquote.test', fullName: 'Anna Kowalska', flow: 'FLOW1', role: 'IFO', teamLead: 'asm.f1@steelquote.test' },
  { key: 'lukasz', email: 'lukasz.zak@steelquote.test', fullName: 'Łukasz Żak', flow: 'FLOW1', role: 'IFO' },
  { key: 'kasia', email: 'katarzyna.wasik@steelquote.test', fullName: 'Katarzyna Wąsik', flow: 'FLOW2', role: 'KAM' },
  { key: 'piotr', email: 'piotr.zielinski@steelquote.test', fullName: 'Piotr Zieliński', flow: 'FLOW2', role: 'IFO' },
];

export interface ClientSpec {
  key: string;
  company: string;
  nip: string;
  sapId: string;
  address: string;
  firstName: string;
  lastName: string;
}

// Fictional companies. Diacritics in names and cities are deliberate (search must match
// "Lodz" to "Łódź").
export const CLIENTS: ClientSpec[] = [
  { key: 'profilex', company: 'Profilex Łódź Sp. z o.o.', nip: '7251000011', sapId: '91000011', address: 'ul. Włókniarzy 12, 90-001 Łódź', firstName: 'Jan', lastName: 'Kowalczyk' },
  { key: 'wasikMetal', company: 'Wąsik Metal Sp. j.', nip: '8971000022', sapId: '91000022', address: 'ul. Strzegomska 40, 54-001 Wrocław', firstName: 'Tomasz', lastName: 'Wąsik' },
  { key: 'zurawiec', company: 'Żurawiec Konstrukcje Sp. z o.o.', nip: '5831000033', sapId: '91000033', address: 'ul. Stoczniowców 3, 80-001 Gdańsk', firstName: 'Ewa', lastName: 'Lis' },
  { key: 'sleza', company: 'Ślęża Stal S.A.', nip: '8941000044', sapId: '91000044', address: 'ul. Ślężna 100, 53-001 Wrocław', firstName: 'Paweł', lastName: 'Duda' },
  { key: 'kety', company: 'Kęty-Blach Sp. z o.o.', nip: '5491000055', sapId: '91000055', address: 'ul. Kościuszki 5, 32-650 Kęty', firstName: 'Agnieszka', lastName: 'Mróz' },
  { key: 'grodek', company: 'Gródek Serwis Stali Sp. z o.o.', nip: '5421000066', sapId: '91000066', address: 'ul. Przemysłowa 8, 15-001 Białystok', firstName: 'Michał', lastName: 'Sowa' },
  { key: 'mazowiecka', company: 'Mazowiecka Hurtownia Blach Sp. z o.o.', nip: '7961000077', sapId: '91000077', address: 'ul. Żelazna 22, 26-600 Radom', firstName: 'Krzysztof', lastName: 'Bąk' },
  { key: 'pomorskie', company: 'Pomorskie Zakłady Metalowe S.A.', nip: '8511000088', sapId: '91000088', address: 'ul. Portowa 1, 70-001 Szczecin', firstName: 'Joanna', lastName: 'Wilk' },
  { key: 'stalbud', company: 'Stal-Bud Częstochowa Sp. z o.o.', nip: '5731000099', sapId: '91000099', address: 'al. Hutników 7, 42-200 Częstochowa', firstName: 'Robert', lastName: 'Kania' },
  { key: 'odlewnia', company: 'Odlewnia Śląska Sp. z o.o.', nip: '6341000100', sapId: '91000100', address: 'ul. Odlewników 2, 40-001 Katowice', firstName: 'Beata', lastName: 'Gołąb' },
  { key: 'metalplast', company: 'Metalplast Kraków Sp. z o.o.', nip: '6761000111', sapId: '91000111', address: 'ul. Półłanki 30, 30-001 Kraków', firstName: 'Adam', lastName: 'Czajka' },
  { key: 'marekStal', company: 'Marek-Stal Sp. z o.o.', nip: '7771000122', sapId: '91000122', address: 'ul. Poznańska 9, 60-001 Poznań', firstName: 'Marek', lastName: 'Jóźwiak' },
];

/** PGL (EUR/t) per quarter and steel type. Written to pgl_quarterly_prices too. */
export const PGL: Record<string, Record<SteelType, number>> = {
  '2025-Q3': { HRS: 610, CR: 690, HDG: 720, PICKLED: 640, TEARDROP: 650, ZM: 760 },
  '2025-Q4': { HRS: 620, CR: 700, HDG: 735, PICKLED: 650, TEARDROP: 660, ZM: 770 },
  '2026-Q1': { HRS: 640, CR: 715, HDG: 750, PICKLED: 665, TEARDROP: 675, ZM: 790 },
  '2026-Q2': { HRS: 655, CR: 725, HDG: 760, PICKLED: 680, TEARDROP: 690, ZM: 800 },
  '2026-Q3': { HRS: 645, CR: 720, HDG: 755, PICKLED: 675, TEARDROP: 685, ZM: 795 },
  '2026-Q4': { HRS: 660, CR: 735, HDG: 770, PICKLED: 690, TEARDROP: 700, ZM: 810 },
};

export const LOST_REASONS = ['price', 'lead_time', 'competitor', 'competitor_faster', 'project_cancelled', 'no_response', 'payment_terms', 'other'] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export interface ItemSpec {
  type: SteelType;
  grade: string;
  thickness: number;
  width: number;
  /** 0 = coil. */
  length: number;
  tons: number;
  marginPct: number;
  /** Legacy item saved before ItemInputs existed: no recorded margin (excluded from averages). */
  legacy?: boolean;
}

export interface VersionSpec {
  /** Local Warsaw time 'YYYY-MM-DD HH:MM'. */
  createdAt: string;
  status: Status;
  items: ItemSpec[];
  sentAt?: string;
  decision: Decision;
  decidedAt?: string;
  lostReason?: LostReason;
  /** Reviewer comment of a rejected version. */
  rejectionReason?: string;
}

export interface OfferSpec {
  /** Stable key, e.g. 'f017'. Golden questions reference offers by key. */
  key: string;
  owner: string;
  client: string;
  quoteValidityHours: 24 | 48 | 72;
  paymentTermDays: number;
  eurPlnRate: number;
  /** Oldest first. The last one is the version analytics counts. */
  versions: VersionSpec[];
}

// --- deterministic generator -----------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Grade names must exist in lib/priceBook DEFAULT_PRICE_BOOK (the seed fails fast otherwise).
const GRADES: Record<SteelType, string[]> = {
  HRS: ['S235JR+N', 'S355J2+N', '1937-03'],
  CR: ['DC01', 'DC03'],
  HDG: ['S250GD+Z', 'S350GD+Z'],
  PICKLED: ['S235J2+N-CAT_A', 'C15E'],
  TEARDROP: ['S235JR+N', 'S235JR+AR'],
  ZM: ['S250GD+ZM', 'S350GD+ZM'],
};

const THICKNESS: Record<SteelType, number[]> = {
  HRS: [2, 3, 4, 5, 6, 8, 10],
  CR: [0.8, 1, 1.5, 2],
  HDG: [0.7, 1, 1.5, 2],
  PICKLED: [2, 3, 4],
  TEARDROP: [3, 4, 5],
  ZM: [1, 1.5, 2],
};

const WIDTHS = [1250, 1500];
const LENGTHS = [2000, 2500, 3000, 6000];

// Months with their offer count. Sparse Jan-Aug 2026 keeps YTD / quarter questions honest.
const MONTHS: [string, number][] = [
  ['2025-09', 10], ['2025-10', 12], ['2025-11', 11], ['2025-12', 6],
  ['2026-01', 5], ['2026-02', 5], ['2026-03', 6], ['2026-04', 5], ['2026-05', 6],
  ['2026-06', 6], ['2026-07', 7], ['2026-08', 6],
  ['2026-09', 12], ['2026-10', 14], ['2026-11', 8],
];

const pad = (n: number) => String(n).padStart(2, '0');

function addDays(local: string, days: number, hour: number, minute: number): string {
  const d = new Date(`${local.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return `${d.toISOString().slice(0, 10)} ${pad(hour)}:${pad(minute)}`;
}

function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

const beforeToday = (local: string) => local.slice(0, 10) < SPEC_TODAY;

function pick<T>(rnd: () => number, list: readonly T[]): T {
  return list[Math.floor(rnd() * list.length)];
}

function makeItems(rnd: () => number, owner: string, legacy: boolean): ItemSpec[] {
  // FLOW2 (project) people quote bigger tonnage; FLOW1 front office smaller lots.
  const big = owner === 'kasia' || owner === 'piotr';
  const count = rnd() < 0.7 ? 1 : rnd() < 0.7 ? 2 : 3;
  const primary = pick(rnd, ['HRS', 'HRS', 'HRS', 'HDG', 'HDG', 'CR', 'PICKLED', 'TEARDROP', 'ZM'] as SteelType[]);
  const items: ItemSpec[] = [];
  for (let i = 0; i < count; i++) {
    // A second line is a different type half of the time (mixed-type offers).
    const type = i > 0 && rnd() < 0.5 ? pick(rnd, ['HRS', 'HDG', 'CR'] as SteelType[]) : primary;
    const coil = rnd() < 0.2;
    const tons = Math.round((big ? 20 + rnd() * 180 : 2 + rnd() * 38) * 10) / 10;
    // Mostly 6-12 %, a few thin margins that trigger approval rules.
    const marginPct = rnd() < 0.12 ? pick(rnd, [3, 4, 4.5]) : pick(rnd, [6, 7, 7.5, 8, 9, 10, 12]);
    items.push({
      type,
      grade: pick(rnd, GRADES[type]),
      thickness: pick(rnd, THICKNESS[type]),
      width: pick(rnd, WIDTHS),
      length: coil ? 0 : pick(rnd, LENGTHS),
      tons,
      marginPct,
      ...(legacy ? { legacy: true } : {}),
    });
  }
  return items;
}

/** Lifecycle of a version created at `created`, cut off at SPEC_TODAY. */
function lifecycle(rnd: () => number, created: string): Omit<VersionSpec, 'createdAt' | 'items'> {
  const sentAt = addDays(created, 1 + Math.floor(rnd() * 4), 9 + Math.floor(rnd() * 8), Math.floor(rnd() * 60));
  const decidedAt = addDays(sentAt, 3 + Math.floor(rnd() * 22), 8 + Math.floor(rnd() * 9), Math.floor(rnd() * 60));
  const roll = rnd();

  if (roll < 0.1) return { status: 'draft', decision: 'pending' };
  if (roll < 0.17) return { status: 'pending_review', decision: 'pending' };
  if (roll < 0.22) {
    const rejectionReason = pick(rnd, ['Marża za niska dla tego klienta', 'Popraw termin płatności', 'Za długa ważność ceny']);
    return { status: 'rejected', decision: 'pending', rejectionReason };
  }
  if (roll < 0.27 || !beforeToday(sentAt)) return { status: 'approved', decision: 'pending' };

  if (roll < 0.4 || !beforeToday(decidedAt)) return { status: 'sent', sentAt, decision: 'pending' };
  if (roll < 0.72) return { status: 'sent', sentAt, decision: 'won', decidedAt };
  return { status: 'sent', sentAt, decision: 'lost', decidedAt, lostReason: pick(rnd, LOST_REASONS) };
}

export function buildDemoOffers(): OfferSpec[] {
  const rnd = mulberry32(20261109);
  const owners = ['marekN', 'marekN', 'marekW', 'anna', 'anna', 'lukasz', 'kasia', 'piotr'];
  const offers: OfferSpec[] = [];

  for (const [ym, count] of MONTHS) {
    const lastDay = ym === SPEC_TODAY.slice(0, 7) ? Number(SPEC_TODAY.slice(8, 10)) - 1 : daysInMonth(ym);
    for (let i = 0; i < count; i++) {
      const day = 1 + Math.floor(rnd() * lastDay);
      const created = `${ym}-${pad(day)} ${pad(7 + Math.floor(rnd() * 10))}:${pad(Math.floor(rnd() * 60))}`;
      const owner = pick(rnd, owners);
      const legacy = ym < '2025-11' && rnd() < 0.35;
      const items = makeItems(rnd, owner, legacy);
      const first: VersionSpec = { createdAt: created, items, ...lifecycle(rnd, created) };
      const versions: VersionSpec[] = [first];

      // Some families get a second version: a rejected offer fixed, or a lost one renegotiated.
      if (rnd() < 0.35 && (first.status === 'rejected' || first.decision === 'lost')) {
        const created2 = addDays(first.decidedAt ?? first.createdAt, 2, 10, 15);
        if (beforeToday(created2)) {
          const items2 = items.map((it) => ({ ...it, marginPct: Math.max(it.marginPct - 1, 3) }));
          versions.push({ createdAt: created2, items: items2, ...lifecycle(rnd, created2) });
        }
      }

      offers.push({
        key: `f${String(offers.length + 1).padStart(3, '0')}`,
        owner,
        client: pick(rnd, CLIENTS).key,
        quoteValidityHours: pick(rnd, [24, 48, 48, 72] as const),
        paymentTermDays: pick(rnd, [14, 30, 30, 45, 60]),
        eurPlnRate: Math.round((4.22 + rnd() * 0.16) * 10000) / 10000,
        versions,
      });
    }
  }

  return [...offers, ...anchorOffers()];
}

/**
 * Hand-placed offers the golden set leans on: timezone edges, a three-version family, a mixed
 * HRS + HDG offer, and work waiting in approval queues "today".
 */
function anchorOffers(): OfferSpec[] {
  const hrs = (tons: number, marginPct: number): ItemSpec => ({ type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons, marginPct });
  const hdg = (tons: number, marginPct: number): ItemSpec => ({ type: 'HDG', grade: 'S250GD+Z', thickness: 1, width: 1250, length: 0, tons, marginPct });
  return [
    // 23:40 Warsaw on 30 Sep = September; 00:20 Warsaw on 1 Oct = October (22:20 UTC on 30 Sep).
    { key: 'a01', owner: 'anna', client: 'profilex', quoteValidityHours: 48, paymentTermDays: 30, eurPlnRate: 4.27,
      versions: [{ createdAt: '2026-09-30 23:40', status: 'sent', sentAt: '2026-10-01 00:20', decision: 'won', decidedAt: '2026-10-31 23:50', items: [hrs(25, 8)] }] },
    { key: 'a02', owner: 'marekN', client: 'sleza', quoteValidityHours: 48, paymentTermDays: 30, eurPlnRate: 4.28,
      versions: [{ createdAt: '2026-10-01 00:20', status: 'sent', sentAt: '2026-10-02 10:00', decision: 'lost', decidedAt: '2026-11-01 00:10', lostReason: 'price', items: [hrs(18, 9)] }] },
    // Three versions: rejected -> lost -> renegotiated and won. Counts as ONE won offer.
    { key: 'a03', owner: 'marekN', client: 'zurawiec', quoteValidityHours: 48, paymentTermDays: 45, eurPlnRate: 4.3,
      versions: [
        { createdAt: '2026-09-08 09:00', status: 'rejected', decision: 'pending', rejectionReason: 'Marża za niska', items: [hrs(60, 3), hdg(20, 3)] },
        { createdAt: '2026-09-10 11:00', status: 'sent', sentAt: '2026-09-11 09:30', decision: 'lost', decidedAt: '2026-09-25 14:00', lostReason: 'price', items: [hrs(60, 7), hdg(20, 7)] },
        { createdAt: '2026-09-28 10:00', status: 'sent', sentAt: '2026-09-29 12:00', decision: 'won', decidedAt: '2026-10-06 13:00', items: [hrs(55, 6), hdg(20, 6)] },
      ] },
    // Waiting for approval now (thin margin) - shows up in approvers' queues.
    { key: 'a04', owner: 'marekW', client: 'marekStal', quoteValidityHours: 48, paymentTermDays: 30, eurPlnRate: 4.29,
      versions: [{ createdAt: '2026-11-06 10:00', status: 'pending_review', decision: 'pending', items: [hrs(40, 3)] }] },
    { key: 'a05', owner: 'kasia', client: 'wasikMetal', quoteValidityHours: 72, paymentTermDays: 60, eurPlnRate: 4.29,
      versions: [{ createdAt: '2026-11-05 14:00', status: 'pending_review', decision: 'pending', items: [hdg(150, 4)] }] },
    // October losses, so the demo question "ile ofert przegraliśmy w październiku i dlaczego?"
    // has a reasons table worth showing (price twice, lead time once).
    { key: 'a07', owner: 'anna', client: 'grodek', quoteValidityHours: 48, paymentTermDays: 30, eurPlnRate: 4.26,
      versions: [{ createdAt: '2026-09-22 09:15', status: 'sent', sentAt: '2026-09-23 11:00', decision: 'lost', decidedAt: '2026-10-09 15:30', lostReason: 'price', items: [hrs(32, 9)] }] },
    { key: 'a08', owner: 'piotr', client: 'pomorskie', quoteValidityHours: 48, paymentTermDays: 60, eurPlnRate: 4.27,
      versions: [{ createdAt: '2026-09-29 13:40', status: 'sent', sentAt: '2026-10-01 10:10', decision: 'lost', decidedAt: '2026-10-20 12:00', lostReason: 'price', items: [hdg(120, 7)] }] },
    { key: 'a09', owner: 'lukasz', client: 'metalplast', quoteValidityHours: 24, paymentTermDays: 30, eurPlnRate: 4.28,
      versions: [{ createdAt: '2026-10-05 08:50', status: 'sent', sentAt: '2026-10-06 09:20', decision: 'lost', decidedAt: '2026-10-27 16:45', lostReason: 'lead_time', items: [hrs(15, 8), hdg(10, 8)] }] },
    // Approved, not yet sent - "co mam do wysłania".
    { key: 'a06', owner: 'marekN', client: 'kety', quoteValidityHours: 24, paymentTermDays: 30, eurPlnRate: 4.3,
      versions: [{ createdAt: '2026-11-07 08:30', status: 'approved', decision: 'pending', items: [hrs(12, 8)] }] },
  ];
}
