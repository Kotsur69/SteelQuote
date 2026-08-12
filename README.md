# SteelQuote

A web app for steel sales teams: calculate pricing (mill surcharges, processing
costs, margin, transport) for HRS, CR, HDG, PICKLED, TEARDROP, and ZM (Magnelis)
steel in real time, save the result as an offer, and export it to PDF for a client.

![HRS pricing defaults](screenshot_hrs_defaults.png)
![CR pricing defaults](screenshot_cr_defaults.png)
![HDG pricing defaults](screenshot_hdg_defaults.png)

Live at [steelpricinghub.abacusai.app](https://steelpricinghub.abacusai.app).

There's also a standalone prototype at the repo root (`index.html`,
`steel_calculator_standalone.html`) — a single-file version of the calculator
with no backend, useful for a quick look without installing anything.

## `finance_calculator_deployed/nextjs_space/`

The app. Next.js 14 (App Router) + PostgreSQL, deployed via Abacus.ai.

**Stack:** JWT sessions (`jose`/`bcryptjs`) is the active auth — Prisma and
NextAuth are installed in the scaffold but currently dormant. PDF export goes
through a server-side Abacus.ai-hosted rendering endpoint
(`/api/generate-pdf`).

**Features:**
- Login backed by Postgres, passwords hashed with bcrypt, session as an
  httpOnly JWT cookie
- Three roles — junior / senior / admin — with an offer approval workflow
  (draft → pending review → approved/rejected → sent) and an admin panel for
  managing accounts, clients, and all offers
- Admin/senior can approve, reject, or edit offers awaiting review directly
  from their panels, and send approved offers to the client; quick-filter
  tabs (awaiting review / awaiting send / reviewed by me / all). A junior can
  now send an offer straight from draft, skipping approval, when every line
  item's margin and base PGL are at or above the admin-configured minimums —
  the offers list shows a "ready to send" / "needs approval" badge on drafts,
  and the calculator warns inline on any line item below threshold. Otherwise
  the offer still goes through the full approval path
- Clicking an offer's row on My Offers / senior / admin panels (not just its
  action buttons) opens it for editing. Editing an already-saved offer no
  longer overwrites it in place: if anything actually changed, the save
  creates a new version (`offer_<id>.1`, `offer_<id>.2`, ...), and prior
  versions stay visible under a collapsed "previous versions" list on the same
  card. An approved offer whose edited version again needs approval reverts to
  "pending review" instead of inheriting a stale approval
- Calculator page for HRS / CR / HDG / PICKLED / TEARDROP / ZM (Magnelis) pricing
  with live totals; clicking a line item's row (not just its pencil icon) opens
  it for editing
- EUR/PLN currency switch (all roles) — EUR is the single source of truth
  internally, PLN is a display/input layer; an offer freezes the exchange
  rate it was saved with, so changing the rate later never rewrites a saved,
  pending, or sent offer's price. Admin settings panel to configure the base
  exchange rate, base PGL, and base transport cost
- Client information split into company details (company, NIP, address, SAP ID)
  and optional contact details, which stay locked until company and NIP are
  filled. Company and NIP are typeahead search fields over the client
  directory — picking a suggestion fills in all four company fields. Saving an
  offer adds or updates that client in the directory, so the search learns new
  clients (existing values are never overwritten — only blanks get filled).
  Either field falls back to the other when empty, so clearing the NIP while the
  company is filled still suggests that company. Contact people are shared across
  the whole team: a company can have many, saving an offer stores the person, and
  the name field lists that company's contacts as soon as you click into it —
  picking one fills surname, phone, and e-mail. The admin Clients panel can also
  manage a company's contacts directly — expand, edit, add, or delete any of them
  without leaving the panel
- Base PGL configured per steel type (all six: HRS/CR/HDG/PICKLED/TEARDROP/ZM)
  instead of one shared value. Final unit price, line totals, and the
  calculator/offer-list/PDF summaries all round up to the nearest currency unit
  (never undercharge); the underlying stored/intermediate values stay unrounded.
  Every change to a base PGL price is logged (steel type, old/new value, who,
  when) in an admin-only history table, downloadable as `.xlsx`; each steel type
  gets a consistent color throughout the settings panel. Admin settings also has a
  "Minimum margin %" threshold, used together with base PGL to decide whether
  a junior can send an offer directly (see above)
