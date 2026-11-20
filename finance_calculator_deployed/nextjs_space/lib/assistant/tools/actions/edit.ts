// propose_offer_edit: change an existing offer (margin, tons, lines, client, terms). The new
// offer_data is computed by lib/offers/editOfferData.ts; the card shows the change list from the
// same diff the offer list uses (offerVersionDiff). Confirm -> the same save path as the
// calculator (updateOffer): a changed offer becomes a new version, re-assessed for approval.

import { z } from 'zod';
import { loadOfferAccess } from '../../../access/offerAccess';
import { loadBaseResolver, loadDefaultMarginPct } from '../../../access/config';
import { fieldViolation } from '../../../access/fieldGuards';
import type { SteelType } from '../../../calculatorData';
import { applyOfferEdit, type EditProblem } from '../../../offers/editOfferData';
import { validateOfferItems } from '../../../offerItemValidation';
import type { ClientInfo } from '../../../pdfGenerator';
import { diffOfferVersions } from '../../../offerVersionDiff';
import { formatChange } from '../../../offerVersionDiffFormat';
import { translations } from '../../../translations';
import type { TableBlock } from '../../blocks';
import { offerVersionOf } from '../../actions/pending';
import { formatMoney, type Lang } from '../../format';
import { DELIVERY_TERMS, loadPriceBook, loadSettings } from '../../../pricing/priceItem';
import { statusLabel } from '../offers';
import { defineTool, pick, type ToolOutput } from '../types';
import { clientQuestion, clientRefSchema, resolveClient } from './client';
import { draftItemSchema } from './draft';
import { notFound, offerHref, offerMeta, offerTotals, proposeCard, refuse } from './shared';

const MAX_LINE_CHANGES = 20;

const editSchema = z
  .object({
    offer_id: z.number().int().positive(),
    margin_pct: z.number().min(-100).max(100).optional(),
    lines: z
      .array(
        z
          .object({
            line: z.number().int().positive(),
            margin_pct: z.number().min(-100).max(100).optional(),
            tons: z.number().positive().max(100000).optional(),
            remove: z.literal(true).optional(),
          })
          .strict()
      )
      .max(MAX_LINE_CHANGES)
      .optional(),
    add_items: z.array(draftItemSchema).min(1).max(MAX_LINE_CHANGES).optional(),
    /** Delivery term of added lines; omit when the offer's lines all use one term. */
    add_incoterm: z.enum(DELIVERY_TERMS).optional(),
    client: clientRefSchema.optional(),
    payment_term_days: z.number().int().min(0).max(365).optional(),
    quote_validity_hours: z.number().int().min(1).max(720).optional(),
  })
  .strict()
  .refine(
    (e) => e.margin_pct !== undefined || (e.lines?.length ?? 0) > 0 || e.add_items !== undefined || e.client !== undefined ||
      e.payment_term_days !== undefined || e.quote_validity_hours !== undefined,
    'Give at least one change'
  );

