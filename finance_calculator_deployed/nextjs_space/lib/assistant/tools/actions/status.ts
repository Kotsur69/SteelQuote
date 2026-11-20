// propose_submit / propose_mark_sent / propose_approve / propose_reject / propose_decision /
// propose_duplicate: one EXISTING offer each (plan D19 - no bulk actions, one card per offer).
//
// Every tool checks the same permission the app's button would (offerActions via
// loadOfferAccess) so the user is told "you can't" before a card is shown - but the decisive
// check is the shared offer service at confirm time, with the then-current data.

import { z } from 'zod';
import { loadOfferAccess, type OfferAccess } from '../../../access/offerAccess';
import { activeLostReasons, validateLostChoice } from '../../../lostReasons';
import { loadLostReasons } from '../../../lostReasonsDb';
import { hasRequiredCompanyDetails, normalizeClientInfo } from '../../../pdfGenerator';
import { loadSettings } from '../pricing';
import { offerVersionOf } from '../../actions/pending';
import type { ClarifyBlock } from '../../blocks';
import { statusLabel } from '../offers';
import { defineTool, pick, type ToolOutput, type ToolRuntime } from '../types';
import { clientQuestion, clientRefSchema, resolveClient } from './client';
import { linesTable, notFound, offerHref, offerMeta, proposeCard, refuse, summaryRows, type OfferMeta } from './shared';

const offerIdSchema = z.number().int().positive();

interface Target {
  access: OfferAccess;
  meta: OfferMeta;
  version: string;
}

/** The offer as the user may see it, with the version the card is built from. */
async function loadTarget(rt: ToolRuntime, offerId: number): Promise<Target | null> {
  // Version first: a write after this read makes the confirm refuse (lib/assistant/actions/pending.ts).
  const version = await offerVersionOf(rt.db, offerId);
  const access = await loadOfferAccess(rt.ctx, offerId, rt.db);
  if (!access || version === null) return null;
  return { access, meta: await offerMeta(rt, offerId), version };
}

const offerRef = (t: Target) => ({ name: t.meta.name, href: offerHref(t.access.offer.id) });

// --- submit -------------------------------------------------------------------------------

export const proposeSubmit = defineTool({
  name: 'propose_submit',
  description:
    'Propose submitting ONE own offer (draft or rejected, or approved but expired) for approval. Shows a confirmation card with the approval path; ' +
    'nothing changes until the user clicks. Never say it was submitted.',
  schema: z.object({ offer_id: offerIdSchema }).strict(),
  run: async ({ offer_id }, rt): Promise<ToolOutput> => {
    const { lang } = rt;
    const t = await loadTarget(rt, offer_id);
    if (!t) return notFound(lang);
    const { offer, actions, assessment } = t.access;
    if (offer.user_id !== rt.ctx.userId) return refuse(lang, 'Do akceptacji przekazuje tylko autor oferty.', 'Only the author submits an offer for approval.');
    const revalidation = offer.status === 'approved' && actions.approval?.needsRevalidation === true;
    if ((offer.status !== 'draft' && offer.status !== 'rejected' && !revalidation) || !assessment) {
      return refuse(lang, `Oferta ma status "${statusLabel(offer.status, lang)}" - nie można jej teraz przekazać do akceptacji.`, `The offer is "${statusLabel(offer.status, lang)}" - it cannot be submitted now.`);
    }
    const { plan } = assessment;
    if (plan.blocked) return refuse(lang, 'Konfiguracja akceptacji w tym flow ma konflikt poziomów - zgłoś to administratorowi.', 'The approval configuration of this flow has a level conflict - report it to the administrator.');
    const direct = plan.steps.length === 0;
    if (direct ? !actions.canSend : !actions.canSubmit) return refuse(lang, 'Twoja rola nie może przekazać tej oferty do akceptacji.', 'Your role cannot submit this offer.');

    const path = direct
      ? pick(lang, 'bez akceptacji - oferta zostanie od razu zatwierdzona', 'no approval - the offer is approved straight away')
      : plan.steps.map((s) => `${s.level.name} (${s.level.code})`).join(', ');
    const to = direct ? statusLabel('approved', lang) : statusLabel('pending_review', lang);
    return proposeCard(rt, { kind: 'submit', payload: { offerId: offer.id } }, t.version, {
      title: pick(lang, 'Przekaż ofertę do akceptacji', 'Submit the offer for approval'),
      offer: offerRef(t),
      transition: { from: statusLabel(offer.status, lang), to },
      rows: [...summaryRows(t.access, t.meta, lang), [pick(lang, 'Akceptacja', 'Approval'), path]],
      notes: [],
      confirmLabel: pick(lang, 'Przekaż do akceptacji', 'Submit'),
    }, { offer: t.meta.name, approval_path: path, new_status: to });
  },
});

