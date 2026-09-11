# SteelQuote

A web app for steel sales teams: calculate pricing (mill surcharges, processing
costs, margin, transport) for **HRS, CR, HDG, PICKLED** (pickled HRS),
**TEARDROP** (Łezka) and **ZM** (Magnelis) steel in real time, save the result as
an offer, run it through an approval workflow, and export it to PDF or Excel for
a client.

Current version: **1.8**.

![HRS pricing defaults](screenshot_hrs_defaults.png)
![CR pricing defaults](screenshot_cr_defaults.png)
![HDG pricing defaults](screenshot_hdg_defaults.png)

Live at [steelpricinghub.abacusai.app](https://steelpricinghub.abacusai.app)
(production currently runs 1.7; 1.8 is merged but not yet deployed).

There's also a standalone prototype at the repo root (`index.html`,
`steel_calculator_standalone.html`) — a single-file version of the calculator
with no backend, useful for a quick look without installing anything.

## `finance_calculator_deployed/nextjs_space/`

The app. Next.js 14 (App Router) + PostgreSQL, deployed via Abacus.ai.

**Stack:** JWT sessions (`jose`/`bcryptjs`) is the active auth — Prisma and
NextAuth are installed in the scaffold but currently dormant. PDF export goes
through a server-side Abacus.ai-hosted rendering endpoint (`/api/generate-pdf`).
Road distances come from Geoapify, with a Nominatim + OSRM fallback so transport
still prices without an API key.

### Pricing and calculator

- Six steel types — HRS, CR, HDG, PICKLED, TEARDROP, ZM — each with its own
  grade table, mill surcharges and processing (SSC) options, with totals
  recalculated as you type. Clicking a line item's row (not just its pencil
  icon) opens it for editing
- Base PGL is configured **per steel type**, not as one shared value, and can be
  **scheduled by quarter**: the admin fills in Q1–Q4 for a chosen year and the
  calculator switches to the right quarter's price on its own, by server date —
  a price entered for a future quarter simply takes effect the moment that
  quarter starts. The settings table shows the current month next to all four
  quarters; where a quarter is left empty the manual base value stays in use
- Every base-PGL change is logged (steel type, old and new value, who, when) in
  an admin-only history table with filtering, sorting and `.xlsx` download; each
  steel type keeps a consistent accent colour across the whole app
- One-time grade — a grade outside the price list can be quoted by name plus a
  EUR/t surcharge. It lives only inside that offer: it is never written to the
  price list and never suggested in anyone else's quotes
- Extra surcharge with an optional comment, which a per-item checkbox can push
  into the Remarks column of the PDF
- Teardrop (Łezka) surcharge derived from sheet width, with its own grade table
- EUR/PLN switch for every role — EUR is the single internal source of truth,
  PLN a display and input layer. An offer freezes the exchange rate it was saved
  with, so changing the rate later never rewrites a saved, pending or sent offer
- Final unit price and line totals round **up** to the nearest currency unit
  (never undercharge); stored and intermediate values stay unrounded

### Transport

- Cost derived from the real road distance between the dispatch address and the
  client's, priced against a carrier tariff the admin maintains — distance bands,
  each carrying either a flat price or a per-km rate
- Truck count from total offer tonnage against a configurable truck capacity: one
  tonne over the limit still pays for a whole extra truck. Items of 13.6–15.1 m
  add a per-truck oversize surcharge
- Self-pickup checkbox zeroes transport and disables the route fields when the
  client collects the goods themselves
- Routes are cached per address pair, so the same client is geocoded once
- Manual entry stays available for anything the route engine can't price

### Offers and approval workflow

- Three roles — junior / senior / admin — with a draft → pending review →
  approved/rejected → sent workflow
- A junior can send an offer straight from draft, skipping approval, when every
  line item's margin and base PGL are at or above the admin-configured minimums.
  The offers list badges drafts "ready to send" or "needs approval", and the
  calculator warns inline on any line item below threshold. Otherwise the offer
  takes the full approval path
- Admin and senior can approve, reject or edit offers awaiting review from their
  panels and send approved offers on, with quick-filter tabs (awaiting review /
  awaiting send / reviewed by me / all)
- Editing a saved offer never overwrites it in place: if anything actually
  changed, saving creates a new version (`offer_<id>.1`, `offer_<id>.2`, …) and
  earlier versions stay reachable under a collapsed list on the same card. An
  approved offer whose new version again needs approval reverts to "pending
  review" rather than inheriting a stale approval
- Create, list, duplicate, delete and search offers — by name, fallback name or
  raw ID — with a sortable "My Offers" list (date / name / value / status).
  Optional offer name falls back to `offer_<id>` consistently everywhere
- An offer cannot be sent to a client without the client's company name and NIP;
  it can still be created, saved, edited, duplicated and exported without them
- Leaving a page with unsaved calculator changes prompts first, and "Nowa oferta"
  clears the workspace deliberately rather than by accident
- Client decision on a sent offer — won / lost with an optional reason, or back
  to undecided. This is a separate axis from the internal `status` workflow:
  `approved` means a senior signed the offer off, never that the client bought
  it. Owners record their own; senior and admin may record on anyone's

### Clients

- Client data splits into company details (company, NIP, address, SAP ID) and
  optional contact details, which stay locked until company and NIP are filled