function problemOutput(problem: EditProblem, lang: Lang): ToolOutput {
  switch (problem.kind) {
    case 'no_line':
      return { result: { status: 'invalid', message: pick(lang, `Oferta nie ma pozycji ${problem.line} - sprawdź numery pozycji w get_offer.`, `The offer has no line ${problem.line} - check the line numbers with get_offer.`) } };
    case 'duplicate_line':
      return { result: { status: 'invalid', message: pick(lang, `Pozycja ${problem.line} występuje w zmianach dwa razy - podaj każdą pozycję raz.`, `Line ${problem.line} appears twice in the changes - give each line once.`) } };
    case 'needs_incoterm':
      return { result: { status: 'needs_incoterm', message: pick(lang, 'Pozycje oferty mają różne (albo żadne) warunki dostawy - zapytaj, czy nowe pozycje to CPT, FCA czy FCA Kraków, i podaj add_incoterm.', 'The offer lines use different (or no) delivery terms - ask whether the new lines are CPT, FCA or FCA Kraków and pass add_incoterm.') } };
    case 'legacy_line':
      return refuse(lang, `Pozycja ${problem.line} jest zapisana starym formatem i nie da się jej przeliczyć automatycznie - zmień ją w kalkulatorze.`, `Line ${problem.line} uses the old format and cannot be re-priced automatically - change it in the calculator.`);
    case 'no_lines_left':
      return refuse(lang, 'Oferta musi mieć co najmniej jedną pozycję.', 'An offer needs at least one line.');
    case 'added_line': {
      const p = problem.problem;
      const n = problem.index + 1;
      if (p.status === 'retired_grade') {
        return { result: { status: 'retired_grade', grade: p.grade, message: pick(lang, `Nowa pozycja ${n}: gatunek "${p.grade}" jest wycofany z listy - zapytaj o gatunek z aktualnej listy.`, `New line ${n}: grade "${p.grade}" is retired - ask for a grade from the current list.`) } };
      }
      if (p.status === 'unknown_grade') {
        return { result: { status: 'unknown_grade', grade: p.grade, message: pick(lang,
          `Nowa pozycja ${n}: gatunku "${p.grade}" nie ma na liście gatunków. Zapytaj o dopłatę za gatunek jednorazowy (one_time_grade_surcharge) - nie wymyślaj jej.`,
          `New line ${n}: grade "${p.grade}" is not on the list. Ask for a one-time grade surcharge (one_time_grade_surcharge) - never invent it.`) } };
      }
      return { result: { status: p.status, message: pick(lang, `Nowej pozycji ${n} nie da się wycenić (${p.status === 'out_of_range' ? 'wymiary poza tabelą' : 'ilość'}) - zapytaj użytkownika.`, `New line ${n} cannot be priced (${p.status === 'out_of_range' ? 'dimensions out of range' : 'quantity'}) - ask the user.`) } };
    }
  }
}