// --- mark sent ----------------------------------------------------------------------------

export const proposeMarkSent = defineTool({
  name: 'propose_mark_sent',
  description:
    'Propose marking ONE own offer as sent to the client (the app sends nothing itself: the user confirms they sent it, so won / lost can be tracked). ' +
    'Only the author, for an approved offer or one that needs no approval. Nothing changes until the user clicks.',
  schema: z.object({ offer_id: offerIdSchema }).strict(),
  run: async ({ offer_id }, rt): Promise<ToolOutput> => {
    const { lang } = rt;
    const t = await loadTarget(rt, offer_id);
    if (!t) return notFound(lang);
    const { offer, actions } = t.access;
    if (!hasRequiredCompanyDetails(normalizeClientInfo(offer.offer_data?.clientInfo))) {
      return refuse(lang, 'Oferta nie ma danych firmy klienta (nazwa firmy i NIP) - trzeba je uzupełnić w kalkulatorze.', 'The offer has no client company details (company name and NIP) - complete them in the calculator.');
    }
    if (!actions.canSend) {
      return actions.needsValidation
        ? refuse(lang, 'Oferta wymaga akceptacji przed wysłaniem.', 'The offer needs approval before it can be sent.')
        : refuse(lang, 'Tej oferty nie możesz teraz oznaczyć jako wysłanej (wysyła tylko autor, oferta musi być zatwierdzona i aktualna).', 'You cannot mark this offer as sent now (only the author sends, and it must be approved and current).');
    }
    return proposeCard(rt, { kind: 'send', payload: { offerId: offer.id } }, t.version, {
      title: pick(lang, 'Oznacz jako wysłaną do klienta', 'Mark as sent to the client'),
      offer: offerRef(t),
      transition: { from: statusLabel(offer.status, lang), to: statusLabel('sent', lang) },
      rows: summaryRows(t.access, t.meta, lang),
      notes: [pick(lang,
        'Aplikacja niczego nie wysyła - potwierdzasz, że oferta poszła do klienta. Po tym oferta jest tylko do odczytu.',
        'The app sends nothing - you confirm the offer went to the client. After that the offer is read-only.')],
      confirmLabel: pick(lang, 'Oznacz jako wysłaną', 'Mark as sent'),
    }, { offer: t.meta.name, new_status: statusLabel('sent', lang) });
  },
});

// --- approve / reject ---------------------------------------------------------------------

function reviewCheck(t: Target, lang: ToolRuntime['lang']): ToolOutput | null {
  if (t.access.offer.status !== 'pending_review') {
    return refuse(lang, `Oferta ma status "${statusLabel(t.access.offer.status, lang)}" - nie czeka na akceptację.`, `The offer is "${statusLabel(t.access.offer.status, lang)}" - it is not waiting for approval.`);
  }
  if (!t.access.actions.canReview) return refuse(lang, 'Ta oferta nie czeka na Twoją decyzję.', 'This offer is not waiting for your decision.');
  return null;
}

export const proposeApprove = defineTool({
  name: 'propose_approve',
  description:
    'Propose approving ONE offer that waits for the user\'s approval. One card per offer - for "approve all" list them (my_queue) and propose each separately. ' +
    'comment is optional. Nothing changes until the user clicks. Never say it was approved.',
  schema: z.object({ offer_id: offerIdSchema, comment: z.string().trim().min(1).max(1000).optional() }).strict(),
  run: async ({ offer_id, comment }, rt): Promise<ToolOutput> => {
    const { lang } = rt;
    const t = await loadTarget(rt, offer_id);
    if (!t) return notFound(lang);
    const refused = reviewCheck(t, lang);
    if (refused) return refused;
    const pendingLevels = t.access.steps.filter((s) => s.status === 'pending').map((s) => s.levelCode);
    return proposeCard(rt, { kind: 'approve', payload: { offerId: t.access.offer.id, comment: comment ?? null } }, t.version, {
      title: pick(lang, 'Zatwierdź ofertę', 'Approve the offer'),
      offer: offerRef(t),
      transition: { from: statusLabel('pending_review', lang), to: statusLabel('approved', lang) },
      rows: [
        ...summaryRows(t.access, t.meta, lang),
        [pick(lang, 'Czeka na poziomy', 'Waiting for levels'), pendingLevels.join(', ') || '-'],
        ...(comment ? [[pick(lang, 'Komentarz', 'Comment'), comment] as [string, string]] : []),
      ],
      table: linesTable(t.access.offer.offer_data, lang),
      notes: [
        ...(t.access.actions.reviewAsStandIn ? [pick(lang, 'Zatwierdzasz w zastępstwie niższego poziomu.', 'You approve as a stand-in for a lower level.')] : []),
        ...(pendingLevels.length > 1 ? [pick(lang, 'Jeśli czekają też inne poziomy, oferta zostanie zatwierdzona dopiero po ich akceptacji.', 'If other levels are also pending, the offer is approved only after they approve too.')] : []),
      ],
      confirmLabel: pick(lang, 'Zatwierdź', 'Approve'),
    }, { offer: t.meta.name });
  },
});

