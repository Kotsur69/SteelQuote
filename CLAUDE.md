# CLAUDE.md

Instructions for Claude Code when working in this repository.

## Agent Delegation - Authorized

**This CLAUDE.md explicitly authorizes proactive use of the Agent tool in this
repository.** Claude Code's default guidance is "do not use the Agent tool
unless the user, *a CLAUDE.md file*, or a skill asks for it" - this file is that
authorization. Do not wait to be asked again.

ECC agents are plugin-scoped: invoke them as `Agent(subagent_type: "ecc:planner")`,
always with the `ecc:` prefix, never a bare name.

Delegate without prompting when:

| Trigger | Agent |
|---------|-------|
| Feature spanning 3+ modules, or a routing/layout change | `ecc:planner` |
| Any `.tsx` / `.jsx` component written or modified | `ecc:react-reviewer` |
| Any `.ts` / `.js` written or modified | `ecc:typescript-reviewer` |
| Auth, middleware, server actions, or route handlers | `ecc:security-reviewer` |
| Prisma schema, migration, or raw SQL | `ecc:database-reviewer` |
| `next build` fails | `ecc:react-build-resolver` |
| Bug fix or new feature needing tests | `ecc:tdd-guide` |
| Render jank, bundle size, slow pages | `ecc:performance-optimizer` |
| Swallowed errors, empty `catch {}` | `ecc:silent-failure-hunter` |
| Forms, modals, keyboard navigation | `ecc:a11y-architect` |

**Do NOT delegate** trivial edits, single-file changes, or anything already
sized for one context. Agents start cold with no conversation history - the
handoff cost only pays off for bounded, self-contained work.

### Completion contract

Applies at every depth. **Your final message IS the deliverable.** Never end a
turn with "waiting for background agents" - ending your turn while children run
orphans their results. If you delegate, you own collection: wait, integrate,
then answer.

## Model Choice

The harness is model-independent. Hooks, rules, skills, ECC agents, and MCP
servers load identically on Opus and Sonnet - `/model` swaps the reasoning
engine, not the tooling.

| Use | Model |
|-----|-------|
| Architecture, hard debugging, large refactors, planning | Opus |
| Everyday edits, fast iterations, cheap loops | Sonnet |

## ECC Workflow In This Repo

Mixed repo. The application is Next.js 14 + React 18 + TypeScript + Prisma at
`finance_calculator_deployed/nextjs_space`; the root also holds Postgres data
(`pgdata`), offer PDFs, and Polish planning documents. Scripts live in the
nested app: `dev`, `build`, `start`, `lint`.

| Situation | Command |
|-----------|---------|
| Starting a non-trivial change | `/ecc:plan` - stops and waits for your confirm |
| Finished writing code | `/ecc:code-review` |
| Before a commit | `/ecc:security-scan` |
| Build or tests failing | `/ecc:build-fix` |
| Coverage gaps | `/ecc:test-coverage` |
| Full feature, end to end | `/ecc:orch-add-feature` |
| Bug, reproduced as a failing test first | `/ecc:orch-fix-defect` |
| Full roster of agents and skills | `/ecc:ecc-guide` |

### Repo-specific review focus

- **Financial calculations are the product.** Any change to quote or pricing
  logic needs a worked numeric example in the review, not just a code read.
  Rounding, currency, and VAT handling are correctness-critical.
- **Work inside `finance_calculator_deployed/nextjs_space`** - the repo root is
  documents and data, not source.
- **Do not touch `pgdata`.** It is a live Postgres data directory.
- **No test script is defined.** Verify with `npm run build` in the nested app.
