// The client of a proposed draft / copy / edit. Same reach as the calculator's client field
// (GET /api/clients/search: any signed-in user searches the WHOLE client directory) - plan D18,
// the assistant has no rules of its own:
//   {client_id}           a directory client (e.g. from find_clients)
//   {company, nip?, ...}  looked up like the calculator suggestion: NIP first, then the company
//                         name (one match -> that client, several -> the user picks, none -> a
//                         new client the save adds to the directory, as a typed-in one would be).
// Picking a directory client fills the company fields and the client's own payment term, like
// applyClientSuggestion in the calculator; contact fields stay empty, as there.

import { z } from 'zod';
import { findClientId } from '../../../clientDirectory';
import { EMPTY_CLIENT_INFO, type ClientInfo } from '../../../pdfGenerator';
import { escapeLikePattern } from '../../../search';
import type { ClarifyBlock } from '../../blocks';
import { pick, type ToolOutput, type ToolRuntime } from '../types';

const MAX_CANDIDATES = 8;

export const clientRefSchema = z.union([
  z.object({ client_id: z.number().int().positive() }).strict(),
  z
    .object({
      company: z.string().trim().min(1).max(200),
      nip: z.string().trim().max(20).optional(),
      address: z.string().trim().max(300).optional(),
    })
    .strict(),
]);

export type ClientRef = z.infer<typeof clientRefSchema>;

export interface ResolvedClient {
  info: ClientInfo;
  /** The client's own payment term; null = the global default applies. */
  paymentTermDays: number | null;
  /** In the client directory already (else: a new client the save will add). */
  known: boolean;
}

export type ClientResolution =
  | { kind: 'ok'; client: ResolvedClient }
  | { kind: 'ambiguous'; names: string[] }
  | { kind: 'not_found' };

interface ClientRow {
  id: number;
  company: string | null;
  nip: string | null;
  address: string | null;
  sap_id: string | null;
  payment_term_days: number | null;
}

const COLUMNS = 'id, company, nip, address, sap_id, payment_term_days';

function fromRow(row: ClientRow): ResolvedClient {
  return {
    info: {
      ...EMPTY_CLIENT_INFO,
      company: row.company ?? '',
      nip: row.nip ?? '',
      address: row.address ?? '',
      sapId: row.sap_id ?? '',
    },
    paymentTermDays: row.payment_term_days === null ? null : Number(row.payment_term_days),
    known: true,
  };
}

async function byId(rt: ToolRuntime, id: number): Promise<ClientRow | null> {
  const result = await rt.db.query(`SELECT ${COLUMNS} FROM clients WHERE id = $1`, [id]);
  return (result.rows[0] as ClientRow | undefined) ?? null;
}

export async function resolveClient(rt: ToolRuntime, ref: ClientRef): Promise<ClientResolution> {
  if ('client_id' in ref) {
    const row = await byId(rt, ref.client_id);
    return row ? { kind: 'ok', client: fromRow(row) } : { kind: 'not_found' };
  }

  // NIP (or the exact company name) identifies the client the save would write to anyway.
  const exactId = await findClientId(rt.db, ref.company, ref.nip ?? '');
  if (exactId !== null) {
    const row = await byId(rt, exactId);
    if (row) return { kind: 'ok', client: fromRow(row) };
  }

  const candidates = await rt.db.query(
    `SELECT ${COLUMNS} FROM clients
     WHERE company ILIKE '%' || $1 || '%'
     ORDER BY (company ILIKE $1 || '%') DESC, company, id
     LIMIT $2`,
    [escapeLikePattern(ref.company), MAX_CANDIDATES]
  );
  const rows = candidates.rows as ClientRow[];
  if (rows.length === 1) return { kind: 'ok', client: fromRow(rows[0]) };
  if (rows.length > 1) return { kind: 'ambiguous', names: rows.map((r) => r.company ?? `#${r.id}`) };

  return {
    kind: 'ok',
    client: {
      info: { ...EMPTY_CLIENT_INFO, company: ref.company, nip: ref.nip ?? '', address: ref.address ?? '' },
      paymentTermDays: null,
      known: false,
    },
  };
}

/** The tool's answer when the client is not settled: a question with buttons, or not found. */
export function clientQuestion(resolution: Exclude<ClientResolution, { kind: 'ok' }>, lang: ToolRuntime['lang']): ToolOutput {
  if (resolution.kind === 'not_found') {
    return { result: { status: 'client_not_found', message: pick(lang, 'Nie ma takiego klienta - użyj find_clients albo podaj nazwę firmy.', 'No such client - use find_clients or give the company name.') } };
  }
  const clarify: ClarifyBlock = { type: 'clarify', options: resolution.names.map((name) => ({ label: name, value: name })) };
  return {
    result: {
      status: 'ambiguous_client',
      candidates: resolution.names,
      message: pick(lang, 'Ta nazwa pasuje do kilku klientów - zapytaj, o którego chodzi (przyciski są już pokazane). Nie wybieraj sam.', 'The name matches several clients - ask which one (the buttons are already shown). Do not choose yourself.'),
    },
    blocks: [clarify],
  };
}