export const proposeReject = defineTool({
  name: 'propose_reject',
  description:
    'Propose rejecting ONE offer that waits for the user\'s approval. reason is REQUIRED and must be the user\'s own words (what the salesperson should fix) - ' +
    'if the user gave no reason, ask for it first; never invent one. Nothing changes until the user clicks.',
  schema: z.object({ offer_id: offerIdSchema, reason: z.string().trim().min(3).max(1000) }).strict(),
  run: async ({ offer_id, reason }, rt): Promise<ToolOutput> => {
    const { lang } = rt;
    const t = await loadTarget(rt, offer_id);
    if (!t) return notFound(lang);
    const refused = reviewCheck(t, lang);
    if (refused) return refused;
    return proposeCard(rt, { kind: 'reject', payload: { offerId: t.access.offer.id, reason } }, t.version, {
      title: pick(lang, 'Odrzuć ofertę', 'Reject the offer'),
      offer: offerRef(t),
      transition: { from: statusLabel('pending_review', lang), to: statusLabel('rejected', lang) },
      rows: [...summaryRows(t.access, t.meta, lang), [pick(lang, 'Powód (dla handlowca)', 'Reason (for the salesperson)'), reason]],
      notes: [pick(lang, 'Odrzucenie kończy całą rundę akceptacji - handlowiec poprawia ofertę i przekazuje ją ponownie.', 'A rejection ends the whole approval round - the salesperson fixes the offer and submits it again.')],
      confirmLabel: pick(lang, 'Odrzuć', 'Reject'),
    }, { offer: t.meta.name });
  },
});

// --- client decision ----------------------------------------------------------------------

export const proposeDecision = defineTool({
  name: 'propose_decision',
  description:
    'Propose recording the client\'s answer on ONE sent offer: won or lost. A loss needs a reason from the app\'s list (code or label from list_lost_reasons) - ' +
    'if the user gave none, call without reason: the tool shows the reasons as buttons. Reason "other" also needs a note. Nothing changes until the user clicks.',
  schema: z
    .object({
      offer_id: offerIdSchema,
      decision: z.enum(['won', 'lost']),
      reason: z.string().trim().min(1).max(100).optional(),
      note: z.string().trim().min(1).max(1000).optional(),
    })
    .strict(),
  run: async ({ offer_id, decision, reason, note }, rt): Promise<ToolOutput> => {
    const { lang } = rt;
    const t = await loadTarget(rt, offer_id);
    if (!t) return notFound(lang);
    const { offer, actions } = t.access;
    if (offer.status !== 'sent') return refuse(lang, 'Decyzję klienta zapisuje się tylko na ofercie wysłanej do klienta.', 'A client decision is recorded only on an offer sent to the client.');
    if (!actions.canRecordDecision) return refuse(lang, 'Nie możesz zapisać decyzji klienta dla tej oferty.', 'You cannot record the client decision for this offer.');

    let reasonCode: string | null = null;
    let reasonLabel: string | null = null;
    if (decision === 'lost') {
      const active = activeLostReasons((await loadLostReasons(rt.db)).reasons);
      if (!reason) {
        const clarify: ClarifyBlock = {
          type: 'clarify',
          options: active.map((r) => ({ label: r.labels[lang] || r.labels.pl, value: pick(lang, `Powód przegranej: ${r.labels.pl}`, `Lost reason: ${r.labels[lang] || r.labels.pl}`) })),
        };
        return { result: { status: 'needs_reason', reasons: active.map((r) => ({ code: r.code, label: r.labels[lang] || r.labels.pl })), message: pick(lang, 'Zapytaj o powód przegranej - przyciski z listy są już pokazane.', 'Ask for the lost reason - the buttons from the list are already shown.') }, blocks: [clarify] };
      }
      const wanted = reason.toLowerCase();
      const match = active.find((r) => r.code === reason || r.labels.pl.toLowerCase() === wanted || r.labels.en.toLowerCase() === wanted);
      if (!match) return { result: { status: 'invalid_reason', reasons: active.map((r) => ({ code: r.code, label: r.labels[lang] || r.labels.pl })), message: pick(lang, 'Tego powodu nie ma na liście - zapytaj użytkownika, który z listy.', 'That reason is not on the list - ask the user which one.') } };
      const choice = validateLostChoice(match.code, note, new Set(active.map((r) => r.code)));
      if (!choice.ok && choice.error === 'note_required') return { result: { status: 'needs_note', message: pick(lang, 'Dla tego powodu potrzebna jest notatka - zapytaj użytkownika, co się stało.', 'This reason needs a note - ask the user what happened.') } };
      if (!choice.ok) return { result: { status: 'invalid_reason', message: pick(lang, 'Tego powodu nie ma na liście - zapytaj użytkownika, który z listy.', 'That reason is not on the list - ask the user which one.') } };
      reasonCode = choice.reason;
      reasonLabel = match.labels[lang] || match.labels.pl;
    }

    const won = decision === 'won';
    return proposeCard(rt, { kind: 'decision', payload: { offerId: offer.id, decision, reason: reasonCode, note: note ?? null } }, t.version, {
      title: won ? pick(lang, 'Oznacz jako wygraną', 'Mark as won') : pick(lang, 'Oznacz jako przegraną', 'Mark as lost'),
      offer: offerRef(t),
      rows: [
        ...summaryRows(t.access, t.meta, lang),
        [pick(lang, 'Decyzja klienta', 'Client decision'), won ? pick(lang, 'wygrana', 'won') : pick(lang, 'przegrana', 'lost')],
        ...(reasonLabel ? [[pick(lang, 'Powód', 'Reason'), reasonLabel] as [string, string]] : []),
        ...(note ? [[pick(lang, 'Notatka', 'Note'), note] as [string, string]] : []),
      ],
      notes: [],
      confirmLabel: won ? pick(lang, 'Oznacz jako wygraną', 'Mark as won') : pick(lang, 'Oznacz jako przegraną', 'Mark as lost'),
    }, { offer: t.meta.name, decision, ...(reasonLabel ? { reason: reasonLabel } : {}) });
  },
});

