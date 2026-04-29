# On-chain Board 总览页真实数据接入清单

更新时间：
- 2026-04-29

适用页面：
- `/onchain`
- `总览` tab

当前状态：
- 总览页主体仍然是 mock 数据驱动
- 已经接上真实数据的主要是：
  - `资金流图`
  - `Holder`
  - `大额转账`

当前可用真实数据源：
- MySQL
  - `token_profiles`
  - `token_address`
- BigQuery
  - `token_transfer_raw`
  - `token_holder_snapshot`
  - `wallet_info`
  - `token_dex_action_raw`

---

## 模块接入总表

| 模块 | 当前页面内容 | 真实数据可接程度 | 可用数据源 | 备注 |
|---|---|---|---|---|
| A. 代币基础信息 | 名称、价格、总量、市值、FDV、持币人数、TopN占比 | 部分可直接接 | `token_profiles`、`token_holder_snapshot` | 基础资料能接；TopN 占比和 holder 日变化要补算 |
| B. 控盘结构 | 显性/隐性/间接/合计控盘、控盘率趋势 | 暂时接不上 | 无稳定现成表 | 需要额外口径定义和聚合规则 |
| C. 持仓集中度 | Top10/50/100、持币人数 30 天趋势 | 大部分可接 | `token_holder_snapshot` | TopN 能接；30 天趋势可接；当前页面需要后端聚合 |
| D. 交易所流向 | 流入/流出/净流入/连续天数 | 暂时接不上 | 无稳定现成表 | 需要交易所地址库 + 日级聚合 |
| F. DEX 买卖结构 | 总买卖量、地址数、Top5 买卖量、趋势 | 部分可接但需新聚合 | `token_dex_action_raw` | 原始表有潜力，但当前代码还没把买卖结构抽出来 |
| G. 大户行为 | Top100 地址流向、大户净转出 | 部分可接但需新聚合 | `token_holder_snapshot`、`token_transfer_raw` | 要先定义“大户集合”，再做转账聚合 |
| H. 新增/流失 Top10 地址 | 新进/减少最多地址表 | 可接但需新聚合 | `token_holder_snapshot` | 需要做快照对比 |
| I. 重点标签地址净变化 | Team/MM/Sybil 等标签净变化 | 部分可接但需新聚合 | `wallet_info`、`token_holder_snapshot`、`token_transfer_raw` | 目前标签覆盖不够全，且缺净变化宽表 |
| J. 综合趋势 | 多指标 30 天趋势 | 暂时接不上 | 无统一宽表 | 需要先把 B/D/F/G/I 做成日级序列 |

---

## 字段级判断

### A. 代币基础信息

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `tokenName` | 可以 | `token_profiles.name` | 可直接接 |
| `tokenSymbol` | 可以 | `token_profiles.symbol` | 可直接接 |
| `priceUsd` | 可以 | `token_profiles.currentPrice` | 可直接接 |
| `priceChange24h` | 可以 | `token_profiles.priceChange24h` | 可直接接 |
| `totalSupply` | 可以 | `token_profiles.totalSupply` | 可直接接 |
| `circulatingSupply` | 可以 | `token_profiles.circulatingSupply` | 可直接接 |
| `marketCap` | 可以 | `token_profiles.marketCap` | 可直接接 |
| `fdv` | 可以 | `token_profiles.fdv` | 可直接接 |
| `holderCount` | 可以 | `token_profiles.tokenHolderCount` 或 `token_holder_snapshot` | 优先 `token_profiles` |
| `holderCountChange1d` | 不能直接 | `token_holder_snapshot` | 需要按日期统计 distinct holder 后再与前一天比较 |
| `top10_ratio` | 可衍生 | `token_holder_snapshot` | 取最新快照前 10 累加 / totalSupply |
| `top50_ratio` | 可衍生 | `token_holder_snapshot` | 同上 |
| `top100_ratio` | 可衍生 | `token_holder_snapshot` | 同上 |
| `others_ratio` | 可衍生 | `token_holder_snapshot` + `token_profiles.totalSupply` | `100 - top100_ratio` |
| `controlRate` | 暂时不行 | 无现成表 | 需要规则定义 |

### B. 控盘结构

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `explicitControl` | 不能直接 | 无 | 需要项目方/锁仓/部署者标签规则 |
| `implicitControl` | 不能直接 | 无 | 需要 cluster 识别 |
| `indirectControl` | 不能直接 | 无 | 需要做市商口径 |
| `controlBalanceTotal` | 不能直接 | 无 | 依赖上面三项 |
| `controlRate` | 不能直接 | 无 | 依赖上面三项 |
| `controlRate trend` | 不能直接 | 无 | 需要日级控盘宽表 |

### C. 持仓集中度

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `top10Balance` | 可以 | `token_holder_snapshot` | 最新快照前 10 累加 |
| `top50Balance` | 可以 | `token_holder_snapshot` | 最新快照前 50 累加 |
| `top100Balance` | 可以 | `token_holder_snapshot` | 最新快照前 100 累加 |
| `top10Ratio` | 可衍生 | `token_holder_snapshot` + `token_profiles.totalSupply` | 可算 |
| `top50Ratio` | 可衍生 | 同上 | 可算 |
| `top100Ratio` | 可衍生 | 同上 | 可算 |
| `holderTrend30d` | 可以 | `token_holder_snapshot` | 需要按日统计 holder count |

