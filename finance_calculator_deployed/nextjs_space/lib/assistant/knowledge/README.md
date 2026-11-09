# Assistant knowledge base

Markdown files embedded **verbatim** in the AI assistant's system prompt (stable, prompt-cached
prefix - see `docs/ai-assistant-plan.md` sections 5 and 11). Every fact must be backed by code;
when code changes, update the matching file. Keep the total small (target < 25 KB) - it is sent
with every request. Polish (`pl/`) first; English versions (`en/`) come later.

| File | Topic | Derived from |
|---|---|---|
| `pl/slownik.md` | glossary: app terms, statuses, surcharges, terms, steel types | `lib/translations.ts`, `lib/calculatorData.ts`, `lib/pricingEngine.ts`, `lib/priceBook.ts`, `lib/currency.ts`, `lib/quoteValidity.ts`, `lib/offerVersions.ts`, `lib/pdfLabels.ts`, migrations 008, 015, 032, 034 |
| `pl/cykl-oferty.md` | offer lifecycle, approval rules, client decision, versions | `lib/access/workflow.ts`, `lib/access/routing.ts`, `lib/access/ruleEngine.ts`, `app/api/offers/[id]/*`, `lib/lostReasons.ts`, migrations 025, 026, 030, 032, 036 |
| `pl/kalkulator.md` | price formula, components, calculator how-to | `lib/pricingEngine.ts`, `lib/offerItemValidation.ts`, `lib/priceBook.ts`, `lib/pglQuarterly.ts`, `lib/access/config.ts`, `components/Calculator.tsx` |
| `pl/transport.md` | incoterms, tariff, trucks, EUR/t | `lib/transportTariff.ts`, `lib/transportRouting.ts`, `lib/calculatorData.ts`, `components/Calculator.tsx` |
| `pl/role-i-widocznosc.md` | roles, flows, permissions, visibility | `lib/access/scope.ts`, `lib/access/types.ts`, migrations 025, 027, 030, 035 |
| `pl/metryki.md` | metric catalog, Polish verb mapping, analytics rules | `docs/ai-assistant-plan.md` 3.1/3.2, `lib/analyticsQuery.ts`, `lib/analyticsAggregate.ts`, `components/analytics/FilterBar.tsx` |
| `pl/faq.md` | common user questions about the app | the files above |

Approval rules, roles and visibility are admin-editable in the database; these files describe the
seeded defaults. The assistant must answer data questions from tools, not from these files.
