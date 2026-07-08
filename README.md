# SteelQuote

A web app for steel sales teams: calculate pricing (mill surcharges, processing
costs, margin, transport) for HRS, CR, and HDG steel in real time, save the
result as an offer, and export it to PDF for a client.

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
- Calculator page for HRS / CR / HDG pricing with live totals
- Offers: create, list, duplicate, delete, edit — stored per-user in
  Postgres, with client info attached
- PDF export of an offer

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
- [ ] Client picker in the calculator instead of manual entry
- [ ] Resolve dormant Prisma/NextAuth scaffold (finish wiring or remove)

## License

MIT