### D. 交易所流向

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `exchangeInflow` | 不能直接 | 无稳定现成表 | 需要交易所地址标签库 |
| `exchangeOutflow` | 不能直接 | 无稳定现成表 | 同上 |
| `exchangeNetFlow` | 不能直接 | 无稳定现成表 | 同上 |
| `netFlowRatio` | 不能直接 | 无稳定现成表 | 同上 |
| `netFlowStreak` | 不能直接 | 无稳定现成表 | 同上 |

### F. DEX 买卖结构

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `totalBuyVolume` | 可衍生 | `token_dex_action_raw` | 需要定义买入/卖出口径 |
| `totalSellVolume` | 可衍生 | `token_dex_action_raw` | 同上 |
| `buyAddressCount` | 可衍生 | `token_dex_action_raw` | 同上 |
| `sellAddressCount` | 可衍生 | `token_dex_action_raw` | 同上 |
| `top5BuyVolume` | 可衍生 | `token_dex_action_raw` | 同上 |
| `top5SellVolume` | 可衍生 | `token_dex_action_raw` | 同上 |
| `buy/sell trend` | 可衍生 | `token_dex_action_raw` | 需要按日聚合 |

### G. 大户行为

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `whaleAddressCount` | 可衍生 | `token_holder_snapshot` | 先定义 Top100 为大户 |
| `whaleTotalBalance` | 可衍生 | `token_holder_snapshot` | 取 Top100 累加 |
| `whaleTotalOutflow` | 可衍生 | `token_transfer_raw` | 需要筛 Top100 地址集后按日统计 |
| `whaleTotalInflow` | 可衍生 | `token_transfer_raw` | 同上 |
| `whaleNetOutflow` | 可衍生 | 同上 | 可算 |
| `whaleToExchange` | 目前不稳 | `token_transfer_raw` + 地址标签 | 依赖交易所标签库 |
| `whaleToNewAddress` | 可衍生 | `token_transfer_raw` + `token_holder_snapshot` | 需定义“新地址” |
| `whaleToDexRouter` | 可衍生 | `token_transfer_raw` + `wallet_info` | 标签覆盖不足时会漏 |
| `whaleOutRatio` | 可衍生 | 上述聚合结果 | 可算 |

### H. 新增 / 流失 Top10 地址

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `increaseRows` | 可以 | `token_holder_snapshot` | 比较最近两期快照 |
| `decreaseRows` | 可以 | `token_holder_snapshot` | 同上 |
| `firstSeen` | 可衍生 | `token_holder_snapshot` | 取 holder 最早出现日期 |
| `currentBalance` | 可以 | `token_holder_snapshot` | 最新快照值 |

### I. 重点标签地址净变化

| 字段 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `Team Wallet` | 暂时不稳 | `wallet_info` | 取决于标签是否完整 |
| `MM Known` | 暂时不稳 | `wallet_info` | 同上 |
| `MM Suspected` | 不能直接 | 无 | 缺可疑做市标签体系 |
| `Sybil Cluster` | 不能直接 | 无 | 当前无 cluster 表 |
| `Airdrop Farmer` | 不能直接 | 无 | 当前无对应标签 |

### J. 综合趋势

| 指标 | 能否接真实 | 来源 | 备注 |
|---|---|---|---|
| `controlRate` | 不能直接 | 无 | 依赖 B 模块 |
| `netFlowRatio` | 不能直接 | 无 | 依赖 D 模块 |
| `whaleNetOutflow` | 可衍生 | `token_transfer_raw` + `token_holder_snapshot` | 但需先完成 G 模块日聚合 |
| 综合多线图 | 不能直接 | 无统一宽表 | 等 B/D/F/G/I 至少完成一半再做 |

---

## 推荐真实接入顺序

### 第一批：可以尽快接

1. A. 代币基础信息
2. C. 持仓集中度
3. H. 新增 / 流失 Top10 地址

原因：
- 都能直接依赖 `token_profiles` 和 `token_holder_snapshot`
- 不需要过多地址标签体系
- 能较快把总览页从 mock 拉成半真实

### 第二批：需要轻聚合

1. F. DEX 买卖结构
2. G. 大户行为

原因：
- BigQuery 原始表够用
- 但要在 BFF 层做日聚合和口径定义

### 第三批：建议先不接

1. B. 控盘结构
2. D. 交易所流向
3. I. 重点标签地址净变化
4. J. 综合趋势

原因：
- 当前缺统一口径和稳定标签体系
- 现在硬接会把逻辑散到服务端，后面很难维护

---

## 一句话结论

当前 `/onchain` 总览页里：

- **能较稳接上的**：A / C / H
- **能接但要做衍生聚合的**：F / G
- **当前不建议接的**：B / D / I / J

最现实的推进方式是：
- 先把 `A + C + H` 换成真数据
- 再决定是否继续做 `F + G`
