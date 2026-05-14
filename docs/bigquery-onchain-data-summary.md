# BigQuery 链上数据简表

更新时间：
- 2026-05-11

适用范围：
- 基于最新文档 [BigQuery表和字段说明 (2).md](/Users/mmobay202303/Downloads/BigQuery表和字段说明%20(2).md)
- 用于说明本项目当前 `On-chain Board` 可用的 BigQuery 表、关键字段和使用注意事项
- 这里同时区分：
  - **官方当前主链路表**
  - **历史/废弃表**
  - **当前页面仍在使用但后续应迁移的表**

## 结论

当前 BigQuery 文档和研发补充口径已经明确：

- **当前主链路表**
  - `token_transfer_raw`
  - `token_dex_pool_raw`
  - `token_dex_pool_action_raw`
  - `pool_started_timestamp_raw`
  - `token_holder_snapshot`
  - `wallet_info`
  - `token_transfer_raw_staging`

- **历史 / 废弃表**
  - `token_dex_action_raw`

也就是说：

- 资金流、Holder、CEX 流入流出，优先应基于：
  - `token_transfer_raw`
  - `token_holder_snapshot`
  - `wallet_info`
- DEX 交易 / 质押 / 池子行为，当前主链路应理解为：
  - `token_dex_pool_action_raw`
- `token_dex_action_raw` 现在只应视为：
  - 历史数据
  - 临时排查口径
  - 待迁移页面的旧来源

## 1. 当前主链路表

### 1.1 `token_transfer_raw`

用途：
- token 转账原始记录
- 资金流图
- 大额转账
- CEX 流入流出
- 地址链路追踪

关键字段：
- `token_id`
- `token_address`
- `chain_id`
- `txhash`
- `log_index`
- `block_number`
- `block_time`
- `from_address`
- `to_address`
- `value`
- `amount`

本项目当前用法：
- `onchain.getFundFlow`
- `onchain.getLargeTransfers`
- `onchain.getCexFlowSummary`
- `onchain.getCexFlowTransfers`
- `onchain.listTokens` 的 transfer 活跃度统计

注意：
- 业务去重键按文档应理解为：
  - `chain_id + token_id + txhash + log_index`
- 当前很多链上分析能力都应以它为上游事实表。

### 1.2 `token_holder_snapshot`

用途：
- 每日 token 持币人快照
- Holder 排名
- Top10 / Top50 / Top100 持仓统计
- 24h / 7d 持仓变化
- 新地址识别

关键字段：
- `chain_id`
- `token_id`
- `token_address`
- `snapshot_date`
- `holder_address`
- `balance`
- `balance_rank`
- `balance_delta24h`
- `balance_delta7d`
- `is_new`
- `created_at`

本项目当前用法：
- `onchain.getHolders`
- `onchain.getOverview`
- 资金流图节点余额补充
- 新增 / 流失 Top 地址
- `onchain.listTokens` 的 holder 活跃度统计

注意：
- 快照按 **UTC 日** 生成
- 页面上如果要看“最新 holder 数”，应理解为“最新一期快照的 holder 数”，不是历史累计去重地址数。

### 1.3 `wallet_info`

用途：
- 地址标签库
- 是否合约
- 交易所 / CEX / 标签识别
- 地址最近活跃时间

关键字段：
- `address`
- `tag_label`
- `tags_base`
- `to_funded_by`
- `to_funded_time`
- `funded_txhash`
- `last_tx_time`
- `is_contract`
- `updated_at`
- `created_at`

本项目当前用法：
- `onchain.getFundFlow`
- `onchain.getHolders`
- `onchain.getLargeTransfers`
- `onchain.getCexFlowSummary`
- `onchain.getCexFlowTransfers`

注意：
- 地址匹配应统一用 `LOWER(address)`
- 这是标签增强表，不是行为事实表。

### 1.4 `token_dex_pool_raw`

用途：
- Pancake v4 / Infinity pool initialize 原始记录
- 业务上可用池清单

