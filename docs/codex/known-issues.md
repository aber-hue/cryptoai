# Known Issues

## Local BigQuery Access
- Local Node runtime may not reach BigQuery directly without proxy.
- If On-chain data suddenly stops loading locally, first check whether the dev server was started with:
  - `HTTP_PROXY=http://127.0.0.1:7890`
  - `HTTPS_PROXY=http://127.0.0.1:7890`

## Old Local Dev Instances
- Multiple old `pnpm dev` / `node` instances can occupy nearby ports and confuse testing.
- Always confirm the actual active local URL before debugging the page.

## Pool Discovery
- Pool list can fail even when DB has data if join keys or types are mismatched.
- `poolRegistryId` / `pool_id` typing and joins are especially easy to get wrong.
- Some fields from pool discovery currently return sparse/null values even when rows exist.

## Holder Data Quality
- Some tokens have inconsistent holder-quality data across sources.
- Example pattern:
  - transfer activity looks rich
  - holder snapshot count or balances look too small
- Treat suspicious holder counts as source-quality issues first, not frontend bugs.

## Deprecated / Migrated DEX Tables
- `token_dex_action_raw` is historical / deprecated for newer pool logic.
- Prefer:
  - `token_dex_pool_action_raw`
  - `token_dex_pool_raw`
  - `pool_started_timestamp_raw`

## DEX / CEX Graph Interpretation
- Large transfer list = raw records
- Some graph views = netted or relationship-compressed views
- List count and graph node count may legitimately differ unless the task explicitly requires 1:1 mapping.
