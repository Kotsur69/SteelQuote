# v2.0 - Flows, roles, hierarchy levels (plan + decisions)

Source of truth: `Formularz_uprawnien_i_walidacji_ofert 22.09.26.xlsx` (sheets ROLE, REGULY,
WIDOCZNOSC, SYMULATOR). Where its sheets disagree, REGULY wins. Decisions below were confirmed
by the product owner on 2026-10-07.

## Domain model

| Table | Purpose |
|---|---|
| `hierarchy_levels` | N0, N+1, N+2, N+3 (`kind = chain`, ordered by `chain_rank`), NPR (`kind = parallel`), ADMIN (`kind = admin`) |
| `flows` | Admin-defined flows (seed: Flow 1 - DYSTR, Flow 2 - PROJEKTY) |
| `roles` | Global role catalogue (code + name) |
| `flow_roles` | A role inside a flow: its hierarchy level + the six functional permissions (both differ per flow) |
| `user_flow_roles` | Membership: one role per user per flow |
| `approval_rules` | REGULY engine, one row per criterion per flow (`flow_id NULL` = every flow) |
| `visibility_rules` | WIDOCZNOSC matrix, one row per role per flow |
| `offer_approval_steps` | The approvals an offer needs, created at submit |
| `users.is_superuser` | Administrator: technical superuser, outside the pyramid, present in every flow |

`users.role` (junior/senior/admin) stays readable until cut-over but no logic reads it.

## Seeded hierarchy

- Flow 1: Internal FO / External FO = N0, Area Sales Manager = N+1, Head of Cluster = N+2,
  CEO = N+3, Head of Projects = NPR.
- Flow 2: Internal FO / Key Account Manager = N0, Head of Projects = NPR, **CEO = N+2**
  (the ROLE sheet's N+3 is wrong; START + SYMULATOR say Flow 2 tops out at N+2).

The hierarchy level lives on `flow_roles`, not on `roles`, so the same CEO role sits at N+3 in
Flow 1 and N+2 in Flow 2.

## Validation rules

Final required level = MAX over all triggered rules (chain levels by rank). NPR is a separate,
parallel track: if an NPR rule fires, the NPR approver must approve too.

| Criterion | Fact the engine reads |
|---|---|
| `margin_below_target` | lowest item margin % (items without a margin count as 0) |
| `margin_deficit_pp` | `reference_value` (target) minus lowest item margin, in percentage points |
| `base_price_change` | 1 when any item PGL is below its current base (incl. quarterly override) |
| `base_reduction_pct` | largest `(base - pgl) / base * 100` over items |
| `quote_validity_hours` | `paymentTermDays * 24` |
| `price_validity_quarters` | from validFrom/validTo: same calendar month = 0, inside one quarter = 1, spans quarters = 2 |
| `price_validity_days` | inclusive day count of validFrom..validTo |
| `offer_value_eur` | sum of item `totalValue` (EUR) |

A rule with `threshold IS NULL` never fires and is listed by the completeness control.
Seed = the 12 REGULY rows (margin target 4.5 %, deficit >= 2.1 pp -> N+2, base change -> NPR,
validity, value > 1 000 000 EUR) plus unconfigured placeholders (margin N+3, base reduction
N+2/N+3, validity N+3).

## Routing

- Only the required level approves (no walk N+1 -> N+2). Shared queue per flow: anyone holding
  that level in the offer's flow with `can_approve_reject`.
- Steps at or below the creator's own level are auto-satisfied (chain: creator rank >= required
  rank; parallel: creator holds that level).
- A creator without `can_submit_to_validation` but with `can_approve_reject` (HoP, CEO) sends
  their own offers without validation.
- Level missing in the flow (T5): `app_settings.level_conflict_policy`
  `escalate_next` (default: nearest higher chain level present, else the highest one, with a
  visible note) | `block` (translated configuration-conflict error) | `escalate_top`.
- Superuser offers never need validation; a superuser can decide any pending step.

## Workflow

draft -> (submit) -> pending_review with steps -> every step approved -> approved -> sent.
Reject at any step -> rejected (reason = instructions for the seller); resubmit restarts.
A reviewer may edit a pending offer (new version row, as before). Rules re-run on the edited
version and steps are rebuilt, so an edit can push the offer to a higher level. A reviewer may
send an approved offer to the client on the creator's behalf (`offers.sent_by`).
Editing an approved offer that now needs validation -> pending_review with fresh steps.

## Visibility

Union over the user's memberships; superuser sees everything. Columns: own, team, branch,
region, all-in-flow, all-flows, awaiting-my-validation. There is no branch/region org model yet:
`app_settings.org_scope_fallback` decides what they mean (`team` by default, least privilege;
`flow` = whole flow). Team = the existing `team_members` table (leader <-> member), shared
membership in either direction. Visibility never implies edit or approval.

## Legacy migration

junior -> Flow 1 Internal Front Office, senior -> Flow 1 Area Sales Manager (team kept),
admin -> superuser. All existing offers -> Flow 1. Pending legacy offers get one N+1 step.
Accounts created by an admin start with no membership (no access until assigned).

## Chunks

1. Migrations 025-030 + seeds.
2. `lib/access/*`: context, permissions, rule engine, routing, visibility (vitest: T1-T5).
3. Session + active flow, route guards, middleware.
4. Workflow routes (submit/approve/reject/send/PUT/duplicate/decision) + validation queue.
5. Visibility in offer lists, review panel, analytics, PDF.
6. Admin UI: Flows, Roles & Levels, Rules + completeness + simulator, Visibility matrix.
7. Salespeople panel pyramid view + flow switcher.
8. Seed accounts, translations x4, README, v2.0 report.
