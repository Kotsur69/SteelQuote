// Assistant actions end to end on a real database (docs/ai-assistant-plan.md section 7, phase 3):
//   1. every golden action case: the propose_* tool under the case's asker returns a card of the
//      expected kind (or the expected question / refusal) and NOTHING in offers changes;
//   2. confirming cards runs the shared offer service: draft, mark sent, approve, lost decision,
//      duplicate, edit - checked on the resulting rows, plus the "przez asystenta" record;
//   3. refusals: a used card, a card of another user, an expired card, a cancelled card, and a
//      card whose offer changed after it was shown.
//
// WRITES to the database, so it refuses anything but a throwaway copy of the demo DB:
//   createdb -U postgres -T steelquote_ai steelquote_ai_actions
//   DATABASE_URL=postgresql://postgres@localhost:5432/steelquote_ai_actions JWT_SECRET=verify-only \
//     npx tsx scripts/assistant-demo/verify-actions.ts
//   dropdb -U postgres steelquote_ai_actions

import pool from '@/lib/db';
import { loadAccessContext } from '@/lib/access/context';
import type { AccessContext } from '@/lib/access/types';
import type { ActionCardBlock, AnswerBlock } from '@/lib/assistant/blocks';
import { cancelAction, confirmAction } from '@/lib/assistant/actions/confirm';
import { assistantActionsFor } from '@/lib/assistant/actions/pending';
import { toolByName } from '@/lib/assistant/tools';
import type { ToolOutput, ToolRuntime } from '@/lib/assistant/tools/types';
import { SPEC_TODAY } from './spec';
import { ASKERS } from './visibility';

const DB_NAME = 'steelquote_ai_actions';

