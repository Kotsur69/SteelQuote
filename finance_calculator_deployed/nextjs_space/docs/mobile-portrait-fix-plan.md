# Mobile portrait fix — plan

## Status

- [x] Chunk 0 — Shared header + top navigation — **done**, verified at true 375px portrait (CDP device emulation) and 844×390 landscape (no regression). See notes under Chunk 0.
- [ ] Chunk 1 — Calculator: top input controls
- [ ] Chunk 2 — Calculator: pricing/surcharge breakdown panel
- [ ] Chunk 3 — Calculator: summary table + modal
- [ ] Chunk 4 — Offers list page
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

## Chunk 1 — Calculator: top input controls

Non-responsive grids driving the material/dimension input area:
- `components/Calculator.tsx:1705`, `1786` — `grid-cols-4`
- `components/Calculator.tsx:1881` — `grid-cols-3`
- `components/Calculator.tsx:2007` — `grid-cols-3`/`grid-cols-4` (coil-mode dependent)
- Coil-mode toggle switch at `1927`, fixed-width numeric inputs (`w-[80px]` at `2132`, `w-[90px]` in `TransportPanel.tsx:210`)

**Fix:** stack to 1-2 columns on narrow screens (`grid-cols-1 sm:grid-cols-2
md:grid-cols-3/4`), let numeric inputs shrink instead of forcing width.

**Files:** `components/Calculator.tsx` (lines ~1700-2140), `components/TransportPanel.tsx`.

---

## Chunk 2 — Calculator: pricing/surcharge breakdown panel

The dense financial breakdown (lines ~2199-2480+) is a `grid-cols-2`/`3`
block containing dozens of rows, each with `min-w-[28px]`/`min-w-[64px]`
value spans and `w-[22px]` currency-symbol spans packed tightly. This is
the single most cramped section of the app and the most likely place users
notice broken/overlapping numbers in portrait.

**Fix:** stack the outer grid to 1 column on mobile; within each row let the
label/value pair wrap onto its own line cleanly instead of relying on fixed
min-widths that don't have room to breathe.

**Files:** `components/Calculator.tsx` (lines ~2199-2480+).

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
