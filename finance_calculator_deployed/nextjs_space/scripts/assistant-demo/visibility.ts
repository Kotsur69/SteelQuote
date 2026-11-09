// Hand-written visibility fixture for the golden set: which salespeople's offers each asking
// user may see on the demo DB. Derived from the default visibility matrix (migrations 027/030),
// NOT from the app's SQL - verify.ts checks the two agree, so a change in either is caught.

import { PEOPLE } from './spec';

export interface Asker {
  key: string;
  email: string;
  /** 'all' = every offer, 'flow1' = every Flow 1 owner, else owner keys (PEOPLE[].key). */
  sees: 'all' | 'flow1' | string[];
}

// NOTE: the seeded matrix gives IFO/EFO/KAM see_team = true although its note says "Tylko
// własne oferty", so a team member sees the whole team (open question for Mati, see plan 14).
// The fixture follows the code; Kasia has no team, so she sees only her own.
export const ASKERS: Asker[] = [
  { key: 'marekN', email: 'marek.nowak@steelquote.test', sees: ['marekN', 'marekW', 'anna'] },
  { key: 'anna', email: 'anna.kowalska@steelquote.test', sees: ['marekN', 'marekW', 'anna'] },
  { key: 'kasia', email: 'katarzyna.wasik@steelquote.test', sees: ['kasia'] },
  // ASM leads the Flow 1 team (team_members): own + team.
  { key: 'adam', email: 'asm.f1@steelquote.test', sees: ['marekN', 'marekW', 'anna'] },
  // Head of Cluster: all of Flow 1 (migration 030).
  { key: 'hanna', email: 'hoc.f1@steelquote.test', sees: 'flow1' },
  { key: 'celina', email: 'ceo@steelquote.test', sees: 'all' },
  { key: 'admin', email: 'example@gmail.com', sees: 'all' },
];

export function expectedOwners(asker: Asker): Set<string> {
  if (asker.sees === 'all') return new Set(PEOPLE.map((p) => p.key));
  if (asker.sees === 'flow1') return new Set(PEOPLE.filter((p) => p.flow === 'FLOW1').map((p) => p.key));
  return new Set(asker.sees);
}

export function askerByKey(key: string): Asker {
  const asker = ASKERS.find((a) => a.key === key);
  if (!asker) throw new Error(`Unknown asker ${key}`);
  return asker;
}