关键字段：
- `row_id`
- `chain_id`
- `dex_name`
- `protocol_version`
- `pool_manager_address`
- `pool_type`
- `pool_id`
- `pool_address`
- `token0_address`
- `token1_address`
- `token0_symbol`
- `token1_symbol`
- `token0_name`
- `token1_name`
- `token0_decimals`
- `token1_decimals`
- `lp_fee_raw`
- `lp_fee_percent`
- `parameters`
- `tick_spacing`
- `bin_step`
- `sqrt_price_x96`
- `initial_tick`
- `active_id`
- `txhash`
- `log_index`
- `block_number`
- `block_time`
- `source_event`

本项目当前状态：
- **当前代码还没有正式接入这个表做页面能力**
- 这张表的主要作用是：
  - 记录 BSC 链 Pancake 新建池子记录
  - 用于解释 `pool_id`
- 研发补充口径：
  - 当前只跟踪 **Pancake v4**
  - 且只保留 **深度大于 10W USDT** 的池子
- 所以它不是“全链所有 DEX 池”的全量表，而是业务筛选后的可用池表。

### 1.5 `token_dex_pool_action_raw`

用途：
- 当前 DEX 池子级交易 + 流动性行为主表
- 新逻辑产出的 DEX 交易 / 质押 / 流动性数据

关键字段（按文档与当前口径理解）：
- `chain_id`
- `token_id`
- `pool_registry_id`
- `token_address`
- `token_symbol`
- `quote_token_address`
- `quote_token_symbol`
- `txhash`
- `log_index`
- `block_number`
- `block_time`
- `event_name`
- `event_signature`
- `action_type`
- `side`
- `trader_address`
- `recipient_address`
- `token_amount`
- `quote_token_amount`
- `value`
- `price`
- `parse_source`
- `parse_reason`
- `created_at`

本项目当前状态：
- **这是当前官方 DEX action 主链路表**
- 研发补充说明：
  - `token_dex_action_raw` 已废弃
  - `token_dex_pool_action_raw` 是新逻辑
  - 已抓取了所有 Alpha 代币的初期数据
  - 仅少数时间太久的币，交易历史还没完全追上

本项目建议用法：
- 后续 DEX 交易、加池/减池、池子相关分析，应优先迁到这张表
- 旧的 `token_dex_action_raw` 只做历史兼容和排查，不再新增依赖

### 1.6 `pool_started_timestamp_raw`

用途：
- PoolStartedAtUpdated 原始事件
- 适合补池子真正启动时间

关键字段：
- `row_id`
- `chain_id`
- `contract_address`
- `event_name`
- `event_signature`
- `txhash`
- `transaction_index`
- `log_index`
- `block_number`
- `block_hash`
- `block_time`
- `pool_id`
- `started_timestamp`
- `started_time`
- `operator_address`
- `gas_price`
- `gas_used`
- `raw_data`
- `created_at`

本项目当前状态：
- **当前代码还没有正式接入**
- 这张表的主要业务意义是：
  - 记录 BSC 上 BN Alpha 在链上设置“开放交易”的时间
- 研发补充说明：
  - 表里的 `pool_id` 需要去另一张表对应
  - 对应关系主要靠 `token_dex_pool_raw`
- 后续如果要展示“池子开放交易时间 / 开盘时间”，优先考虑这张表 + `token_dex_pool_raw`。

### 1.7 `token_transfer_raw_staging`

用途：
- `token_transfer_raw` 的修复 / 回补 / staging 写入

关键字段：
- 与 `token_transfer_raw` 基本一致
- 额外：
  - `_staging_batch_id`
  - `_staged_at`

本项目当前状态：
- 页面不直接使用
- 主要是数据工程 / 回补链路使用。

## 2. 历史 / 废弃表

### 2.1 `token_dex_action_raw`

文档状态：
- **已废弃，不再作为当前主链路口径**

本项目当前仍在使用的地方：
- `onchain.listTokens`
  - 用它统计 `dexActionCount`
- `onchain.getPoolAdds`
  - 读取 `action_type = 'add_liquidity'`
- 部分大额转账 DEX/CEX 辅助视图的旧推导逻辑

当前页面对它的现实含义：
- 它还能提供一部分**历史行为数据**
- 但不应被当成后续所有 DEX 页面能力的长期稳定主源

