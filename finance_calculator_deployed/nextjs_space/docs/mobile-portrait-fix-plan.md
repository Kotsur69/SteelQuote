# Mobile portrait fix — plan

## Status

- [x] Chunk 0 — Shared header + top navigation — **done**, verified at true 375px portrait (CDP device emulation) and 844×390 landscape (no regression). See notes under Chunk 0.
- [x] Chunk 1 — Calculator: top input controls — **done**, verified at true 375px portrait and 844×390 landscape (no regression). See notes under Chunk 1.
- [x] Chunk 2 — Calculator: pricing/surcharge breakdown panel — **done**, verified at true 375px portrait and 844×390 landscape (no regression), both sheet and coil mode. See notes under Chunk 2.
- [x] Chunk 3 — Calculator: summary table + modal — **done**, verified at true 375px portrait (CDP device emulation), 1920px desktop, and 844×390 landscape (no regression). See notes under Chunk 3.
- [x] Chunk 4 — Offers list page — **done**, verified at true 375px portrait (CDP device emulation) and 844×390 landscape (no regression). See notes under Chunk 4.
- [ ] Chunk 5 — Admin panels
- [ ] Chunk 6 — Analytics + senior panel

## Problem

The app looks correct in landscape on a phone but breaks visually in portrait.
Root cause, confirmed by reading the code: layouts across the app use **fixed
multi-column grids (`grid-cols-3`, `grid-cols-4`) and fixed pixel widths**
with no responsive breakpoints. Landscape width (~700-900px on a phone) is
wide enough to fit them; portrait width (~375-430px) is not, so columns get
crushed, text wraps badly, and some rows overflow horizontally.

## Scope (confirmed)

All of: Calculator, Offers list + top navigation, Admin panels, Analytics /
senior panel.

## Approach (confirmed)

**Targeted responsive fixes**, not a mobile redesign. Keep the existing
visual structure and information hierarchy; add breakpoints so grids stack,
fixed widths become flexible/scaled, and nothing overflows the viewport.

## Verification method (confirmed)

After each chunk: run the dev server, use Chrome DevTools device emulation
(iPhone SE 375×667 as the tightest common case, iPhone 14/15 390×844 as the
mainstream case) in portrait, screenshot the affected page(s), and check
landscape still looks the way it does today (no regression). You sign off
before moving to the next chunk.

## Non-goals

- No change to desktop or landscape appearance.
- No rewrite of the calculator's logic or visual identity.
- No new dependencies (pure Tailwind breakpoint / CSS work).

---

## Chunk 0 — Shared header + top navigation (do first, highest leverage) — DONE

The same header markup (`flex items-center gap-4 mb-7 pb-5 border-b`) is
duplicated near-identically in 5 places, all cramming a logo, title,
language selector, dark-mode toggle, high-contrast toggle, and 1-2 more
buttons into **one unbroken flex row**:

- `components/Calculator.tsx:1572`
- `app/offers/page.tsx:492`
- `app/senior/page.tsx:347`
- `app/analytics/page.tsx:258`
- `components/AdminLayout.tsx:45` (admin variant, has 4 buttons + a 7-tab sub-nav at line 96)

`components/Navigation.tsx` (the 🧮/📋/📊/🔍/⚙️ tab bar used by the first
four pages) is `flex flex-wrap`, no mobile-specific handling — on a 375px
screen it wraps into 2-3 rows and pushes content down.

**Fix:**
- Make the header row wrap sanely / shrink controls on narrow screens
  (icon-only buttons below a breakpoint, compact language selector).
- Make the nav tabs either horizontally scrollable in a single row, or
  icon-only below a breakpoint, so the "Nowa oferta" button and user-email
  block on the right never get squeezed off-screen.
- Same treatment for `AdminLayout`'s header + its 7-tab sub-nav.
- Since the header is duplicated 5×, fix once and either propagate the same
  change to each copy, or extract a shared header component while touching
  it (judgment call made at implementation time, kept low-risk).

**Files:** `components/Navigation.tsx`, `components/AdminLayout.tsx`,
`components/Calculator.tsx` (header block only), `app/offers/page.tsx`,
`app/senior/page.tsx`, `app/analytics/page.tsx`.

**Result:** applied the same treatment to all 6 files — header wraps to a
second row instead of overflowing, right-side controls (language flags,
dark/high-contrast/logout toggles) grouped into their own wrapping
container, title/subtitle get `truncate` so they can't force overflow,
button/tab text labels hidden below the `sm` (640px) breakpoint (icon-only
on portrait, full text restored at landscape width — landscape is
unchanged from before). Added a 🚪 icon to the logout button so it stays
recognizable with its label hidden.

