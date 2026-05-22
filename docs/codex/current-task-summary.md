# Current Task Summary

## Active Area
`On-chain Board`

## Current Product Structure

### 1. 代币分析
- Entry: token list page
- Detail tabs:
  - 总览
  - 资金流图
  - Holder
  - CEX流入流出
  - 加池记录
  - 大额转账

### 2. 池子发现
- Entry: pool list page
- Detail page currently focuses on:
  - 加池记录

## Real Data Status

### Already real-data-first
- Fund flow
- Holder list
- Large transfers
- CEX inflow/outflow
- Pool add records
- On-chain overview:
  - A. token basics
  - C. holder concentration
  - H. top increase/decrease holders

### Still mixed / not fully settled
- Some pool discovery fields in pool list
- Some overview structural/control metrics
- Some DEX/CEX graph semantics are still heuristic

## Important On-chain Data Sources

### Token-centric
- `token_transfer_raw`
- `token_holder_snapshot`
- `wallet_info`

### Pool-centric
- `token_dex_pool_raw`
- `token_dex_pool_action_raw`
- `pool_started_timestamp_raw`

## Current Pool Discovery Status
- DB definitely has pool data.
- `token_dex_pool_raw` row count is non-zero (thousands).
- `token_dex_pool_action_raw` has `add_liquidity` data.
- Recent bug was not "no DB data", but local pool list load failure.

## Current Technical Focus
- Keep `代币分析` and `池子发现` as separate discovery paths.
- Fix pool list rendering and pool field joins before expanding pool detail further.

## Local Runtime Notes
- Local `On-chain Board` often depends on proxy-enabled dev server for BigQuery access.
- Preferred local URL: `http://localhost:3000/onchain`