- Company and NIP are typeahead fields over the client directory — picking a
  suggestion fills all four company fields, and either field falls back to the
  other when empty. Saving an offer adds or updates that client in the
  directory, so the search learns new clients; existing values are never
  overwritten, only blanks get filled
- Contact people are shared across the team: a company can have many, saving an
  offer stores the person, and clicking into the name field lists that company's
  contacts — picking one fills surname, phone and e-mail. The admin Clients
  panel can expand, edit, add or delete a company's contacts in place

### Admin panel

- Manage accounts, clients, contacts and every offer in the company
- Dashboard tiles (offers by status, active salespeople, total offers) link
  straight to the offers list pre-filtered to that status, or to the salespeople
  panel
- Per-salesperson performance metrics — win rate and tonnage, expandable per row
- Settings: EUR/PLN rate, base PGL per steel type plus the quarterly schedule,
  minimum margin %, base transport, carrier tariff bands, dispatch address,
  truck capacity and the oversize surcharge
- A senior can build a team out of juniors; the "Analiza" panel's scope follows
  that team

### Analytics

- `/analytics` for every role, PowerBI-style. Junior and senior see their own
  book of business, admin the whole company plus a per-salesperson filter and
  breakdown; scope is decided server-side, not in the browser
- KPI tiles (tons offered / won / lost / undecided, win rate, offers, clients,
  value, average margin) each carry the change against the comparison period —
  calendar-aligned, so July compares against June and not against a 31-day
  window starting 31 May
- Fifteen period presets plus a custom range; buckets by day / week / month /
  quarter / year; and a choice of which date to count by (created, sent or
  client decision), so "what did I quote in Q1" and "what did I close in Q1" are
  different questions with different answers
- Filters for salesperson, steel type, status, client decision and client — a
  steel-type filter narrows to matching **line items**, so filtering a mixed
  HRS+HDG offer to HDG counts only its HDG tonnage
- Timeline as line / area / stacked area / bar / stacked bar split by any
  dimension; breakdown as horizontal bars / pie / donut / table; a won-vs-lost
  share bar with win rate over time; top-clients and top-salespeople tables; the
  source offers behind every figure in a sortable table; and `.xlsx` export of
  the whole view. Clicking a bar, slice or tile drills the page down to it
- Charts reuse the app's own `--accent-*` steel-type colours, so a steel type
  keeps its colour in light, dark and high contrast alike
- Only the latest version of an edited offer counts, so a family of `offer_30`,
  `offer_30.1`, `offer_30.2` is one quote and not three

### Export and interface

- PDF export of an offer, generated in the seller's selected UI language. The
  Remarks column lists every selected mill and processing (SSC) surcharge for
  each line item (thickness tolerance, certificate, coating, protection,
  packaging, surface, finish, weld, marking, edging, labels, and so on)
- Excel (`.xlsx`) export in KTS/GPAO column format, for both the calculator
  summary and individual offers, with column widths fitted to content
- Four languages: PL / EN / CS / DE
- Light and dark themes plus a High Contrast toggle on every page — one fixed
  bold palette independent of the light/dark choice, with larger text, for
  salespeople on older or very small screens

## Setup

```bash
cd finance_calculator_deployed/nextjs_space
npm install --legacy-peer-deps   # legacy flag: eslint 9 vs @typescript-eslint/parser@7, lint-only conflict
cp .env.example .env.local       # fill in DATABASE_URL and JWT_SECRET for your local Postgres

# Migrations are idempotent and must run in order (001 → 021).
for f in migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done

npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To create an admin account
for local testing, insert a user directly:

```bash
node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
```

```sql
INSERT INTO users (email, password, role, full_name, is_active)
VALUES ('you@example.com', '<hash from above>', 'admin', 'Your Name', true);
```

On Windows there's a one-shot alternative: `steelquote-start.ps1` at the repo
root starts a portable Postgres, creates the database, runs every migration,
installs dependencies if needed, seeds test accounts into the **local** database
only, and launches the dev server. `steelquote-stop.ps1` shuts it back down.

### Environment variables

| Variable | Required | What it's for |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `JWT_SECRET` | yes | Signs the session cookie |
| `ABACUSAI_API_KEY` | for PDF export | Deployment token for the Abacus.ai-hosted rendering service behind `/api/generate-pdf` |
| `GEOAPIFY_API_KEY` | optional | Geocoding and truck routing for transport costs; without it the app falls back to Nominatim + OSRM |
| `NEXTAUTH_SECRET` | no | Belongs to the dormant NextAuth scaffold |

## Notes

- Real `.env`/`.env.local` files, local Postgres data, and files generated from
  actually running the app locally (saved offer PDFs, uploads) are excluded via
  `.gitignore` — they're runtime state, not source code. Use `.env.example` as a
  starting point.
- Version reports for every release live in `Historia wersji oraz md/`.

## Roadmap

- [ ] Actually deliver a sent offer to the client by e-mail with the PDF
      attached — today "sent" only moves the offer's status
- [ ] Payment-terms table on the offer
- [ ] Import offers from Excel (KTS/GPAO format) — analysed, deliberately deferred
- [ ] Signup flow beyond the admin-only `/api/signup` endpoint
- [ ] Password reset via email
- [ ] Rate-limit login attempts (so test accounts don't need long passwords)
- [ ] Resolve dormant Prisma/NextAuth scaffold (finish wiring or remove)
- [ ] Merge the duplicated calculator data files (`calc-data.ts` /
      `calculatorData.ts`)

## License

MIT
