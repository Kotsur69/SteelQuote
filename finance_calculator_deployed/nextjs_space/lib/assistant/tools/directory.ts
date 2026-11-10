// find_people / find_clients: turn a name the user typed into IDs - or into a question.
//
// The candidate lists are the SAME ones the /analytics filters offer (fetchFacets): salespeople
// and clients with at least one offer the asking user may see. So a person outside the user's
// scope simply does not exist here ("nie znalazłam takiej osoby w Twoim zakresie") and nothing
// about them leaks. Two or more matches are never resolved by the model: the tool emits
// clarification buttons (plan rule 3.8).

import { z } from 'zod';
import { fetchFacets } from '../../analyticsQuery';
import { bestMatches, matchNames } from '../polish';
import type { ClarifyBlock } from '../blocks';
import { defineTool, pick, type ToolOutput, type ToolRuntime } from './types';

const MAX_CANDIDATES = 8;

const querySchema = z.object({ query: z.string().trim().min(1).max(120) }).strict();

interface Candidate {
  id: number;
  name: string;
}

function outcome(kind: 'person' | 'client', query: string, candidates: Candidate[], rt: ToolRuntime): ToolOutput {
  if (candidates.length === 0) {
    return {
      result: {
        status: 'not_found',
        message: kind === 'person'
          ? pick(rt.lang, 'Nie ma takiej osoby w zakresie widoczności użytkownika. Powiedz to wprost, nie zgaduj.', "No such person in the user's visibility scope. Say so, do not guess.")
          : pick(rt.lang, 'Nie ma takiego klienta w zakresie widoczności użytkownika. Powiedz to wprost, nie zgaduj.', "No such client in the user's visibility scope. Say so, do not guess."),
      },
    };
  }
  if (candidates.length === 1) return { result: { status: 'found', [kind]: candidates[0] } };

  const shown = candidates.slice(0, MAX_CANDIDATES);
  const clarify: ClarifyBlock = { type: 'clarify', options: shown.map((c) => ({ label: c.name, value: c.name })) };
  return {
    result: {
      status: 'ambiguous',
      candidates: shown,
      total: candidates.length,
      message: pick(
        rt.lang,
        `"${query}" pasuje do kilku pozycji. Zapytaj użytkownika, o którą chodzi - przyciski są już pokazane. Nie wybieraj samodzielnie.`,
        `"${query}" matches several entries. Ask the user which one they mean - buttons are already shown. Do not choose yourself.`
      ),
    },
    blocks: [clarify],
  };
}

export const findPeople = defineTool({
  name: 'find_people',
  description:
    'Resolve a salesperson name to a user id. Pass the name in the NOMINATIVE ("Marek Nowak", not "Marka Nowaka"). ' +
    'Searches only people whose offers the user may see. Returns found / ambiguous / not_found.',
  schema: querySchema,
  run: async ({ query }, rt) => {
    const { users } = await fetchFacets(rt.ctx, rt.db);
    const matches = bestMatches(matchNames(query, users, (u) => u.name));
    return outcome('person', query, matches.map((m) => ({ id: Number(m.item.id), name: m.item.name })), rt);
  },
});

export const findClients = defineTool({
  name: 'find_clients',
  description:
    'Resolve a client (company) name to a client id. Pass the name in the nominative, legal form optional. ' +
    'Searches only clients with offers the user may see. Returns found / ambiguous / not_found.',
  schema: querySchema,
  run: async ({ query }, rt) => {
    const { clients } = await fetchFacets(rt.ctx, rt.db);
    const matches = bestMatches(matchNames(query, clients, (c) => c.name, true));
    return outcome('client', query, matches.map((m) => ({ id: Number(m.item.id), name: m.item.name })), rt);
  },
});

/** Names for the footer, resolved inside the user's scope (unknown ids stay unnamed). */
export async function scopedNames(
  rt: ToolRuntime,
  userIds: readonly number[],
  clientIds: readonly number[]
): Promise<{ people: string[]; clients: string[] }> {
  if (userIds.length === 0 && clientIds.length === 0) return { people: [], clients: [] };
  const facets = await fetchFacets(rt.ctx, rt.db);
  const nameOf = (list: { id: number; name: string }[], id: number) => list.find((x) => Number(x.id) === id)?.name;
  return {
    people: userIds.map((id) => nameOf(facets.users, id)).filter((n): n is string => !!n),
    clients: clientIds.map((id) => nameOf(facets.clients, id)).filter((n): n is string => !!n),
  };
}
