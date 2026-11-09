# AI Assistant ("Luna w aplikacji") - plan v2

Status: **phase 0 in progress** (11-09: knowledge base PL, demo DB + seed, golden set v1 done;
waiting on Mati for 14.1 Q1-Q5, catalog sign-off, API key). v1 written 2026-11-02, v2 rewritten
2026-11-09 (planning session with Mati, decisions D1-D24 below). This file is the single source of truth - update it as
decisions are made.

Mode: **demo first, production later.** Built production-grade from day one, runs on the demo DB
(fake clients and offers) until the go-live gate (section 9) is passed.

Scope: a chat agent fully integrated with SteelQuote. It answers questions about the app, about
single offers and about any aggregate over offer data ("ile ofert wysłaliśmy w listopadzie 2025",
"o ile poprawiliśmy się względem poprzedniego miesiąca", "jaka jest średnia marża Marka", "ile ton
Marek sprzedał w listopadzie", "ilu klientów dostało ofertę od Marka w zeszłym miesiącu"). It can
also **act**: create draft offers, edit / duplicate, submit, mark sent, approve / reject, mark won /
lost - always behind a confirmation card the user clicks.

Non-negotiable: **it uses only real offer data, counts exactly, and never goes beyond what the data
provides.** Section 3 is the contract that enforces this in code, not in the prompt.

---

## 1. Decision log

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 11-09 | Demo first on demo DB, built production-grade; go-live gate before real data | company showcase now, real use later without a rewrite |
| D2 | 11-09 | Model: **Claude Sonnet 5.5** (Anthropic API), provider-neutral adapter kept. Free Gemini/Groq dropped as primary | "as smart as possible"; multi-step analytics needs the strongest tool use. Demo costs a few dollars |
| D3 | 11-09 | Offer creation = agent builds the offer, server prices it with the real engine, **confirmation card -> saved as DRAFT**. User reviews in the calculator | numbers come from `pricingEngine`, user stays in control |
| D4 | 11-09 | Margin questions answer **both**: tonnage-weighted (dashboard definition) as headline + simple average per offer | weighted matches /analytics; simple is what people often mean |
| D5 | 11-09 | Questions are open-ended - the agent gets **one general metrics tool** (measure x filters x group-by x period x comparison), not one tool per question | "more of those questions will come" |
| D6 | 11-09 | "Sold" = **won offers, dated by the decision date**. "Sent / offered" = sent offers by sent date. "Created / made" = created date | one fixed vocabulary, stated in every answer |
| D7 | 11-09 | Write actions allowed (all with confirmation card): **create draft, edit / duplicate, submit for approval, mark sent, approve / reject (approvers), mark won / lost + reason** | full integration |
| D8 | 11-09 | Output: **tables + offer cards, inline charts, "Otwórz panel analizy" link (made exact by D23), Excel export** | verifiable answers |
| D9 | 11-09 | Memory: **current chat only** (no chat history saved, nothing remembered across chats) | privacy, simplicity |
| D10 | 11-09 | **Data-versioned answer cache** for repeated questions + Anthropic prompt caching | repeated questions instant and free, never stale |
| D11 | 11-09 | Logs: **metadata + actions only** (tools, params, row counts, tokens, cost, guard hits, feedback); no chat text stored. Executed actions recorded in offer history as "via assistant" | audit without storing conversations |
| D12 | 11-09 | Incomplete period comparisons ("vs zeszły miesiąc" on 9 Nov): **ask the user every time** with buttons | no silent definition choice |
| D13 | 11-09 | Money answers in **EUR + PLN** (EUR source of truth, PLN by each offer's frozen rate) - same as the dashboard | matches /analytics exactly |
| D14 | 11-09 | **Users ask mostly in Polish.** Polish is the primary language for prompt examples, knowledge base, golden set, UI, footers and number formatting; English supported. Answer in the language of the question | real users are Polish sales staff |
| D15 | 11-09 | Release: **experimental branch off 2.3** (from commit `9cc4228`), not part of 2.3. Mati keeps working on 2.3 on `main`; the branch merges main in regularly | 2.3 stays shippable |
| D16 | 11-09 | Draft input: **typed instruction + pasted client RFQ e-mail** (agent extracts client + items; every parsed value shown in the card). Attachments (PDF / Excel) not in v1 | covers the real workflow without attachment parsing |
| D17 | 11-09 | UI: **bubble on every page + full page `/asystent`** ("rozwiń"), same chat state carried over | quick questions + room for wide tables / charts |
| D18 | 11-09 | Access: **everyone**; every action only when the user's role already allows it in the UI; admin can switch the assistant off per user | permissions already exist, no second rulebook |
| D19 | 11-09 | **No bulk actions.** One offer per confirmation card; "zatwierdź wszystkie oferty Marka" -> list + one card per offer | no mass approval by one misclick |
| D20 | 11-09 | Unpriceable RFQ line (unknown grade, dimension outside tables): **draft is saved, the line is flagged "do uzupełnienia" with the reason**; submit stays blocked until fixed. **To verify:** `validateOfferItems` on POST may reject an unpriced item today - if so, define the flagged-line shape so it passes draft validation but fails submit validation | user fixes one line instead of retyping the RFQ |
| D21 | 11-09 | Simple-average margin also shown on **/analytics as a small KPI** next to the weighted one | keeps "every number the agent says is visible in Analytics" |
| D22 | 11-09 | Demo budget **$20 / month**: hard stop in the app (`AI_MONTHLY_BUDGET_USD=20`) + spend limit in the Anthropic console | dev + eval + demo fit easily |
| D24 | 11-09 | **Proactive follow-ups.** After an answer the assistant offers the next useful step as a short question + up to 3 clickable chips, e.g. "Chcesz zobaczyć szczegóły w panelu analizy?" [Pokaż w panelu analizy] [Porównaj z wrześniem] [Rozbij na handlowców]. Chips are built by the server from the query that was run (section 6.2), the model only phrases the question | feels smart, but every suggestion is guaranteed to be valid and answerable |
| D23 | 11-09 | **Every data-analysis answer gets a "Otwórz panel analizy" button that opens /analytics with exactly the matching settings selected** (period, date basis, filters, measure, breakdown, chart, the relevant section scrolled into view). Requires /analytics to restore its full state from the URL (section 6.1) | the user sees the whole panel behind the answer in one click, and can keep exploring from there |

---

## 2. What it must handle (question classes)

Examples only - the design must cover the whole class, not the sentence.

| Class | Examples | Answered by |
|---|---|---|
| A. Aggregates | "ile ofert wysłano w listopadzie 2025", "ile ton sprzedał Marek w listopadzie", "ilu klientów dostało ofertę od Marka w zeszłym miesiącu", "średnia marża Marka" | `query_metrics` (section 5) on the analytics engine |
| B. Comparisons / trends | "o ile poprawiliśmy się względem poprzedniego miesiąca", "Marek vs Anna w tym kwartale", "tonaż mojego zespołu miesiąc po miesiącu w 2026" | `query_metrics` with `compare` / `group_by` / `granularity`; deltas computed by the server |
| C. Rankings | "kto sprzedał najwięcej w październiku", "top 5 klientów po wygranym tonażu" | `query_metrics` group_by + sort + limit |
| D. Lists / lookups | "oferty Marka z wczoraj", "oferty dla Stalprofilu czekające na akceptację" | `search_offers` |
| E. Single offer | "jaki jest status offer_123", "dlaczego 123 została odrzucona", "co jest nie tak z tą ofertą" (page context) | `get_offer` |
| F. My queue | "co mam do wysłania", "co czeka na moją decyzję", "kto blokuje moją ofertę" | `my_queue` |
| G. Knowledge | "co oznacza PGL", "jak liczy się transport" | knowledge base in the system prompt |
| H. Calculations | "transport 42 t do Poznania", "cena S235 3 x 1500 x 3000, 20 t" | `calculate_transport`, `price_item` (real engine) |
| I. Actions | "zrób ofertę dla X: 20 t HRS S235 3 mm...", "zatwierdź 123", "oznacz 123 jako przegraną - cena" | `propose_*` tools -> confirmation card -> confirm endpoint (section 6) |
| J. Out of scope | "jak zmienią się ceny stali", "ile Marek sprzeda w grudniu", "ile bierze konkurencja" | polite refusal: no forecasting, no external data (section 3, rule 7) |

Known gap (from v1): "czy Marek zrobił ofertę, o którą prosiłem?" - the app has no "offer request"
concept. Answered as "oferty Marka w okresie X (dla klienta Y)" with an honest note. Real fix =
optional offer-requests feature (phase 7).

---

## 3. Accuracy contract ("never beyond the data")

The model is a **router and a writer**, never a calculator and never a source of facts. Every rule
below is enforced in server code; the prompt only repeats them.

1. **Fixed metric catalog.** The model can only request metrics by ID from `lib/assistant/metrics.ts`
   (table in 3.1). Each metric has one definition, one date basis, one unit. No free-form SQL, no
   model-defined metrics.
2. **One engine with the dashboard.** All aggregates run through the existing analytics pipeline:
   `analyticsQuery` (visibility + latest version per family, DB timezone) -> `normalizeOffers` ->
   `computeKpi` / series / groups. The assistant and /analytics can never disagree. Any metric the
   dashboard lacks (e.g. simple-average margin) is added **to the engine**, not to the assistant.
3. **Server does all math.** Totals, averages, deltas, % change, shares, rankings are returned by
   tools. The model never adds, divides or rounds. A `compare` result already contains
   `delta_abs` and `delta_pct`.
4. **Number guard on the final answer.** Every number in the model's text must match a value
   present in this turn's tool results. Polish formatting is the main case (D14): `1 234,5 t`,
   `12,3%`, `1,2 mln`, non-breaking spaces as thousand separators - all normalised before matching;
   rounding to the displayed precision allowed; years, dates and offer IDs are checked against the
   resolved period / returned IDs. On a violation: one automatic retry with the violation listed;
   if it fails again, the panel shows the server-rendered table with a neutral sentence instead of
   the model's prose, and `guard_violation` is logged.
5. **Server-written footer on every data answer** (not model-written, Polish by default): metric
   definition, resolved period ("01.11.2025 - 30.11.2025, wg daty wysłania"), scope ("w Twoim
   zakresie widoczności: zespół ASM"), filters, number of offers included, and the "Otwórz panel
   analizy" link with the same filters. The user can always check the number in one click.
6. **Empty and partial data are said out loud.** 0 rows -> "brak ofert spełniających kryteria",
   never a guess. Items without a recorded margin are excluded from margin averages and the footer
   says "marża liczona z X z Y ofert (pozostałe bez zapisanej marży)".
7. **No extrapolation.** No forecasts, no "prawdopodobnie", no external market data, no knowledge
   about clients beyond the DB. Class J questions get a fixed refusal + what it *can* answer.
8. **Ambiguity is resolved by the user, never guessed** (clarification buttons):
   - person: 2+ matches for "Marek" -> buttons; 0 -> "nie znalazłam takiej osoby w Twoim zakresie"
   - client: same rule
   - period: "listopad" with no year on 2026-11-09 -> buttons "listopad 2026 (do dziś)" /
     "listopad 2025"; incomplete-period comparison -> buttons per D12 (3.2)
   - metric: "ile Marek sprzedał" without unit -> default answers tons + value + count (all three
     are cheap), no question needed
9. **Visibility is the scope.** Numbers cover only offers the asking user can see (the same
   `offerVisibilitySql` as /offers and /analytics). A salesperson asking "ile ofert wysłała cała
   firma" gets their visible scope and the footer says so explicitly - it never pretends to be a
   company total.
10. **Versions count once.** Latest version per offer family (analyticsQuery rule) - an offer edited
    four times is one offer.

### 3.1 Metric catalog (v1)

| Metric ID | Meaning | Date basis | Unit |
|---|---|---|---|
| `offers_created` | offers created | created | count |
| `offers_sent` | offers sent to the client | sent | count |
| `offers_won` / `offers_lost` | client decision | decided | count |
| `offers_pending` | no client decision yet, **incl. not-yet-sent** (= /analytics "Bez decyzji") | created | count |
| `tons_offered` | tonnage of offers | created or sent (param) | t |
| `tons_won` ("sprzedane") | tonnage of won offers | decided | t |
| `tons_lost` | tonnage of lost offers | decided | t |
| `value_lost` | value of lost offers | decided | EUR + PLN |
| `clients_lost` ("ilu klientów odrzuciło ofertę") | distinct clients with a lost offer | decided | count |
| `value_offered` | value of offers | created or sent | EUR + PLN |
| `value_won` ("sprzedaż") | value of won offers | decided | EUR + PLN |
| `clients_offered` | distinct clients with an offer | created or sent | count |
| `clients_won` | distinct clients with a won offer | decided | count |
| `win_rate_offers` / `win_rate_tons` | won / (won + lost) | decided | % |
| `margin_weighted` | tonnage-weighted avg margin % (dashboard) | param | % |
| `margin_simple` | simple average of per-offer margin % | param | % |
| `avg_tons_per_offer`, `avg_value_per_offer` | averages | param | t / EUR |
| `approval_time` (later) | submit -> final approval, median + avg | submitted | hours |
| `lost_reasons` | lost offers by reason: count, tons, value EUR + PLN, share % | decided | count + t + EUR/PLN + % |

Lost-offer family (signed off by Mati 11-09): "ile ofert przegraliśmy", "ile ton straciliśmy",
"ilu klientów odrzuciło ofertę i dlaczego" -> `offers_lost` / `tons_lost` / `value_lost` /
`clients_lost` + `lost_reasons`. Reasons are **the app's admin-managed list** (`lost_reasons`
table, /admin/powody-przegranej) via `computeLostReasons` - the assistant never invents or
re-groups reasons; archived reasons still count for past losses. Engine work (phase 1, rule 3.2):
add `valueLostPln` and `clientsLost` to `computeKpi` (today only `valueLostEur` exists).

Version rule (signed off 11-09): every date basis uses the **latest version's** dates, exactly
like /analytics (a renegotiated offer moves to the month of its newest version).

Filters on every metric: `people[]` (resolved user IDs), `team`, `clients[]`, `steel_types[]`,
`status[]`, `decision[]`, `flow`, `period`. `steel_types` uses the item-level rule already in
analyticsAggregate (an offer mixing HRS and HDG counts only the HDG tonnage for an HDG question).

### 3.2 Polish verb -> metric / date basis (D6, D14)

The model maps the verb, the server states the basis in the footer.

| Polish phrasing | Metric family | Date basis |
|---|---|---|
| zrobił, stworzył, przygotował, wystawił (ofertę) | offers_created / *_offered | created |
| wysłał, ofertował, złożył ofertę, "dostał ofertę" (klient) | offers_sent / *_offered | sent |
| sprzedał, wygrał, zamknął, "sprzedaż" | *_won | decided |
| przegrał, stracił | *_lost | decided |
| marża, średnia marża | margin_weighted + margin_simple (D4) | param (default: sent) |

### 3.3 Periods and comparisons

- The model passes a preset (`today`, `yesterday`, `thisMonth`, `lastMonth`, `thisQuarter`, ...,
  the existing `PeriodPreset` list) or explicit `{year, month}` / ISO range. The server resolves it
  with `lib/analyticsPeriods.ts` in Europe/Warsaw. The model never computes dates.
- Polish period phrases the model must map (golden-tested): "wczoraj", "w tym tygodniu",
  "w zeszłym / poprzednim miesiącu", "w listopadzie (2025)", "w III kwartale", "Q3", "od początku
  roku", "w 2025", "ostatnie 30 dni", "przedwczoraj", "na przełomie października i listopada"
  (-> explicit range, confirm via buttons).
- `compare: "previous_period" | "same_period_last_year" | {explicit period}` -> server returns both
  values + `delta_abs` + `delta_pct` (null when the base is 0, never "nieskończoność %").
- **Incomplete period (D12):** when either side of a comparison includes today, the tool returns
  `needs_clarification` with three options and the UI shows buttons:
  1. "porównaj te same dni (1-9 lis vs 1-9 paź)"
  2. "listopad do dziś vs cały październik"
  3. "dwa ostatnie pełne miesiące (paź vs wrz)"
- Future periods -> "ten okres jeszcze nie nastąpił".

---

## 4. Polish language handling (D14)

- **Name declension.** Users write "oferty Marka", "Markowi", "od Anny", "Kowalskiej". Rule: the
  model passes names to `find_people` / `find_clients` in the **nominative** (instructed + golden
  tested), and the server also matches inflected forms: trigram (`pg_trgm`, already installed)
  plus a small suffix-stripping fallback for common endings (-a, -owi, -em, -ie, -y, -iej, -ą).
  Results are always candidates - 2+ -> buttons (rule 3.8).
- **Client names** with Polish forms ("dla Stalprofilu", "w Stalprofilu") -> same mechanism.
- **Diacritics.** Search must match with and without Polish characters ("Łódź" = "Lodz",
  "Wąsik" = "Wasik") - `unaccent` or a normalisation column; check what `lib/search.ts` already does.
- **Numbers and dates in input.** "20,5 t", "1,5 mm", "3x1500x3000", "dwadzieścia ton", "15.11" ->
  parsed by the model into numbers, but `propose_*` cards always show the parsed values for the
  user to confirm, so a misparse is visible before it is saved.
- **Output formatting** done by the server (footer, tables, cards) with `pl-PL` formatting from
  `lib/numberFormat.ts`: `1 234,50 EUR`, `12,3%`, `05.11.2026`. The model is told to copy numbers
  exactly as formatted in tool results (makes the number guard simpler).
- **Steel vocabulary** in the knowledge base glossary: blacha, kręgi, arkusze, grubość,
  szerokość, gatunek, cynk / ocynk (HDG), trawiona (PICKLED), łezka (TEARDROP), PGL, dopłaty,
  marża minimalna, OWS, termin płatności, ważność oferty.
- **Language of the answer** = language of the question; footers and UI strings follow the UI
  language from `translations.ts`.
- **Golden set**: ~80% Polish, colloquial included (typos, no diacritics: "ile ofert wyslal marek
  w pazdzierniku"), ~20% English.

---

## 5. Architecture

```
Browser                          Next.js server (our code)                      Anthropic API
-------                          -------------------------                      -------------
<AssistantPanel/> --POST------> /api/assistant/chat (SSE)
 current chat in React state       1. requireAccess() -> AccessContext
 (D9: nothing persisted)           2. rate limit + budget check
 sends: user/assistant text        3. answer cache lookup (D10) -> hit: stream cached answer
 turns + page context              4. agent loop (max 8 steps) -------------------> Sonnet 5.5
                                        <-- tool_use: query_metrics{...} ---------
                                   5. Zod-validate params -> run tool with ctx
                                      (visibility SQL, analytics engine) -> rows
                                   6. tool_result as untrusted data ------------->
                                        <-- final text ---------------------------
                                   7. guards: number guard, ID/link whitelist,
                                      attach server footer + cards/tables/charts
 <-- SSE: text + blocks ---------  8. store in answer cache, log metadata (D11)

Confirm click ------------------> /api/assistant/actions/:token/confirm
                                   loads the stored pending action, re-checks
                                   permission + offer version, calls the shared
                                   offer service (same code as the UI routes)
```

Stateless server for chat (D9): the browser holds the transcript and sends only user + assistant
**text** turns (capped at 30). Tool results are never accepted from the client - the server re-runs
tools when needed. This removes "forged tool result" attacks without storing chats.

Files (inside `finance_calculator_deployed/nextjs_space`):

```
app/api/assistant/chat/route.ts                 POST, SSE, auth, cache, loop, guards
app/api/assistant/actions/[token]/confirm/route.ts
app/api/assistant/actions/[token]/cancel/route.ts
app/api/assistant/export/[token]/route.ts       xlsx of a previous query_metrics result
app/api/assistant/feedback/route.ts             thumbs up / down (+ optional comment)
app/api/admin/assistant/route.ts                usage, cost, guard hits, kill switch
lib/assistant/provider.ts                       ChatProvider interface
lib/assistant/anthropicProvider.ts              Sonnet 5.5, streaming, prompt caching, retries
lib/assistant/agentLoop.ts                      steps, dedup, timeouts, parallel tool calls
lib/assistant/systemPrompt.ts                   cached stable part + dynamic context
lib/assistant/metrics.ts                        metric catalog (3.1) -> analytics engine
lib/assistant/polish.ts                         name declension fallback, diacritics normalisation
lib/assistant/guards/numberGuard.ts             rule 3.4 (pl-PL + en number parsing)
lib/assistant/guards/linkGuard.ts               ID + internal-route whitelist
lib/assistant/guards/input.ts                   length, control chars, injection flags
lib/assistant/footer.ts                         server-written definition footer + analytics link
lib/analyticsUrlState.ts                        NEW shared panel-state schema, used by /analytics
                                                 AND the assistant's deep links (6.1)
lib/assistant/cache.ts                          data-versioned answer cache (section 8)
lib/assistant/budget.ts                         rate limits, spend
lib/assistant/pendingActions.ts                 create / load / expire pending actions
lib/assistant/tools/*.ts                        one file per tool (section 6, 7)
lib/assistant/knowledge/*.md                    knowledge base, Polish first (+ EN)
lib/offers/service.ts                           NEW shared offer service, extracted from the
                                                 API routes (create, update, duplicate, submit,
                                                 send, approve, reject, decision) - see 7.1
app/asystent/page.tsx                           full-page view of the same chat (D17)
components/assistant/AssistantBubble.tsx
components/assistant/AssistantPanel.tsx
components/assistant/blocks/{OfferCard,DataTable,MiniChart,Footer,ClarifyButtons,ActionCard}.tsx
migrations/037_ai_assistant.sql                 (035 and 036 are already taken)
tests/assistant/*.test.ts
scripts/assistant-eval.ts
```

Dependencies: `@anthropic-ai/sdk`. zod already present. Charts reuse whatever /analytics uses.
Env: `AI_ASSISTANT_ENABLED`, `AI_DATA_MODE=demo|live`, `AI_PROVIDER=anthropic`, `AI_MODEL`
(default `claude-sonnet-5-5`), `ANTHROPIC_API_KEY`, `AI_MONTHLY_BUDGET_USD`, `AI_USER_DAILY_LIMIT`.

---

## 6. Read tools

Every tool: strict Zod schema, runs with the user's `AccessContext`, returns compact JSON (no raw
`offer_data` dumps), max N rows + `total`, server-built `link`s.

| Tool | Input | Returns | Built on |
|---|---|---|---|
| `get_my_context` | - | me, roles per flow, my team, active flow, today (Warsaw) | `AccessContext`, `lib/teams.ts` |
| `find_people` | `query` (nominative), `flow?` | candidates (id, name, role, team, in_my_scope) | `users`, `pg_trgm`, `polish.ts` |
| `find_clients` | `query` | candidates (id, name, NIP / SAP id) | `lib/clientDirectory.ts`, `polish.ts` |
| `query_metrics` | `metrics[]`, filters, `period`, `compare?`, `group_by?` (person / client / steel_type / status / decision / month / week / quarter), `sort?`, `limit?`, `want_chart?` | values, groups, series, deltas, `included_offers`, `excluded_no_margin`, `footer`, `analytics_link`, `export_token` | section 3, analytics engine |
| `search_offers` | filters, period, `limit<=20` | rows + total + links | `offerVisibilitySql`, `lib/search.ts` |
| `get_offer` | `offer_id` or display name | header, client, items summary (type, grade, dims, tons, price, margin), totals, status, approval steps + who decides, rejection / lost reason, version history | `loadVisibleOffer`, `describeOffer`, `offerVersionDiff` |
| `my_queue` | `kind`: to_send / waiting_for_approval / awaiting_my_decision / rejected_to_fix | rows + pending approver names | `awaitingMyReviewSql`, `offer_approval_steps` |
| `price_item` | type, grade, thickness, width, length, tons or sheets, margin?, valid_from? | full price breakdown | `computeItemPricing`, price book, PGL |
| `calculate_transport` | destination, weight, dims | breakdown | `computeTransport`, `transportRouting` |
| `get_pgl` | steel type, quarter | PGL values | `pglQuarterly.ts` |
| `list_lost_reasons` | - | active reasons (PL labels) | `lostReasons.ts` |
| `get_approval_rules` | `flow?` (default: my active flow) | current active rules: criterion, operator, threshold, unit, target level; plus `approval_validity_hours` and the calculator's `minMarginPct` | `approval_rules`, `app_settings` |

Thresholds (approval rules, minimum margin, approval validity) are **admin settings that change
month to month** (Mati 11-09). The knowledge base only explains what the rules mean; any concrete
threshold in an answer must come from `get_approval_rules` at question time, never from the
knowledge base or the model's memory (number guard applies).

Charts (D8): `query_metrics` with a series returns chart data; the UI renders it with the dashboard
chart components. The model only says "oto wykres" - it never produces chart data.
Excel (D8): `export_token` -> `/api/assistant/export/:token` re-runs the same query and streams the
xlsx via `analyticsExport`. Token = signed, user-bound, 15 min.
"Otwórz panel analizy" (D8, D23): see 6.1.

### 6.1 Analytics deep link (D23)

Goal: "ile ofert przegraliśmy w październiku i dlaczego?" -> answer in chat (count + reasons table +
footer) **and** a button that opens /analytics with October, date basis "decyzja", decision "lost",
breakdown by lost reason already selected and the lost-reasons section scrolled into view. The user
sees the same numbers in the full panel and can keep clicking from there.

**Current state (checked 11-09):** `app/analytics/page.tsx` holds everything in `useState`
(`DEFAULT_UI_FILTERS`, `measure`, `timeKind`, `breakdownDimension`, `breakdownKind`,
`salespersonRoleFilter`). It serialises filters into a query string only for its own API call
(line ~101); it **never reads the browser URL**. So deep links need a page change first.

Design:
1. **One shared state schema** `lib/analyticsUrlState.ts` (Zod): every setting of the panel -
   `preset`, `from`, `to`, `basis`, `granularity`, `split`, `users`, `types`, `statuses`,
   `decisions`, `clients`, `measure`, `timeKind`, `breakdown`, `breakdownKind`, `role`, `focus`
   (section to scroll to: `kpi` / `timeline` / `breakdown` / `lostReasons` / `table`).
   `parse(searchParams) -> state` and `toSearch(state) -> string`. Unknown or invalid values fall
   back to defaults (never crash on a hand-edited URL).
2. **/analytics reads the URL on load** (`useSearchParams`) and **keeps it in sync** on every change
   (`router.replace`, no history spam). Side benefit for everyone: any analytics view becomes a
   shareable / bookmarkable link, and refresh no longer resets the panel.
3. **The assistant builds the link with the same `toSearch()`** from the exact `query_metrics`
   parameters it ran - the link and the chat answer come from one object, so they cannot drift.
   Mapping metric -> panel view: e.g. `offers_lost + lost_reasons` -> `decisions=lost`,
   `basis=decided`, `measure=offers`, `focus=lostReasons`; `tons_won` grouped by person ->
   `decisions=won`, `measure=tons`, `breakdown=salesperson`, `focus=breakdown`.
4. **Comparisons:** the panel shows one period, so a comparison answer gets **two buttons**
   ("październik" / "wrzesień"), each a full deep link. (Optional later: a compare mode in the
   panel.)
5. **Security:** the link carries only filters, never data. /analytics enforces visibility
   server-side as today (`?users=` can only narrow, never widen), so a forwarded link shows each
   viewer only their own scope. The footer says so.
6. **Gaps found while mapping:** if the assistant answers something the panel cannot show (e.g.
   approval time, simple margin before D21 ships), the button is omitted and the footer says
   "brak widoku w panelu analizy" - never a link to a view that shows different numbers.
7. **Navigation:** the button opens the panel in the same tab; the chat bubble stays open with the
   conversation (chat state lives above the router, D9 / D17), so the user can read the answer and
   the panel side by side.

Tests:
- `analyticsUrlState`: round-trip `parse(toSearch(s)) == s` for every field; garbage input ->
  defaults.
- **Link parity**: for every golden aggregate question, the numbers in the chat answer == the KPI /
  table values the /analytics API returns for the deep link's state. This is the proof that "click
  the link and you'll see the same thing" holds.
- Playwright: open a deep link -> correct chips / selects / tab active, section scrolled into view.

Worked example ("ile ofert przegraliśmy w październiku i dlaczego?", asked 2026-11-09):
- period: most recent October is complete -> 2026-10-01 .. 2026-10-31 (no question needed; an
  incomplete month would trigger buttons per rule 3.8)
- `query_metrics{metrics:[offers_lost, tons_lost, value_lost, lost_reasons], period:{year:2026,
  month:10}}` -> server returns count, tons, EUR + PLN, reasons with count + share
- chat: one sentence + reasons table + footer ("przegrane wg daty decyzji, 01.10.2026 -
  31.10.2026, w Twoim zakresie widoczności, N ofert")
- button: `/analytics?preset=custom&from=2026-10-01&to=2026-10-31&basis=decided&decisions=lost&measure=offers&focus=lostReasons`
- follow-up (6.2): "Chcesz zobaczyć szczegóły w panelu analizy?" + chips [Pokaż w panelu analizy]
  [Porównaj z wrześniem] [Pokaż przegrane oferty]

### 6.2 Proactive follow-ups (D24)

After an answer the assistant asks one short follow-up question and shows up to 3 chips.

**Who decides what is suggested:** the server, not the model. `lib/assistant/followUps.ts` takes
the executed tool call (metric, filters, period, group_by, result size) and returns candidate
follow-ups from fixed rules. Each candidate is a fully specified next action, so a chip can never
lead to an invalid question, a view that does not exist, or an action the user may not perform.
The model only words the question line (in the user's language) and may reorder the chips; it
cannot invent new ones (guard: chips not in the server list are dropped).

| Chip | Shown when | Click does |
|---|---|---|
| Pokaż w panelu analizy | aggregate answer with a panel view (6.1) | navigate to the deep link |
| Porównaj z poprzednim okresem / z rokiem wcześniej | single-period aggregate, previous period exists | structured follow-up: re-runs `query_metrics` with `compare` |
| Rozbij na handlowców / klientów / typy stali | aggregate without group_by, user sees 2+ values of that dimension | structured follow-up with `group_by` |
| Pokaż te oferty | aggregate with <= 50 underlying offers | `search_offers` with the same filters -> offer cards |
| Pobierz Excel | any table answer | export token (D8) |
| Powody przegranej | lost-offer aggregate without reasons | adds `lost_reasons` |
| Akcje (wyślij, zatwierdź...) | single offer / queue answer where the user has a permitted action | `propose_*` -> confirmation card (section 7); a chip never executes anything itself |

Rules:
- Max 3 chips, panel link first for analysis answers.
- No follow-ups on clarification turns, refusals or errors. On 0 rows the only chips are
  "Zmień okres" / "Usuń filtr X" when applicable.
- A structured chip click is sent as `{followUpId}` and the server resolves it from the candidate
  list of the previous turn (signed turn payload, not free text) - same anti-tampering idea as
  action tokens.
- The user can always ignore chips and type freely.
- On a cache hit (section 8) chips are re-computed (cheap, deterministic), so they reflect current
  permissions.

Tests: rules unit-tested per answer type; golden set checks expected chips for the aggregate group;
guard test - a model-invented chip is dropped.

---

## 7. Write actions (D3, D7)

Rule: **the model can only propose, the user executes.** Proposal tools never change data.

```
model: propose_approve{offer_id:123}
server: validates (permission, offer state, in my awaiting-review queue)
        -> stores pending action {user, kind, payload, offer_updated_at, expires +10 min}
        -> returns ActionCard data + token
UI:     ActionCard shows exactly what will happen (offer name, client, tons, value, margin,
        author, current status -> new status) + [Zatwierdź] [Anuluj]
click:  POST /api/assistant/actions/:token/confirm
server: token belongs to this user, not expired, not used; re-check permission;
        offer.updated_at unchanged (else "oferta zmieniła się, odśwież"); call shared service;
        mark token used; history entry "przez asystenta"
```

| Tool | Who | Notes |
|---|---|---|
| `propose_offer_draft` | can_create_offer in active flow | input: client (resolved), items (type, grade, dims, tons/sheets, margin? else default), delivery / payment / validity? (else defaults). Server builds `offer_data`, prices every item with `computeItemPricing`, runs `validateOfferItems` + `fieldViolation`. Card shows every line with prices. Confirm -> DRAFT + link to the calculator. Pasted RFQ e-mail (D16): the model extracts client + items, the card marks every extracted value with its source line from the e-mail; the e-mail text is untrusted data (injection rules 9.1) and is never stored |
| `propose_offer_edit` | offer owner / allowed editor | diff card (old -> new per field, via `offerVersionDiff`); confirm -> new version through the same path as PUT |
| `propose_duplicate` | as duplicate route | optional changes (client, tons) shown in the card |
| `propose_submit` | owner, draft / rejected | shows the approval path it will take |
| `propose_mark_sent` | owner, approved | manual-send confirmation (the app sends nothing itself) |
| `propose_approve` / `propose_reject` | approver, offer in my awaiting-review queue | reject requires the reason text from the user; ID must come from a tool result of this turn; card shows full offer summary |
| `propose_decision` | owner, sent | won / lost; lost requires a reason from the admin list (buttons) |

### 7.1 Shared offer service (prerequisite refactor)

Today the business rules live inside the route handlers (`app/api/offers/**/route.ts`). The confirm
endpoint must run **exactly** the same rules, so phase 3 starts by extracting them into
`lib/offers/service.ts` (create, update, duplicate, submit, send, approve, reject, decision) and
making the routes thin wrappers. No behaviour change - verified by `npm run build` + existing
tests + a manual smoke test of every action in the UI.

### 7.2 Biggest risk: offer_data parity

`offer_data` is built today by the calculator in the browser. A server-built draft must be
byte-compatible, or the calculator will open it wrong. Mitigation: a server-side builder
`lib/offers/buildOfferData.ts` + a parity test - the same inputs entered in the calculator and
built by the builder produce identical `offer_data` (fixtures captured from the real calculator).
If parity is too costly, fallback = D3 variant "prefill calculator, user saves".

### 7.3 Worked example (required by repo rules - fill with real numbers in phase 3)

"zrób ofertę dla Stalprofilu: 20 t HRS S235JR 3 x 1500 x 3000, marża 8%" ->
`find_clients("Stalprofil")` -> 1 match -> `propose_offer_draft` -> server: PGL HRS Q4, grade,
dimension and length surcharges from the price book -> `computeItemPricing` -> card with SumaHuta,
SumaSSC, cena końcowa per t, value EUR + PLN. Fixture with expected numbers goes to
`tests/assistant/draft-pricing.test.ts`, checked against the same item typed into the calculator.

---

## 8. Answer cache (D10)

- **Key** = hash(normalized question, user visibility fingerprint (user id + roles + team + flow),
  page context, language, today's date in Warsaw, `data_version`, prompt version, model).
- **`data_version`** = a counter in `app_settings`, bumped by DB triggers on INSERT / UPDATE /
  DELETE of `offers`, `offer_approval_steps`, `clients`, price book, PGL, `users` / teams. Any change
  -> every cached answer is automatically a miss. Never stale, no TTL logic needed (TTL 24 h only
  for cleanup).
- Normalization: lowercase, trim, collapse whitespace, strip trailing punctuation, **strip Polish
  diacritics** (so "ile ofert wysłał Marek" = "ile ofert wyslal marek"). Exact match only after
  that - semantic ("similar question") matching would need embeddings and can return the answer to
  a *different* question; not in v1.
- Cached: only final read answers without clarification and without action cards. Never cached:
  answers containing proposals, clarifications, errors, or guard fallbacks.
- Only the first turn of a chat is cacheable (later turns depend on the conversation).
- Plus Anthropic **prompt caching** on tools + system prompt + knowledge (stable prefix), dynamic
  context after the breakpoint.
- Admin panel shows hit rate.

---

## 9. Safety

### 9.1 Prompt injection (OWASP LLM01) and excessive agency (LLM06)
Attack surface: offer notes, client names, rejection / lost reasons, contact names.
1. Permissions in code: every tool runs with the user's `AccessContext`; a hijacked model can't see
   or do more than the user in the UI.
2. Actions only via user click on a server-built card (section 7); the model cannot execute.
3. No exfiltration channel: no web fetch, no email, link whitelist, no markdown images.
4. Tool data wrapped as `<tool_data untrusted="true">`; system prompt: data is never an instruction.
5. Input guard: 2 000 chars max, strip zero-width / control chars, log injection patterns (PL + EN
   phrasings, e.g. "zignoruj poprzednie instrukcje").
6. Sanitized markdown rendering (no raw HTML).
7. Red-team group in the eval (section 12), Polish and English.

### 9.2 Loops and limits
Max 8 tool steps per message, max 3 identical calls, 45 s per request, 5 s per tool
(`statement_timeout`), `max_tokens` cap, handle `refusal` / `max_tokens` stop reasons, chat capped
at 30 turns ("zacznij nowy czat").

### 9.3 Cost
Per-user daily limit (default 100 messages), per-minute limit, global monthly budget in
`app_settings` (80% -> admin warning, 100% -> "asystent wstrzymany"), every call logs tokens + cost,
admin kill switch.

Estimate (Sonnet 5.5, $2 / $10 per 1M tokens - verify on the pricing page before the business
case): ~3 model calls per question, ~12K input mostly cached + ~1K output -> roughly
**$0.02-0.05 per question**. Polish text tokenizes somewhat longer than English - assume the upper
end. Demo: a few dollars total. 50 users x 20 questions x 22 days = 22K questions ->
$440-1 100 / month worst case, less with answer cache + prompt cache. Go-live option: route simple
lookups to Haiku 5.5 if the eval shows no accuracy loss.

### 9.4 Privacy
Minimal fields per tool; no chat text stored (D11); metadata retention 90 days; one-line notice in
the panel ("Asystent AI - liczby pochodzą z danych aplikacji, sprawdź w Analityce").

### 9.5 Go-live gate (before real data)
- [ ] IT / legal decision where offer data may be processed (Anthropic API US/EU, or Claude on
      Microsoft Foundry inside the company's Azure contract - same SDK family, small adapter)
- [ ] Paid account with no-training terms, budget set
- [ ] `AI_DATA_MODE=live` refuses any provider not on the approved list
- [ ] Data minimisation review of every tool
- [ ] Eval re-run on the go-live configuration, 100% on accuracy-critical groups
- [ ] Prod env vars + migration 037 in the AbacusAI deploy prompt
- [ ] Panel notice updated

---

## 10. UI

- Floating bubble bottom-right on every page except `/login`; side panel 420 px (desktop),
  full-screen sheet (mobile portrait). Hidden in print / PDF preview.
- Streaming text, stop button, "Nowy czat". Chat lives in React state above the router, so it
  survives navigation inside the app; a page reload clears it (D9).
- Answer blocks (server data, not model text): `DataTable`, `MiniChart`, `OfferCard`, `Footer`
  (definition + scope + period + "Otwórz panel analizy" (deep link, 6.1) + "Pobierz Excel"), `ClarifyButtons`,
  `ActionCard` (confirm / cancel, shows exact changes, disabled after use / expiry).
- Suggested questions per role on the empty state, in Polish ("Co czeka na moją decyzję?",
  "Ile ofert wysłałem w tym miesiącu?", "Moja średnia marża w tym kwartale").
- Page context: current route + open offer id ("co jest nie tak z tą ofertą?").
- PL first / EN via `translations.ts`, AM light + dark tokens, a11y: focus trap, Esc, `aria-live`.
- Thumbs up / down + optional comment per answer.
- Design pass with `ui-ux-pro-max`; reuse compact status badges.

---

## 11. Knowledge base (Polish first)

`lib/assistant/knowledge/`: glossary (incl. steel vocabulary from section 4), offer lifecycle
(draft -> pending_review -> approved / rejected -> sent -> won / lost, who approves what, from
docs/flows-v2-plan.md), calculator how-to, transport, roles and visibility, metric definitions
(3.1 + 3.2, so the agent can explain "what does 'sprzedał' mean here"), FAQ. Written in Polish, EN
versions of the same files.

---

## 12. Quality: how we prove it counts correctly

1. **Metric unit tests (vitest, no model)**: every metric in 3.1 against a fixed fixture DB with
   hand-computed expected values (versions, mixed steel types, missing margins, EUR/PLN, timezone
   edge at midnight, visibility of each role).
2. **Parity test**: for a grid of filters x periods, `query_metrics` == `/api/analytics` payload.
3. **Number guard tests**: invented number -> caught; Polish / English formatted numbers
   (`1 234,5 t`, `12,3%`, `1,2 mln EUR`, `1,234.5`) -> accepted when they match.
4. **Polish tests**: name declension ("Marka", "Markowi", "Kowalskiej" -> right user), diacritics
   ("lodz" -> Łódź), period phrases from 3.3.
5. **Golden set** `tests/assistant/golden.json`, 100+ questions on the demo DB (~80% Polish incl.
   colloquial and no-diacritics, ~20% English), each with the asking user, expected tool + params
   and expected numbers: aggregates 30, comparisons 15, rankings 10, lists / single offer 15,
   knowledge 10, ambiguity 8 (must ask), out-of-scope 5 (must refuse), permission 5 (must not
   leak), injection 5, actions 10 (must propose, never execute; correct card content).
6. **Live eval** `scripts/assistant-eval.ts` before every prompt / model / tool change. Pass bar:
   100% on numbers, permission, injection, actions; 95%+ overall.
7. `npm run build` green; reviewers: `ecc:security-reviewer` (routes, tools, actions),
   `ecc:database-reviewer` (037 + triggers + tool SQL), `ecc:react-reviewer` +
   `ecc:typescript-reviewer`, `ecc:a11y-architect` (panel, cards).

---

## 13. Phases

| Phase | Goal | Size (solo) |
|---|---|---|
| 0 | Open questions (14), metric catalog sign-off, knowledge base (PL), golden set, demo seed data | 3-4 days |
| 1 | Core: provider, loop, read tools, accuracy contract (metrics, guards, footer), Polish handling, panel with tables + cards, cache, logging | ~2 weeks |
| 2 | Analytics outputs: comparisons + clarification, charts, Excel, Analytics links | ~1 week |
| 3 | Actions: offer service refactor, pending actions, all `propose_*` tools, offer_data builder + parity | ~2 weeks |
| 4 | Company demo ("flex"): script, rehearsal, recording, business case | 2-3 days |
| 5 | Go-live gate + pilot 3-5 users | 2 weeks + IT decision |
| 6 | Haiku routing / cost tuning, approval-time metric, more metrics from real questions | ongoing |
| 7 | Optional: offer requests (fixes "oferta, o którą prosiłem"), MCP for Copilot / Teams, WhatsApp | later |

---

## 14. Open questions

Answered 11-09: release (D15), draft input (D16), UI (D17), access (D18), bulk (D19),
unpriceable lines (D20), dashboard KPI (D21), demo budget (D22).

Still to decide with Mati:
1. ~~Branch setup~~ decided 11-09: branch `exp/ai-assistant` from `9cc4228`, in a separate git
   worktree at `C:\Users\mmazur\source\repos\AMSteel_Quote-ai`. `main` (2.3) stays untouched in
   the original checkout; merge main into the branch regularly.
2. Go-live budget cap (decide with CEO, after the demo).

To verify in code before phase 1 (not decisions, facts) - all checked 11-09:
- ~~/analytics accepts every filter from the URL~~ it does not read the URL at all -> work item in
  6.1 / phase 2
- ~~`validateOfferItems` vs flagged lines (D20)~~ it requires `pgl`, `finalPrice`, `totalValue` > 0
  and a known grade on EVERY `zestawienie` item, so a "do uzupełnienia" line cannot live there.
  Proposal: keep it in a separate `offer_data.unpricedLines[]` (`{source_text, type?, grade?,
  dims?, tons?, reason}`), which the validator ignores; submit checks `unpricedLines.length === 0`;
  the calculator shows them as a banner to fix. Needs Mati's OK (Q3 below)
- ~~`lib/search.ts` and diacritics~~ it only escapes LIKE wildcards; **no diacritics handling and
  the DB has no `unaccent` extension** (only `pg_trgm`). `polish.ts` must normalise in JS (strip
  diacritics on both sides) or add `unaccent` in migration 037 (needs CREATE EXTENSION on the
  AbacusAI host - same fallback pattern as pg_trgm in 008)
- ~~chart library~~ /analytics uses **recharts** (TimeSeriesPanel, BreakdownPanel, WinLossPanel)

### 14.1 Phase 0 findings that need Mati (11-09)

Q1. ~~IFO / EFO / KAM see their whole team~~ **Answered 11-09: OK for now.** The assistant uses
    the app's visibility exactly as it is (`offerVisibilitySql`, the visibility matrix in
    Uprawnienia) - it never has rules of its own. **Later (separate feature, not in this plan's
    phases):** a per-person "what data can this worker see" setting, along the hierarchy:
    N0 (seller) - only own offers; N+1 - own team; N+2 - everything below them (cluster / whole
    flow); N+3 - everything; plus individual exceptions set by the admin. It will live in the app
    (Uprawnienia), and the assistant picks it up automatically because it reads the same scope
    SQL. Nothing to build on the assistant side; the golden `visibility.ts` fixture + `verify.ts`
    will flag the change when it lands.
Q2. **Answered 11-09: signed off** with the lost-offer family (`value_lost`, `clients_lost`,
    reasons from the app list) - folded into 3.1. Details found while checking the engine:
    - `value_lost` is used by the 6.1 worked example but missing from 3.1 -> add it. The engine's
      KPI has `valueLostEur` but **no `valueLostPln`** (only the lost-reasons rows have PLN) ->
      add `valueLostPln` to `computeKpi` (engine rule 3.2, not assistant-side).
    - Every basis uses the **latest version's** dates: a lost offer renegotiated as a new draft
      no longer counts as "sent" in its old month, and `offers_created` dates a family by its
      newest version. Consistent with /analytics; say so in `metryki.md`, or change the engine?
    - `offers_pending` = latest version with no client decision **including not-yet-sent**
      offers (that is what /analytics "Bez decyzji" does). The plan said "basis: sent" - pick one.
    - Weighted margin in `computeKpi` weights each offer's margin by the offer's **full**
      tonnage even when only some of its items carry a margin (mixed legacy + new items). Tiny
      real-world impact, but rule 3.6 says items without margin are excluded -> fix in engine?
Q3. D20 flagged-line shape (`unpricedLines[]`, above) - **still open**: Polish use case sent to
    Mati 11-09, waiting for OK.
Q4. ~~Calculator margin warning vs approval rules~~ **Answered 11-09: not an issue** - both the
    calculator's minimum margin and the rules' thresholds are admin settings that change month to
    month (e.g. 4 % this month, 5 % next). Consequence for the assistant: never quote a threshold
    from the knowledge base -> new read tool `get_approval_rules` (section 6); knowledge base
    reworded to "values come from the current rules".
Q5. ~~flows-v2-plan.md outdated~~ **Done 11-09:** updated to the code (Flow 2 CEO = N+3 + HoP
    stand-in, absolute 2.1 % rule, value -> CEO (036), quoteValidityHours (2.1), only the owner
    sends, 48 h approval validity, HoC = all Flow 1, team visibility of front office intended).
Q6. Anthropic API key + console spend limit - **later** (Mati 11-09: "soon, not yet").

### 14.2 Demo data (phase 0 deliverable)

Separate local DB **`steelquote_ai`** (the normal dev DB `steelquote` is untouched). One command:
`powershell -File scripts/assistant-demo/setup.ps1 [-Reset]` = migrations + accounts
(`scripts/seed.ts`) + demo seed + verify + golden build.

- `scripts/assistant-demo/spec.ts` - deterministic spec (seeded PRNG): 6 salespeople (two
  "Marek"s, "Katarzyna Wąsik" vs client "Wąsik Metal", client "Marek-Stal", "Łukasz Żak" for
  diacritics), 12 fictional clients with Polish names/cities, PGL per quarter 2025-Q3..2026-Q4,
  128 offer families / 146 rows from Sep 2025 to 8 Nov 2026: won / lost with all 8 reasons,
  legacy offers without margin, 2-3 version families, mixed HRS+HDG, pending approvals,
  rejected, approved-not-sent; anchors a01-a09 for timezone edges (23:40 / 00:20 Warsaw at
  month boundaries), a 3-version family and queues "today".
- `seed.ts` prices every item with `computeItemPricing` and writes approval steps from
  `assessOffer` (real rule engine). Guarded: refuses anything but `localhost/steelquote_ai`.
- `verify.ts`: every row passes `validateOfferItems`; `offerVisibilitySql` == `visibility.ts`
  fixture; **oracle == analytics engine on 15 KPIs x 8 windows** (passes).
- `oracle.ts`: independent reducer over the spec -> expected golden numbers (no DB, no engine).
- `tests/assistant/golden.json` (built by `build-golden.ts`): **113 cases, 88% PL** - aggregates
  30, comparisons 15 (4 must ask, D12), rankings 10, lookups 15, knowledge 10, ambiguity 8,
  out-of-scope 5, permission 5, injection 5, actions 10. Relative periods resolve against
  `today = 2026-11-09` -> **phase 1 requirement: tools take an injectable "today"** (eval runs
  with the fixed date; prod uses the DB clock as /analytics does).
- Logins: `marek.nowak@steelquote.test`, `anna.kowalska@...`, `katarzyna.wasik@...`, etc.,
  password `1234`, plus the `scripts/seed.ts` accounts (Adam ASM, Hanna HoC, Celina CEO, ...).

For IT / CEO (go-live only): data location, provider contract, log retention, pilot group.

---

## 15. TODO

### Phase 0
- [x] Code facts in section 14 checked (11-09)
- [x] Mati: answer 14.1 Q1, Q2, Q4, Q5 (11-09)
- [ ] Mati: Q3 (D20 `unpricedLines[]`)
- [ ] Mati: Anthropic API key (console), spend limit set in console ($20, D22) - later
- [x] Mati: sign off metric catalog 3.1 + Polish verb mapping 3.2 (11-09, + lost-offer family)
- [x] `flows-v2-plan.md` updated to match the code (11-09)
- [ ] Phase 1 adds: `get_approval_rules` tool; `valueLostPln` + `clientsLost` in `computeKpi`;
      golden cases for `clients_lost` and "jaki jest teraz próg marży" (answer from the tool)
- [x] Knowledge base PL `lib/assistant/knowledge/pl/*.md` (7 files, ~25 KB) + README (11-09);
      one `TODO verify` left in `metryki.md` (offers_pending, depends on Q2)
- [x] Demo seed in separate DB `steelquote_ai` (14.2), verified against the real engine
- [x] Golden set v1: 113 cases, numbers from an independent oracle (14.2)
- [ ] EN knowledge base (after PL is reviewed)

### Phase 1 - core
- [ ] `npm i @anthropic-ai/sdk`
- [ ] Migration 037: `ai_turns` (metadata only), `ai_tool_calls`, `ai_usage`, `ai_feedback`,
      `ai_answer_cache`, `ai_pending_actions`, `app_settings` rows (enabled, budget, limits,
      data_version) + `data_version` triggers
- [ ] `provider.ts` + `anthropicProvider.ts` (streaming, prompt caching, 429/5xx retry, no retry on
      400, refusal / max_tokens)
- [ ] `systemPrompt.ts` (rules from section 3, Polish mapping, knowledge, cached prefix)
- [ ] `agentLoop.ts`
- [ ] `metrics.ts` + simple-average margin added to the analytics engine
- [ ] `polish.ts` (declension fallback, diacritics) + check `lib/search.ts` behaviour
- [ ] Tools: get_my_context, find_people, find_clients, query_metrics, search_offers, get_offer,
      my_queue, price_item, calculate_transport, get_pgl, list_lost_reasons
- [ ] Guards: input, number (pl-PL), link / ID; `footer.ts`
- [ ] `cache.ts`, `budget.ts`
- [ ] `/api/assistant/chat` + `/feedback`
- [ ] Panel UI: bubble, streaming, DataTable, OfferCard, Footer, ClarifyButtons, suggestions,
      page context, PL / EN, themes, a11y
- [ ] Tests 12.1-12.4, build green, reviews

### Phase 2 - analytics outputs
- [ ] compare + incomplete-period clarification (3.3)
- [ ] MiniChart from series
- [ ] Excel export route via `analyticsExport`
- [ ] `lib/analyticsUrlState.ts` (Zod schema, parse / toSearch, defaults on bad input)
- [ ] /analytics reads state from the URL on load + syncs it on change (`router.replace`),
      incl. view state (measure, chart kinds, breakdown, role) and `focus` scroll
- [ ] Metric -> panel view mapping table in `metrics.ts`; no button when the panel has no view
- [ ] Two buttons for comparison answers
- [ ] `lib/assistant/followUps.ts` rules + `FollowUpChips` block + structured follow-up handling
      in the chat route (6.2)
- [ ] Tests: round-trip, link parity on the golden aggregates, Playwright deep-link check
- [ ] Golden comparisons + rankings groups green

### Phase 3 - actions
- [ ] Extract `lib/offers/service.ts`, routes become wrappers, smoke-test every action in the UI
- [ ] `buildOfferData.ts` + parity fixtures from the real calculator
- [ ] `pendingActions.ts` + confirm / cancel routes (token, expiry, single use, optimistic check)
- [ ] `propose_*` tools + ActionCard
- [ ] Offer history entry "przez asystenta"
- [ ] Worked pricing example 7.3 with real numbers
- [ ] Golden actions group green (never executes without click)

### Phase 4-5
- [ ] Demo script (10 questions, mostly PL + one EN, one refused injection, one refused
      out-of-scope, one action), rehearsal, recording, one-slide business case
- [ ] Go-live gate (9.5), pilot, weekly review of thumbs-down + guard hits
- [ ] Version report docx + README section

---

## 16. Sources

- Anthropic model pricing and prompt caching: Claude API docs (verify current rates before the
  business case)
- Claude on Microsoft Foundry: Anthropic / Microsoft docs (go-live option)
- OWASP Top 10 for LLM 2025 (LLM01 prompt injection, LLM06 excessive agency)