// --- duplicate ----------------------------------------------------------------------------

export const proposeDuplicate = defineTool({
  name: 'propose_duplicate',
  description:
    'Propose copying ONE own offer as a new draft, optionally for another client (client: {client_id} from find_clients, or {company, nip?, address?} for a new one) - ' +
    'the copy then takes that client\'s payment term. Prices and lines are copied unchanged. Nothing changes until the user clicks.',
  schema: z.object({ offer_id: offerIdSchema, client: clientRefSchema.optional() }).strict(),
  run: async ({ offer_id, client }, rt): Promise<ToolOutput> => {
    const { lang } = rt;
    const t = await loadTarget(rt, offer_id);
    if (!t) return notFound(lang);
    if (!t.access.actions.canDuplicate) return refuse(lang, 'Kopiować można tylko własne oferty.', 'Only own offers can be copied.');

    let overrides: { clientInfo?: ReturnType<typeof normalizeClientInfo>; paymentTermDays?: number } = {};
    let clientName = t.meta.client;
    if (client) {
      const resolution = await resolveClient(rt, client);
      if (resolution.kind !== 'ok') return clientQuestion(resolution, lang);
      const settings = await loadSettings(rt.db);
      overrides = { clientInfo: resolution.client.info, paymentTermDays: resolution.client.paymentTermDays ?? settings.paymentTermDays };
      clientName = resolution.client.info.company;
    }
    const copyData = { ...(t.access.offer.offer_data ?? {}), ...overrides };
    return proposeCard(rt, { kind: 'duplicate', payload: { offerId: t.access.offer.id, overrides } }, t.version, {
      title: pick(lang, 'Skopiuj ofertę jako nowy szkic', 'Copy the offer as a new draft'),
      offer: offerRef(t),
      transition: { from: t.meta.name, to: pick(lang, `nowy szkic "Kopia ${t.meta.name}"`, `new draft "Kopia ${t.meta.name}"`) },
      rows: [
        [pick(lang, 'Klient kopii', 'Client of the copy'), clientName ?? '-'],
        ...(overrides.clientInfo ? [
          ['NIP', overrides.clientInfo.nip || '-'] as [string, string],
          [pick(lang, 'Adres', 'Address'), overrides.clientInfo.address || '-'] as [string, string],
        ] : []),
        ...(overrides.paymentTermDays !== undefined ? [[pick(lang, 'Termin płatności', 'Payment term'), pick(lang, `${overrides.paymentTermDays} dni`, `${overrides.paymentTermDays} days`)] as [string, string]] : []),
      ],
      table: linesTable(copyData, lang),
      notes: [pick(lang, 'Ceny i pozycje są kopiowane bez zmian; kopię możesz poprawić w kalkulatorze.', 'Prices and lines are copied unchanged; you can adjust the copy in the calculator.')],
      confirmLabel: pick(lang, 'Utwórz kopię', 'Create the copy'),
    }, { offer: t.meta.name, client: clientName });
  },
});

export const STATUS_TOOLS = [proposeSubmit, proposeMarkSent, proposeApprove, proposeReject, proposeDecision, proposeDuplicate] as const;
