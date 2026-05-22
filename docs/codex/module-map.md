# Module Map

## On-chain Board
- `client/src/pages/OnChainBoard.tsx`
  - Main On-chain Board page
  - Token analysis list/detail
  - Pool discovery list/detail
  - Tabs: overview, fund flow, holders, cex flows, pool adds, large transfers
- `server/liveData.ts`
  - BigQuery/MySQL data access
  - On-chain overview
  - Fund flow
  - Holder list
  - Large transfers
  - CEX inflow/outflow
  - Pool discovery list
  - Pool add records
- `server/routers.ts`
  - tRPC endpoints for all On-chain Board data

## Market Board
- `client/src/pages/DataManagement.tsx`
- `client/src/pages/CoinDetail.tsx`
- `server/liveData.ts`
- `server/routers.ts`

## Signal Board
- `client/src/pages/SignalBoard.tsx`
- `server/signal/*`
- `server/routers.ts`

## Template Lab
- `client/src/pages/TemplateLab.tsx`

## Free Chat
- `client/src/pages/FreeChat.tsx`
- `server/chat/*`
- `server/routers.ts`

## Docs Worth Reading Only When Relevant
- `docs/bigquery-onchain-data-summary.md`
  - Current BigQuery on-chain tables and status
- `docs/internal-release-memory.md`
  - Internal release conventions
- `docs/onchain-overview-realdata-plan.md`
  - Overview module real-data mapping plan
- `docs/bigquery-node-debug-note.md`
  - Historical local BigQuery/Node connectivity debugging