- Admin dashboard tiles (offers by status, active salespeople, total offers)
  link straight to the offers list pre-filtered to that status, or to the
  salespeople panel
- High Contrast mode — a toggle next to Light/Dark, available on every page. One
  fixed bold black-on-white palette independent of the light/dark choice, plus
  larger text, for salespeople on older or very small screens
- Offers: create, list, duplicate, delete, edit — stored per-user in
  Postgres, with client info attached; optional offer name with an automatic
  `offer_<id>` fallback shown consistently across all offer lists; search by
  name, fallback name, or raw ID; sortable "My Offers" list (date/name/value/status)
- PDF export of an offer — the Remarks column lists every selected mill and
  processing (SSC) surcharge for each line item (thickness tolerance,
  certificate, coating, protection, packaging, surface, finish, weld,
  marking, edging, labels, etc.) — plus Excel (`.xlsx`) export in KTS/GPAO
  column format for both the calculator summary and individual offers
- Four languages: PL / EN / CS / DE

**Setup:**

```bash
cd finance_calculator_deployed/nextjs_space
npm install --legacy-peer-deps   # legacy flag: eslint 9 vs @typescript-eslint/parser@7, lint-only conflict
cp .env.example .env.local       # fill in DATABASE_URL and JWT_SECRET for your local Postgres
psql "$DATABASE_URL" -f migrations/001_create_users_table.sql
psql "$DATABASE_URL" -f migrations/002_create_offers_table.sql
psql "$DATABASE_URL" -f migrations/003_add_client_info_to_offers.sql
psql "$DATABASE_URL" -f migrations/004_add_user_roles.sql
psql "$DATABASE_URL" -f migrations/005_add_offer_workflow.sql
psql "$DATABASE_URL" -f migrations/006_create_clients_table.sql
psql "$DATABASE_URL" -f migrations/007_create_settings_table.sql
psql "$DATABASE_URL" -f migrations/008_offer_display_name.sql
psql "$DATABASE_URL" -f migrations/009_add_sap_id_and_client_lookup.sql
psql "$DATABASE_URL" -f migrations/010_create_client_contacts.sql
psql "$DATABASE_URL" -f migrations/011_split_pgl_base_by_type.sql
psql "$DATABASE_URL" -f migrations/012_resync_client_contacts.sql
psql "$DATABASE_URL" -f migrations/013_create_pgl_price_history.sql
psql "$DATABASE_URL" -f migrations/014_add_min_margin_pct.sql
psql "$DATABASE_URL" -f migrations/015_offer_versions.sql
psql "$DATABASE_URL" -f migrations/016_add_pgl_base_new_types.sql
psql "$DATABASE_URL" -f migrations/017_widen_pgl_price_history_steel_type.sql
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To create an admin
account for local testing, insert a user directly:

```bash
node -e "console.log(require('bcryptjs').hashSync('yourpassword', 10))"
```

```sql
INSERT INTO users (email, password, role, full_name, is_active)
VALUES ('you@example.com', '<hash from above>', 'admin', 'Your Name', true);
```

`ABACUSAI_API_KEY` (see `.env.example`) is a deployment token for the
Abacus.ai-hosted PDF generation service used by `/api/generate-pdf` — required
for PDF export, not for the rest of the app.

## Notes

- Real `.env`/`.env.local` files, local Postgres data, and files generated
  from actually running the app locally (saved offer PDFs, uploads) are
  excluded via `.gitignore` — they're runtime state, not source code. Use
  `.env.example` as a starting point.

## Roadmap

- [ ] Signup flow beyond the admin-only `/api/signup` endpoint
- [ ] Password reset via email
- [ ] Sales dashboard / offer history view
- [ ] Resolve dormant Prisma/NextAuth scaffold (finish wiring or remove)

## License

MIT
