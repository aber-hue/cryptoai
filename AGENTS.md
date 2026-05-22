# AGENTS.md

## Scope
This workspace is the `crypto_exchange_dashboard` app.

Current primary focus:
- `On-chain Board`

Do not scan the whole repo by default. Read only the files directly related to the current task.

## Commands
- Install: `pnpm install`
- Dev: `pnpm dev`
- Typecheck: `pnpm check`

Local BigQuery development note:
- Local dev may require proxy env vars when starting the server:
  - `HTTP_PROXY=http://127.0.0.1:7890`
  - `HTTPS_PROXY=http://127.0.0.1:7890`

## Read First
- `docs/codex/module-map.md`
- `docs/codex/current-task-summary.md`

Read `docs/codex/known-issues.md` only when the task involves local runtime, BigQuery, pool discovery, or known data mismatches.

## Rules
- Work on one task at a time.
- Prefer minimal diffs.
- Do not refactor unrelated files.
- Before editing, identify the target files and briefly state the plan.
- After editing, run the narrowest relevant check.
- For frontend issues, first determine whether the problem is:
  - data source
  - API / router
  - frontend state / rendering
  - local dev server / runtime

## Main Working Files
- `client/src/pages/OnChainBoard.tsx`
- `server/liveData.ts`
- `server/routers.ts`

## Module Entry Points
- `代币分析` = token-centric path
- `池子发现` = pool-centric discovery path

Keep these two lines separate unless the task explicitly asks to bridge them.