Verified at a true 375px portrait viewport (CDP device emulation, not just
window resize) on Calculator, Offers, Analytics, and the Admin dashboard:
`document.documentElement.scrollWidth === window.innerWidth` on all four
(zero horizontal overflow), plus screenshots confirming the header/nav wrap
cleanly into 2 compact rows. Verified 844×390 landscape shows the original
single-row, full-text layout — no regression. Could not directly verify
`/senior` (test login is admin-role, gets redirected off that route), but
it shares the identical code pattern already confirmed elsewhere.

**Found while testing (not fixed, out of this chunk's scope):** on the
Offers list page, the per-offer action row (Excel / PDF / Cofnij decyzję
buttons) gets clipped at the right edge in portrait — noted under Chunk 4.

---

## Chunk 1 — Calculator: top input controls — DONE

Non-responsive grids driving the material/dimension input area:
- `components/Calculator.tsx:1705`, `1786` — `grid-cols-4`
- `components/Calculator.tsx:1881` — `grid-cols-3`
- `components/Calculator.tsx:2007` — `grid-cols-3`/`grid-cols-4` (coil-mode dependent)
- Coil-mode toggle switch at `1927`, fixed-width numeric inputs (`w-[80px]` at `2132`, `w-[90px]` in `TransportPanel.tsx:210`)

**Fix:** stack to 1-2 columns on narrow screens (`grid-cols-1 sm:grid-cols-2
md:grid-cols-3/4`), let numeric inputs shrink instead of forcing width.

**Files:** `components/Calculator.tsx` (lines ~1700-2140), `components/TransportPanel.tsx`.

**Result:** confirmed with Mati before implementing — kept the steel type
selector at a fixed 3-column grid (his call, for compactness) and stacked
the Input Parameters Bar (Thickness/Width/Length/Grade) to a full
single-column on mobile (his call, for readability), restoring the
original column counts at `sm`/`md`. Client info + contact grids
(`grid-cols-4`) go to `grid-cols-1 sm:grid-cols-2 md:grid-cols-4`. Added
`flex-wrap` to the offer-validity and payment-term date-range groups and
to the one-time-grade-surcharge row so they wrap instead of overflowing.

**Bug found and fixed (not in original scope):** the steel type button for
PICKLED (Polish label "HRS Trawiona") silently clipped the word "Trawiona"
at 375px — `scrollWidth` (98px) exceeded `clientWidth` (86px) inside the
button's `overflow-hidden`, so text vanished with no visible scrollbar.
Only the Polish locale hits this (EN/CZ/DE use the short label "PICKLED").
Fixed by shrinking the button's padding/font-size/tracking below the `sm`
breakpoint and adding `break-words` as a safety net for any future long
label in any locale.

`TransportPanel.tsx`'s `w-[90px]` km input was checked and left as-is — it
sits next to a `flex-1` label that absorbs the squeeze, no overflow risk.

Verified at a true 375px portrait viewport (CDP device emulation): zero
horizontal overflow (`scrollWidth === innerWidth`) throughout the whole
input-controls section, all four fixes rendering cleanly, the (out-of-scope,
Chunk 2) pricing panel below correctly contained by its own scroll instead
of leaking overflow to the page. Verified 844×390 landscape restores the
original multi-column layout (4-col input bar, 4-col client/contact grids,
single toggle button, no duplication) with zero overflow — no regression.

---

## Chunk 2 — Calculator: pricing/surcharge breakdown panel — DONE

The dense financial breakdown (lines ~2199-2480+) is a `grid-cols-2`/`3`
block containing dozens of rows, each with `min-w-[28px]`/`min-w-[64px]`
value spans and `w-[22px]` currency-symbol spans packed tightly. This is
the single most cramped section of the app and the most likely place users
notice broken/overlapping numbers in portrait.

**Fix:** stack the outer grid to 1 column on mobile; within each row let the
label/value pair wrap onto its own line cleanly instead of relying on fixed
min-widths that don't have room to breathe.

**Files:** `components/Calculator.tsx` (lines ~2199-2480+).

**Result:** changed only the outer grid at `Calculator.tsx:2201` from a
fixed `grid-cols-2`/`grid-cols-3` (coil-mode dependent) to
`grid-cols-1 sm:grid-cols-2 md:grid-cols-3` (3-col branch omitted in coil
mode, matching the original always-2-col coil behavior once past `sm`).
No per-row changes were needed: the existing `flex items-center` rows,
`ToggleGroup`'s built-in `flex-wrap`, and the lack of `whitespace-nowrap`
on labels already let long Polish labels and multi-button toggle groups
wrap cleanly once each card has a full mobile-width column instead of a
squeezed 1/3-width slice. Verified with a scripted scan of every element
inside the panel for `scrollWidth > clientWidth` (the exact hidden-clipping
pattern the Chunk 1 PICKLED bug had) — zero clipped elements, in both
sheet and coil mode, at true 375px portrait. Verified 844×390 landscape
restores the original 3-column (sheet mode) / 2-column (coil mode) grid
with zero horizontal overflow — no regression.

---

## Chunk 3 — Calculator: summary table + modal

- Save-offer modal: `w-[400px] max-w-[90vw]` at line 1530 — check it doesn't
  clip on very small screens.
- The "Zestawienie" (summary) table at line 2819 is a real 11-column
  `<table>` with drag-to-reorder rows (`ZestawienieRow.tsx`), wrapped in
  `overflow-x-auto`. Full column view genuinely does not fit a phone width —
  the realistic mobile-portrait fix here is to **confirm the horizontal
  scroll is contained to the table** (not the whole page), make it obviously
  scrollable (touch-friendly, maybe a scroll hint), and consider trimming
  column min-widths so more fits before scrolling kicks in. This section
  decides the exact column treatment at implementation time.

**Files:** `components/Calculator.tsx` (modal + table wrapper), `components/ZestawienieRow.tsx`.

**Result:** save-offer modal needed no code change — `w-[400px] max-w-[90vw]` with
`w-full` children already scales cleanly at 375px, confirmed by screenshot.

Zestawienie table (11 columns, real horizontal scroll unavoidable on a phone —
that's expected, not a bug): trimmed the `Opis` column's `min-w-[180px]` to
`min-w-[130px] sm:min-w-[180px]`, and every cell/header's `px-3.5` padding to
`px-2 sm:px-3.5` (drag-handle and Lp. columns to `px-1.5`/`px-2`), all
restored to original values at `sm`+. Actions column (✏️ ⧉ 🗑) kept all three
buttons inline, just tighter padding/gap below `sm` — per your call, no
overflow menu. Lp. column kept (not hidden) — per your call, padding-only
trim. Added a CSS-only auto-hiding edge-fade ("scroll shadow") on the table's
`overflow-x-auto` wrapper — a dual-layer background-gradient trick
(`background-attachment: local`/`scroll`) that fades in/out automatically as
you scroll, no JS, no new dependency — per your call over a static arrow.

Verified at a true 375px portrait viewport (CDP device emulation): zero
horizontal overflow on the whole page (`document.documentElement.scrollWidth
=== window.innerWidth`) even while the table itself is scrolled to either
end, table's own scroll wrapper correctly contains ~400px of extra content
(11 columns still don't fully fit on a phone, as expected), zero hidden-clipping
elements anywhere on the page (scripted `scrollWidth > clientWidth` scan,
same method as Chunks 1-2), all three action buttons reachable and fully
visible at max scroll, save modal renders cleanly. Verified 1920px desktop:
table fits with zero scroll at all (`scrollWidth === clientWidth`), original
full padding restored, pixel-equivalent to pre-change. Verified 844×390
landscape: same original full-`sm`-padding rendering as before (page-level
overflow still 0) — the table's own slight overflow at that specific width
is pre-existing (identical `sm:` values to the original code, unrelated to
this chunk) and not a regression.

---

## Chunk 4 — Offers list page

`app/offers/page.tsx` (1036 lines): search/sort controls layout, list rows
(company + SAP ID + status badge — recently reworked, likely close to fine
already but needs a portrait check), and the `overflow-x-auto` table at
line 742.

**Known issue found during Chunk 0 testing:** the per-offer action row
(Excel / PDF / Cofnij decyzję buttons) is clipped at the right edge in
portrait — needs a fix here (likely wrap the actions or shrink/condense
them below the `sm` breakpoint, same pattern as Chunk 0).

**Files:** `app/offers/page.tsx`.

**Result:** confirmed with Mati before implementing — simple `flex-wrap`
fix (no icon-only compacting) for the action-buttons bug, verify-first for
the rest of the page (no proactive hardening beyond what screenshots
showed broken).

Root cause was two-part, not one: the outer row at line 638
(`flex items-start justify-between gap-4`) had no `flex-wrap`, so the
`flex-shrink-0` action-buttons block was forced to sit beside the offer
info instead of dropping to its own line — fixed by adding `flex-wrap`.
That alone wasn't enough: once alone on its own line, the action-buttons
div (`flex flex-wrap justify-end`) still sized itself to its full
max-content width (562px, confirmed via a scripted `getBoundingClientRect`
scan) instead of the 330px actually available, so its *own* `flex-wrap`
never got a chance to trigger and the last 1-2 buttons (e.g. "Usuń") were
invisible past the card's `overflow-hidden` edge. Fixed by adding
`w-full sm:w-auto` to that div so it fills the wrapped row below `sm`,
letting its buttons wrap onto 2-3 rows (all reachable, none clipped), and
reverts to its original single-row auto-width behavior at `sm`+.

Verify-first pass on the rest of the page (search/sort header, offer-row
badges/text, the 6-column zestawienie preview table) found nothing else
broken — search/sort header and offer-row text already used `flex-wrap`/
`truncate` and needed no change. The zestawienie preview table (mirrors
the Calculator's Zestawienie table from Chunk 3) needs its own horizontal
scroll at 375px (420px of content vs. 283px visible) — expected, not a
bug, and confirmed contained to the table's own `overflow-x-auto` wrapper
rather than leaking to the page.

Verified at a true 375px portrait viewport (CDP device emulation): zero
page-level horizontal overflow (`document.documentElement.scrollWidth ===
window.innerWidth`), zero hidden-clipping elements anywhere on the page
(scripted `scrollWidth > clientWidth` scan, same method as Chunks 1-3,
excluding intentional `truncate` labels), all action buttons on every
offer row (including the longest set: Excel/PDF/Edytuj/Wyślij do
klienta/Duplikuj/Usuń) fully visible and reachable. Verified 844×390
landscape: all 6 action buttons render on a single row exactly as before
(`rowsUsed: 1`), zero horizontal overflow — no regression.

**Follow-up (raised after initial verification):** the company + SAP ID
line (`clientCompanyLine`) still truncates on narrow screens by design —
that's what keeps the row height compact for every other row — but Mati
flagged that the SAP ID matters and wanted it reachable without a
permanent layout change. Added `title={clientCompanyLine(offer)}` (native
hover tooltip on desktop, matches this file's existing convention for
truncated text — see `truncateNote`) plus a tap-to-toggle: clicking the
line swaps its class from `truncate` to `break-words` for that row only
(new `expandedCompanyId` state, same pattern as `expandedId`/
`expandedVersionsId`), wrapping the full company name + SAP ID onto 2
lines on demand, tap again to re-collapse. Verified at 375px portrait: the
row grows from 20px to 40px only while expanded, `document.documentElement
.scrollWidth === window.innerWidth` holds before and after, no other row
is affected.

---

## Chunk 5 — Admin panels

`klienci`, `kontakty`, `handlowcy`, `oferty` (admin), `ustawienia` — mostly
data tables already wrapped in `overflow-x-auto` (likely degrade
acceptably via horizontal scroll rather than visually breaking, but needs
confirming), plus `ustawienia` has 3 separate tables (lines 544, 698, 906)
and probably grid-based forms to check.

**Files:** `app/admin/*/page.tsx`.

---

## Chunk 6 — Analytics + senior panel

Charts and KPI tiles: `components/analytics/KpiTiles.tsx`,
`components/analytics/WinLossPanel.tsx` (both use `grid-cols-N` without
breakpoints), `components/analytics/DataTablePanel.tsx`,
`app/analytics/page.tsx`, `app/senior/page.tsx`.

**Files:** as listed.

---

## Working process

1. One chunk at a time, in the order above (0 → 6) — chunk 0 unblocks the
   visual "frame" every other page sits inside, so it's worth doing first.
2. After each chunk: dev server + Chrome DevTools portrait screenshot for
   review, plus a landscape screenshot to confirm no regression.
3. You review and say go/no-go before the next chunk starts.
4. This file gets checked off / annotated as chunks land, so we always have
   an up-to-date reference of what's done vs. pending.

## Decisions for the remaining chunks (confirmed 2026-09-16)

- **Pacing:** one chunk at a time, same as Chunks 0-1 — screenshot portrait
  + landscape after each, wait for go/no-go before starting the next.
- **Chunk 3 table treatment:** trim the Zestawienie table's column
  min-widths so more columns fit before horizontal scroll kicks in, *and*
  add a visible scroll hint (shadow/arrow) for whatever still needs
  scrolling. Confirm scroll stays contained to the table, not the page.
- **Chunk 5 (Admin) / Chunk 6 (Analytics) scope:** a re-check against
  current code (2026-09-16) found most grids in these areas already
  responsive (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-N` patterns already
  present in `app/admin/klienci`, `handlowcy`, `kontakty`, `oferty`, the
  admin dashboard, `KpiTiles.tsx`, `WinLossPanel.tsx`) — likely added after
  this plan was originally written. **Verify-first approach:** screenshot
  each admin/analytics page at true 375px portrait first; only change code
  where something actually overflows or breaks (tables, non-grid elements,
  edge cases), not a blanket rewrite.