export const proposeOfferEdit = defineTool({
  name: 'propose_offer_edit',
  description:
    'Propose changes to ONE existing offer: margin_pct (all lines), lines [{line (1-based, as get_offer lists them), margin_pct?, tons?, remove?}], add_items (new lines, priced like a fresh calculator line), ' +
    'client ({client_id} or {company, nip?, address?}), payment_term_days, quote_validity_hours. A changed line keeps its own PGL and options; only what was asked changes. ' +
    'Shows a card with every change; nothing is saved until the user clicks. A changed offer in review becomes a new version and is assessed again.',
  schema: editSchema,
  run: async (input, rt): Promise<ToolOutput> => {
    const { lang, db } = rt;
    const version = await offerVersionOf(db, input.offer_id);
    const access = await loadOfferAccess(rt.ctx, input.offer_id, db);
    if (!access || version === null) return notFound(lang);
    const { offer, actions } = access;
    if (!actions.canEdit) {
      return refuse(lang, `Nie możesz edytować tej oferty (status "${statusLabel(offer.status, lang)}").`, `You cannot edit this offer (status "${statusLabel(offer.status, lang)}").`);
    }
    const current = (offer.offer_data ?? {}) as Record<string, unknown>;

    const [settings, book, baseOf, defaultMarginPct] = await Promise.all([
      loadSettings(db), loadPriceBook(db), loadBaseResolver(current.validFrom, db), loadDefaultMarginPct(db),
    ]);
    let client: { info: ClientInfo; paymentTermDays: number } | undefined;
    if (input.client) {
      const resolution = await resolveClient(rt, input.client);
      if (resolution.kind !== 'ok') return clientQuestion(resolution, lang);
      client = { info: resolution.client.info, paymentTermDays: resolution.client.paymentTermDays ?? settings.paymentTermDays };
    }

    const edited = applyOfferEdit(current, {
      marginPct: input.margin_pct,
      lines: input.lines,
      addItems: input.add_items?.map(({ source: _source, ...item }) => item),
      addIncoterm: input.add_incoterm,
      client,
      paymentTermDays: input.payment_term_days,
      quoteValidityHours: input.quote_validity_hours,
    }, { settings, book, pglOf: (type: SteelType) => baseOf(type), defaultMarginPct, stamp: Date.now() });
    if (!edited.ok) return problemOutput(edited.problem, lang);

    const perms = rt.ctx.memberships.find((m) => m.flowId === offer.flow_id)?.permissions;
    const violation = fieldViolation(rt.ctx.isSuperuser || !perms ? 'all' : perms, edited.offerData, current, baseOf, defaultMarginPct);
    if (violation === 'margin_locked') return refuse(lang, 'Twoja rola nie może zmieniać ceny ani marży.', 'Your role cannot change the price or margin.');
    if (violation) return refuse(lang, 'Twoja rola nie może zapisać takiej zmiany.', 'Your role cannot save such a change.');
    const itemsError = validateOfferItems(edited.offerData);
    if (itemsError) throw new Error(`Edited offer failed validation: ${itemsError}`);

    const changes = diffOfferVersions(current, edited.offerData).map((c) => formatChange(c, translations[lang].versionDiff));
    if (changes.length === 0) return { result: { status: 'no_change', message: pick(lang, 'Ta zmiana niczego nie zmienia w ofercie - powiedz to użytkownikowi.', 'This change does not change anything in the offer - tell the user.') } };

    const meta = await offerMeta(rt, offer.id);
    const before = offerTotals(current, lang);
    const after = offerTotals(edited.offerData, lang);
    const table: TableBlock = { type: 'table', title: pick(lang, 'Zmiany', 'Changes'), columns: [pick(lang, 'Zmiana', 'Change')], rows: changes.map((c) => [c]) };
    const inReview = offer.status === 'pending_review' || offer.status === 'approved';
    return proposeCard(rt, { kind: 'edit', payload: { offerId: offer.id, offerName: offer.offer_name ?? null, offerData: edited.offerData } }, version, {
      title: pick(lang, 'Zmień ofertę', 'Change the offer'),
      offer: { name: meta.name, href: offerHref(offer.id) },
      rows: [
        [pick(lang, 'Klient', 'Client'), meta.client ?? '-'],
        [pick(lang, 'Przed', 'Before'), `${before.tons} · ${before.value}`],
        [pick(lang, 'Po', 'After'), `${after.tons} · ${after.value}`],
      ],
      table,
      notes: [
        pick(lang, 'Zmieniane pozycje zachowują swój PGL, gatunek i wybrane opcje; dopłaty z tabel cennika liczone są z aktualnego cennika, jak w kalkulatorze.', 'Changed lines keep their PGL, grade and chosen options; table surcharges come from the current price book, as in the calculator.'),
        ...edited.repriced.map((r) => pick(lang,
          `Pozycja ${r.line}: cennik zmienił się od zapisu - dopłaty huty ${formatMoney(r.sumaHuta[0], 'EUR', lang)} -> ${formatMoney(r.sumaHuta[1], 'EUR', lang)}/t, SSC ${formatMoney(r.sumaSSC[0], 'EUR', lang)} -> ${formatMoney(r.sumaSSC[1], 'EUR', lang)}/t.`,
          `Line ${r.line}: the price book changed since it was saved - mill surcharges ${formatMoney(r.sumaHuta[0], 'EUR', lang)} -> ${formatMoney(r.sumaHuta[1], 'EUR', lang)}/t, SSC ${formatMoney(r.sumaSSC[0], 'EUR', lang)} -> ${formatMoney(r.sumaSSC[1], 'EUR', lang)}/t.`)),
        ...(inReview ? [pick(lang, 'Zmieniona oferta w akceptacji zapisze się jako nowa wersja i zostanie ponownie oceniona przez reguły.', 'A changed offer in review is saved as a new version and assessed by the rules again.')] : []),
        ...(offer.status === 'sent' ? [pick(lang, 'To renegocjacja przegranej oferty - zapisze się nowa wersja jako szkic.', 'This renegotiates a lost offer - a new version is saved as a draft.')] : []),
      ],
      confirmLabel: pick(lang, 'Zapisz zmiany', 'Save changes'),
    }, { offer: meta.name, changes, total_before: before.value, total_after: after.value });
  },
});
