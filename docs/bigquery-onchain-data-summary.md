# BigQuery 链上数据简表

更新时间：
- 2026-04-23

适用范围：
- 只整理本项目当前代码里实际用到的 BigQuery 数据
- 不包含 MySQL 表
- 重点给后续 Signal 方案评估用

## 结论

当前代码里，BigQuery 这边实际用到的链上表有 4 张：

- `token_transfer_raw`
- `token_holder_snapshot`
- `wallet_info`
- `token_dex_action_raw`

其中前 3 张已经直接接入接口并被页面使用；`token_dex_action_raw` 目前只用于“链上可用 token 列表”的活跃度统计，还没有单独做查询页面。

## 1. token_transfer_raw

用途：
- 做链上资金流图
- 统计某个 token 是否有 transfer 数据

当前代码实际读取到的字段：
- `token_id`
- `token_address`
- `block_time`
- `from_address`
- `to_address`
- `amount`
- `txhash`
- `id`

当前能支撑的能力：
- 按 token 地址查询转账流水
- 画从 `0x0` 地址开始的多层资金扩散图
- 统计每层地址数、金额、链路

当前接口：
- `onchain.getFundFlow`

当前返回给前端的核心字段：
- `totalAmount`
- `nodes`
- `links`
- `summaries`

说明：
- 代码里默认最多展开到 4 层
- 实际展示时会按每层金额排序截断
- 当前更像“转账扩散关系图”，还不是交易所净流入或 smart money 流向宽表

## 2. token_holder_snapshot

用途：
- 做 Holder 列表
- 取地址最新余额
- 统计某个 token 是否有 holder 数据

当前代码实际读取到的字段：
- `token_id`
- `token_address`
- `snapshot_date`
- `holder_address`
- `balance`
- `balance_rank`
- `balance_change24h`
- `balance_change7d`
- `is_new`
- `created_at`

当前能支撑的能力：
- 查某个 token 最新 holder 快照
- 分页返回 holder 排名列表
- 看单个 holder 的余额、24h/7d 变化、是否新进入榜单
- 在资金流图里补地址当前余额

当前接口：
- `onchain.getHolders`

当前返回给前端的核心字段：
- `snapshotDate`
- `total`
- `page`
- `pageSize`
- `items[].address`
- `items[].balance`
- `items[].rank`
- `items[].balanceChange24h`
- `items[].balanceChange7d`
- `items[].isNew`

说明：
- 这是“地址余额快照”表，不是完整交易流水
- 适合做 holder 排名、集中度、变化观察
- 现在还没基于它做完整的日级趋势宽表

## 3. wallet_info

用途：
- 给地址补标签和类型

当前代码实际读取到的字段：
- `address`
- `tag_label`
- `tags_base`
- `is_contract`

当前能支撑的能力：
- 地址名称展示
- 区分普通地址 / 合约地址
- 给 holder 列表和资金流图补标签

当前被哪些接口使用：
- `onchain.getFundFlow`
- `onchain.getHolders`

当前返回给前端的典型字段：
- `label`
- `kind`
- `isContract`

说明：
- 这张表本身不是行为数据
- 它是链上分析里非常重要的“标签增强表”

## 4. token_dex_action_raw

用途：
- 当前只用于统计某个 token 是否有 DEX 行为数据

当前代码实际读取到的字段：
- `token_id`

当前能支撑的能力：
- 在 `listAvailableOnchainTokens` 里统计 `dexActionCount`

当前接口：
- `onchain.listTokens`

说明：
- 目前代码没有展开读取买卖方向、地址、时间、金额等更细字段
- 也就是说，这张表现在“存在并被计数”，但还没有真正做成 DEX 分析能力

## 当前 Onchain 接口和 BigQuery 对应关系

### `onchain.listTokens`

依赖表：
- `token_transfer_raw`
- `token_holder_snapshot`
- `token_dex_action_raw`

用途：
- 列出当前 BigQuery 里“有链上数据”的 token

返回摘要：
- `transferCount`
- `holderCount`
- `dexActionCount`

### `onchain.getFundFlow`

依赖表：
- `token_transfer_raw`
- `wallet_info`
- `token_holder_snapshot`

用途：
- 返回资金流图节点、链路、每层汇总

### `onchain.getHolders`

依赖表：
- `token_holder_snapshot`
- `wallet_info`

用途：
- 返回 holder 快照和分页列表

## 现在 BigQuery 这边已经明确能拿到什么

一句话总结：

- 能拿到：转账流水、holder 快照、地址标签、DEX 行为计数
- 还没有直接做出来：交易所净流入、DEX 买卖结构、smart money 宽表、日级 signal 宽表

如果后面要做 Signal，基于当前 BigQuery 数据最容易先做的是：

- `holder 异动`
- `Top holder 变化`
- `资金扩散层级异常`
- `新地址进入 Top 榜`

不太适合直接做的是：

- 交易所净流入型 signal
- DEX 买卖占比型 signal
- 标签资金轮动型 signal

这些要么需要继续深挖 `token_dex_action_raw` 字段，要么需要补新的日级聚合表。
