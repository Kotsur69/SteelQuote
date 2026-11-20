// The actions the assistant may PROPOSE (docs/ai-assistant-plan.md section 7, D7) and the exact
// payload each one stores. A payload is what the confirm executes - built by the server from the
// propose_* tool's checked input, never written by the model directly - and validated again
// against these schemas when it is read back from the database.

import { z } from 'zod';
import type { ClientInfo } from '../../pdfGenerator';

export const ACTION_KINDS = ['draft', 'edit', 'duplicate', 'submit', 'send', 'approve', 'reject', 'decision'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

/** Minutes a confirmation card stays valid (plan section 7). */
export const ACTION_TTL_MINUTES = 10;

const offerId = z.number().int().positive();
const offerData = z.record(z.unknown());
const offerName = z.string().max(200).nullable();

const clientInfo = z
  .object({
    company: z.string(), nip: z.string(), address: z.string(), sapId: z.string(),
    firstName: z.string(), lastName: z.string(), phone: z.string(), email: z.string(),
  })
  .strict() satisfies z.ZodType<ClientInfo>;

export const PAYLOAD_SCHEMAS = {
  /** flowId: the active flow when the card was built - the confirm refuses another one. */
  draft: z.object({ offerName, offerData, flowId: z.number().int().positive() }).strict(),
  edit: z.object({ offerId, offerName, offerData }).strict(),
  duplicate: z
    .object({ offerId, overrides: z.object({ clientInfo: clientInfo.optional(), paymentTermDays: z.number().int().min(0).max(365).optional() }).strict() })
    .strict(),
  submit: z.object({ offerId }).strict(),
  send: z.object({ offerId }).strict(),
  approve: z.object({ offerId, comment: z.string().max(1000).nullable() }).strict(),
  reject: z.object({ offerId, reason: z.string().min(1).max(1000) }).strict(),
  decision: z
    .object({ offerId, decision: z.enum(['won', 'lost']), reason: z.string().max(60).nullable(), note: z.string().max(1000).nullable() })
    .strict(),
} as const satisfies Record<ActionKind, z.ZodTypeAny>;

export type ActionPayload<K extends ActionKind> = z.infer<(typeof PAYLOAD_SCHEMAS)[K]>;

export type AnyAction = { [K in ActionKind]: { kind: K; payload: ActionPayload<K> } }[ActionKind];

/** Payload read back from the database -> typed action, or null when it does not fit its kind. */
export function parseAction(kind: unknown, payload: unknown): AnyAction | null {
  if (typeof kind !== 'string' || !(ACTION_KINDS as readonly string[]).includes(kind)) return null;
  const parsed = PAYLOAD_SCHEMAS[kind as ActionKind].safeParse(payload);
  return parsed.success ? ({ kind, payload: parsed.data } as AnyAction) : null;
}

/** The existing offer an action works on (null for a new draft). */
export function targetOfferId(action: AnyAction): number | null {
  return action.kind === 'draft' ? null : action.payload.offerId;
}
