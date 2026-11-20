// Action chips under a single-offer answer (docs/ai-assistant-plan.md 6.2, "Akcje"): the
// actions the user may take on that offer right now, from the same offerActions() the app's
// buttons use. A chip only runs a propose_* tool - it shows a confirmation card and never
// changes anything by itself.
//
// Pure: returns calls; get_offer signs them (lib/assistant/tokens.ts).

import type { OfferActions, OfferStatus } from '../access/workflow';
import type { Lang } from './format';
import { MAX_CHIPS } from './followUps';

/** The propose tools a chip may stand for (chatService accepts no other tool from a button). */
export const ACTION_CHIP_TOOLS = ['propose_submit', 'propose_mark_sent', 'propose_approve', 'propose_decision', 'propose_duplicate'] as const;
export type ActionChipTool = (typeof ACTION_CHIP_TOOLS)[number];

export interface ActionChipCall {
  tool: ActionChipTool;
  input: Record<string, unknown>;
  label: string;
}

const LABELS: Record<Lang, Record<'submit' | 'send' | 'approve' | 'won' | 'lost' | 'duplicate', string>> = {
  pl: { submit: 'Przekaż do akceptacji', send: 'Oznacz jako wysłaną', approve: 'Zatwierdź', won: 'Oznacz jako wygraną', lost: 'Oznacz jako przegraną', duplicate: 'Skopiuj ofertę' },
  en: { submit: 'Submit for approval', send: 'Mark as sent', approve: 'Approve', won: 'Mark as won', lost: 'Mark as lost', duplicate: 'Copy the offer' },
};

/**
 * Most useful first: the step that moves the offer forward, then the copy. Rejecting has no chip
 * - it needs the reviewer's own reason, typed in the chat.
 */
export function offerActionCalls(offerId: number, status: OfferStatus, actions: OfferActions, clientDecision: string | null, lang: Lang): ActionChipCall[] {
  const t = LABELS[lang];
  const offer_id = offerId;
  const calls: ActionChipCall[] = [];
  if (actions.canReview) calls.push({ tool: 'propose_approve', input: { offer_id }, label: t.approve });
  if (actions.canSubmit) calls.push({ tool: 'propose_submit', input: { offer_id }, label: t.submit });
  if (actions.canSend) calls.push({ tool: 'propose_mark_sent', input: { offer_id }, label: t.send });
  if (actions.canRecordDecision && status === 'sent' && (clientDecision ?? 'pending') === 'pending') {
    calls.push({ tool: 'propose_decision', input: { offer_id, decision: 'won' }, label: t.won });
    calls.push({ tool: 'propose_decision', input: { offer_id, decision: 'lost' }, label: t.lost });
  }
  if (actions.canDuplicate) calls.push({ tool: 'propose_duplicate', input: { offer_id }, label: t.duplicate });
  return calls.slice(0, MAX_CHIPS);
}