const errors: string[] = [];
let checks = 0;
const check = (label: string, actual: unknown, expected: unknown) => {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push(`${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
};

const runtimes = new Map<string, ToolRuntime>();
const ctxOf = (asker: string): AccessContext => runtimes.get(asker)!.ctx;

async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('localhost') || !url.endsWith(`/${DB_NAME}`)) {
    throw new Error(`Refusing to run: this script writes - DATABASE_URL must point at localhost/${DB_NAME}`);
  }
  for (const asker of ASKERS) {
    const r = await pool.query(`SELECT id FROM users WHERE email = $1`, [asker.email]);
    const ctx = await loadAccessContext(Number(r.rows[0].id), null);
    if (!ctx) throw new Error(`No access context for ${asker.key}`);
    runtimes.set(asker.key, { ctx, today: SPEC_TODAY, lang: 'pl', db: pool });
  }
  // The seed dates approvals around the demo's fixed "today" (09.11.2026), but the 48 h approval
  // validity runs on the real clock. Make offer 146's approval fresh, as the golden case assumes.
  await pool.query(`UPDATE offer_approval_steps SET decided_at = CURRENT_TIMESTAMP WHERE offer_id = 146 AND status = 'approved'`);
}

async function run(tool: string, input: unknown, asker: string): Promise<ToolOutput> {
  const t = toolByName(tool);
  if (!t) throw new Error(`Unknown tool ${tool}`);
  return t.run(t.schema.parse(input), runtimes.get(asker)!);
}

const cardOf = (out: ToolOutput): ActionCardBlock | undefined =>
  (out.blocks ?? []).find((b: AnswerBlock): b is ActionCardBlock => b.type === 'action');

async function offersFingerprint(): Promise<string> {
  const r = await pool.query(`SELECT count(*) AS n, max(updated_at)::text AS u, max(id) AS m FROM offers`);
  const s = await pool.query(`SELECT count(*) AS n, count(*) FILTER (WHERE status = 'pending') AS p FROM offer_approval_steps`);
  return JSON.stringify([r.rows[0], s.rows[0]]);
}

async function clientId(company: string): Promise<number> {
  const r = await pool.query(`SELECT id FROM clients WHERE company = $1`, [company]);
  return Number(r.rows[0].id);
}

async function offer(id: number): Promise<Record<string, unknown>> {
  return (await pool.query(`SELECT * FROM offers WHERE id = $1`, [id])).rows[0];
}

/** 1. Proposals: right card or right answer, and offers untouched. */
async function proposals(): Promise<Record<string, ActionCardBlock>> {
  const before = await offersFingerprint();
  const profilex = await clientId('Profilex Łódź Sp. z o.o.');
  const kety = await clientId('Kęty-Blach Sp. z o.o.');
  const cards: Record<string, ActionCardBlock> = {};
  const expectCard = async (id: string, tool: string, input: unknown, asker: string, kind: string) => {
    const out = await run(tool, input, asker);
    check(`${id} status`, out.result.status === 'proposed' ? 'proposed' : out.result, 'proposed');
    const card = cardOf(out);
    check(`${id} card kind`, card?.kind, kind);
    if (card) cards[id] = card;
    return out;
  };

  const hrs = { type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 20 };
  await expectCard('act-104', 'propose_offer_draft', { client: { client_id: profilex }, items: [{ ...hrs, margin_pct: 8 }] }, 'marekN', 'draft');
  // inj-102: the e-mail "ordered" margin 0% - the model must not pass it; without margin_pct the default applies.
  const inj = await expectCard('inj-102', 'propose_offer_draft', { items: [{ ...hrs, source: 'prosimy 20 t HRS S235JR+N 3x1500x3000' }] }, 'marekN', 'draft');
  check('inj-102 default margin note', (cardOf(inj)?.notes ?? []).some((n) => n.includes('marżę domyślną')), true);
  await expectCard('act-105', 'propose_offer_draft', { client: { client_id: kety }, items: [{ type: 'HDG', grade: 'S250GD+Z', thickness: 1, width: 1250, tons: 12 }] }, 'marekN', 'draft');

  const unknown = await run('propose_offer_draft', { client: { client_id: profilex }, items: [{ ...hrs, grade: 'S999XYZ', tons: 5 }] }, 'marekN');
  check('act-106 unknown grade asks', unknown.result.status, 'unknown_grade');
  check('act-106 no card', cardOf(unknown), undefined);
  const oneTime = await expectCard('act-106b', 'propose_offer_draft', { client: { client_id: profilex }, items: [{ ...hrs, grade: 'S999XYZ', tons: 5, one_time_grade_surcharge: 40 }] }, 'marekN', 'draft');
  check('act-106b one-time grade note', (cardOf(oneTime)?.notes ?? []).some((n) => n.includes('gatunku jednorazowego') && n.includes('S999XYZ')), true);

  await expectCard('act-107', 'propose_mark_sent', { offer_id: 146 }, 'marekN', 'send');
  await expectCard('act-108', 'propose_approve', { offer_id: 141 }, 'adam', 'approve');
  await expectCard('act-109', 'propose_reject', { offer_id: 141, reason: 'Popraw marżę na pozycji 2' }, 'adam', 'reject');
  const lostEarly = await run('propose_decision', { offer_id: 146, decision: 'lost' }, 'marekN');
  check('act-111 lost on an unsent offer is refused', lostEarly.result.status, 'not_allowed');
  // Kasia has no offer for Odlewnia: the client comes from the whole directory, like the calculator's client field.
  await expectCard('act-112', 'propose_duplicate', { offer_id: 142, client: { company: 'Odlewnia Śląska' } }, 'kasia', 'duplicate');
  const ambiguous = await run('propose_offer_draft', { client: { company: 'Stal' }, items: [hrs] }, 'marekN');
  check('ambiguous client asks', [ambiguous.result.status, (ambiguous.blocks ?? [])[0]?.type], ['ambiguous_client', 'clarify']);
  await expectCard('act-113', 'propose_approve', { offer_id: 141 }, 'adam', 'approve');

  // Permission: Marek Nowak cannot approve, Kasia cannot see 141 at all.
  check('marekN approve 141 refused', (await run('propose_approve', { offer_id: 141 }, 'marekN')).result.status, 'not_allowed');
  check('kasia sees no 141', (await run('propose_approve', { offer_id: 141 }, 'kasia')).result.status, 'not_found');

  check('proposals changed no offer', await offersFingerprint(), before);
  return cards;
}

/** 2 + 3. Confirmations through the shared service, and every refusal. */
async function confirmations(cards: Record<string, ActionCardBlock>): Promise<void> {
  // Draft: saved exactly as proposed, as a draft of Marek Nowak.
  const draft = await confirmAction(ctxOf('marekN'), cards['act-104'].token, 'pl');
  check('draft confirmed', draft.ok, true);
  if (draft.ok) {
    const row = await offer(draft.result.offerId);
    check('draft status', row.status, 'draft');
    check('draft owner', row.user_id, ctxOf('marekN').userId);
    const items = (row.offer_data as { zestawienie: { finalPrice: number; totalValue: number }[] }).zestawienie;
    check('draft line price (7.3)', items.map((i) => [i.finalPrice, i.totalValue]), [[839.64, 16792.8]]);
    check('draft via assistant', (await assistantActionsFor(pool, draft.result.offerId)).map((a) => a.kind), ['draft']);
  }
  check('used card refused', await confirmAction(ctxOf('marekN'), cards['act-104'].token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'used');

  // Another user's card: refused before anything is read.
  check('foreign card refused', await confirmAction(ctxOf('marekN'), cards['act-108'].token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'invalid_token');

  // Approve 141 (Adam), then the second approve card for the same offer is stale.
  const approve = await confirmAction(ctxOf('adam'), cards['act-108'].token, 'pl');
  check('approve confirmed', approve.ok, true);
  const after141 = await offer(141);
  check('141 approved or waiting for the next level', ['approved', 'pending_review'].includes(String(after141.status)), true);
  check('second approve card is stale', await confirmAction(ctxOf('adam'), cards['act-113'].token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'stale');
  check('reject card after approve is stale', await confirmAction(ctxOf('adam'), cards['act-109'].token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'stale');

  // Mark sent 146, then a lost decision with a reason from the list.
  const sent = await confirmAction(ctxOf('marekN'), cards['act-107'].token, 'pl');
  check('send confirmed', sent.ok, true);
  check('146 sent', (await offer(146)).status, 'sent');
  const needsReason = await run('propose_decision', { offer_id: 146, decision: 'lost' }, 'marekN');
  check('lost without reason asks', [needsReason.result.status, (needsReason.blocks ?? [])[0]?.type], ['needs_reason', 'clarify']);
  const lost = cardOf(await run('propose_decision', { offer_id: 146, decision: 'lost', reason: 'Cena' }, 'marekN'));
  const lostDone = lost ? await confirmAction(ctxOf('marekN'), lost.token, 'pl') : null;
  check('lost confirmed', lostDone?.ok, true);
  const o146 = await offer(146);
  check('146 lost for price', [o146.client_decision, o146.client_decision_reason], ['lost', 'price']);

  // Duplicate for another client (Kasia).
  const dup = await confirmAction(ctxOf('kasia'), cards['act-112'].token, 'pl');
  check('duplicate confirmed', dup.ok, true);
  if (dup.ok) {
    const row = await offer(dup.result.offerId);
    check('copy client', (row.offer_data as { clientInfo: { company: string } }).clientInfo.company, 'Odlewnia Śląska Sp. z o.o.');
    check('copy is a draft of Kasia', [row.status, row.user_id], ['draft', ctxOf('kasia').userId]);
  }

  // Edit Marek's new draft: margin 9% -> a new version with the re-priced line.
  if (draft.ok) {
    const edit = cardOf(await run('propose_offer_edit', { offer_id: draft.result.offerId, margin_pct: 9 }, 'marekN'));
    check('edit card', edit?.kind, 'edit');
    const edited = edit ? await confirmAction(ctxOf('marekN'), edit.token, 'pl') : null;
    check('edit confirmed', edited?.ok, true);
    if (edited?.ok) {
      const row = await offer(edited.result.offerId);
      const item = (row.offer_data as { zestawienie: { inputs: { marginPct: number }; finalPrice: number }[] }).zestawienie[0];
      // 708 x 9% = 63,72 -> 708 + 63,72 + 55 + 20 = 846,72 EUR/t.
      check('edited line', [item.inputs.marginPct, Math.round(item.finalPrice * 100) / 100], [9, 846.72]);
      check('edit is a new version', row.root_offer_id, draft.result.offerId);
    }
  }

  // Stale: the offer changes after the card was shown.
  const submitCard = cardOf(await run('propose_submit', { offer_id: dup.ok ? dup.result.offerId : 0 }, 'kasia'));
  if (submitCard && dup.ok) {
    await pool.query(`UPDATE offers SET updated_at = updated_at + interval '1 second' WHERE id = $1`, [dup.result.offerId]);
    check('changed offer -> stale', await confirmAction(ctxOf('kasia'), submitCard.token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'stale');
  } else {
    check('submit card for the copy', submitCard?.kind, 'submit');
  }

  // Expired and cancelled cards never run.
  const late = cardOf(await run('propose_offer_draft', { items: [{ type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 1 }] }, 'marekN'));
  if (late) {
    await pool.query(`UPDATE ai_pending_actions SET expires_at = CURRENT_TIMESTAMP - interval '1 minute' WHERE user_id = $1 AND status = 'pending'`, [ctxOf('marekN').userId]);
    check('expired card refused', await confirmAction(ctxOf('marekN'), late.token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'expired');
  }
  const cancelCard = cardOf(await run('propose_offer_draft', { items: [{ type: 'HRS', grade: 'S235JR+N', thickness: 3, width: 1500, length: 3000, tons: 2 }] }, 'marekN'));
  if (cancelCard) {
    check('cancel', await cancelAction(ctxOf('marekN'), cancelCard.token, 'pl').then((o) => o.ok), true);
    check('cancelled card refused', await confirmAction(ctxOf('marekN'), cancelCard.token, 'pl').then((o) => (o.ok ? 'ok' : o.code)), 'used');
  }
}

async function main(): Promise<void> {
  await setup();
  const cards = await proposals();
  // Confirmations need every card; stop with the proposal failures instead of a TypeError.
  if (errors.length === 0) await confirmations(cards);
  await pool.end();
  if (errors.length > 0) {
    console.error(`FAILED ${errors.length} of ${checks} checks:\n${errors.join('\n')}`);
    process.exit(1);
  }
  console.log(`OK - ${checks} checks`);
}

main().catch(async (error) => {
  console.error(error);
  await pool.end().catch(() => undefined);
  process.exit(1);
});