当前已知风险：
- 某些币（例如 `OPG`）的 `add_liquidity` 记录里，`amount_in` / `value_in` 可能大量为 `0`
- 这不是前端读错，而是源表历史记录本身如此
- 因此这张表只适合做“历史排查 / 临时展示”，不宜直接当作精确资金分析主口径。

## 3. 当前 On-chain 页面与 BigQuery 对应关系

### 3.1 已较稳接入

- `资金流图`
  - `token_transfer_raw`
  - `wallet_info`
  - `token_holder_snapshot`

- `Holder`
  - `token_holder_snapshot`
  - `wallet_info`

- `大额转账`
  - 主数据：`token_transfer_raw`
  - 标签补充：`wallet_info`

- `CEX流入流出`
  - `token_transfer_raw`
  - `wallet_info`

- `总览` 中已接真数据部分
  - `token_holder_snapshot`
  - `wallet_info`
  - 配合 MySQL `token_profiles`

### 3.2 仍带历史口径的部分

- `链上可用 token 列表` 中的 `dexActionCount`
  - 仍来自 `token_dex_action_raw`

- `加池记录`
  - 当前仍来自 `token_dex_action_raw`
  - 只展示 `action_type = 'add_liquidity'`

- 某些 DEX / CEX 视图的辅助关系识别
  - 当前仍受历史 DEX 行为表影响

### 3.3 后续应该迁移到新表的部分

- `加池记录`
  - 目前还在用旧 `token_dex_action_raw`
  - 后续应迁移到 `token_dex_pool_action_raw`

- `DEX 大额流向 / CEX 大额流向` 的池子交互辅助逻辑
  - 如果继续依赖 DEX 行为表，应该迁到 `token_dex_pool_action_raw`

- 任何需要 `pool_id` 解释、池子开放时间解释的功能
  - 应联动：
    - `token_dex_pool_action_raw`
    - `pool_started_timestamp_raw`
    - `token_dex_pool_raw`

## 4. 现在最值得记住的口径

一句话总结：

- **转账 / Holder / 标签**：现在可以把 `token_transfer_raw + token_holder_snapshot + wallet_info` 当成主链路
- **DEX 行为 / 加池记录**：当前仍有历史表依赖，能展示，但要带“历史/待迁移”意识
- **池子创建 / 启动时间**：后续应迁到 `token_dex_pool_raw + pool_started_timestamp_raw`

## 5. 对后续功能开发的建议

优先使用：
- `token_transfer_raw`
- `token_holder_snapshot`
- `wallet_info`
- `token_dex_pool_raw`
- `token_dex_pool_action_raw`
- `pool_started_timestamp_raw`

谨慎使用：
- `token_dex_action_raw`

当前应避免继续扩展依赖：
- 历史逻辑里的 `token_dex_action_raw`

## 6. 常见误区

### 6.1 “列表多，图里少，是不是丢数据了？”

不一定。
如果图是按“地址对净额关系”构图，而列表是逐笔明细：
- 列表条数很多
- 图上关系很少
是可能正常发生的。

### 6.2 “Holder 最新只有几百，是不是前端算错了？”

不一定。
`token_holder_snapshot` 是**最新一期快照**
它展示的是：
- 最新快照地址数
不是：
- 历史累计唯一地址数

### 6.3 “加池记录里 amount_in 是 0，是不是页面错了？”

不一定。
像 `OPG` 这类币，我们已经核到（基于旧 `token_dex_action_raw` 历史表）：
- 源表里很多 `add_liquidity` 记录本身就是 `amount_in = 0`
- 页面只是按文档口径直接展示出来

### 6.4 “pool_id / 开放交易时间应该怎么解释？”

当前正确理解是：
- `pool_started_timestamp_raw`
  - 给的是 BSC 上 BN Alpha 在链上设置开放交易的时间
- `token_dex_pool_raw`
  - 用来解释 `pool_id` 对应的是哪个池子
- 两张表应一起看，不能单看其中一张。

## 7. 参考文档

- 最新字段说明：
  [BigQuery表和字段说明 (2).md](/Users/mmobay202303/Downloads/BigQuery表和字段说明%20(2).md)
