# Signal Type 清单与字段映射 v1

更新时间：
- 2026-04-23

适用范围：
- 本文档是 `Signal 基础异动设计稿 v1` 的下一层
- 目标是把第一版候选 signal 变成可执行的字段映射清单
- 先定义 signal type 和字段来源
- 暂不设计数据库表结构

关联文档：
- [signal-basic-anomaly-spec.md](/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/signal-basic-anomaly-spec.md)
- [bigquery-onchain-data-summary.md](/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/bigquery-onchain-data-summary.md)

---

## 1. 使用原则

每个 signal type 都尽量回答这 4 个问题：

- 监控什么维度
- 观察窗口是什么
- 触发时需要哪些字段
- 当前这些字段是否已经能稳定拿到

Signal type 本身只定义“事实异动”，不定义结论。

---

## 2. 第一版推荐优先级

建议先按优先级分 3 档：

### P0

最适合第一版先做，字段最明确，解释成本最低。

- 价格异动
- 成交量异动
- OI / funding 异动
- 解锁事件
- 上线事件

### P1

适合第二批接入，价值高，但需要趋势或对比逻辑。

- 深度异动
- holder 异动
- 新 Top holder 进入

### P2

先保留候选，等数据口径更稳定后接。

- 交易所大额链上流入 / 流出
- 交易所净流入 / 净流出
- 资金流扩散层级异常

---

## 3. Signal Type 清单

## 3.1 价格类

### 1. `price_change_1h_gt_x`

- 类别：`price`
- 含义：1 小时价格涨幅超过阈值
- 建议优先级：`P0`

需要字段：
- 当前价格
- 1h 前价格
- 变化幅度

当前状态：
- 代码里已明确拿到 `currentPrice`
- 但没有现成 `1h` 价格快照接口
- 需要基于 `kline/ohlcv` 或价格时序补一层计算

建议来源：
- 优先使用价格时序表 / kline 数据
- 不建议只靠 `priceChange24h / priceChange7d`

备注：
- 这是典型的“需要时序基础，但逻辑简单”的信号

### 2. `price_change_24h_gt_x`

- 类别：`price`
- 含义：24 小时价格涨幅超过阈值
- 建议优先级：`P0`

需要字段：
- `token_profiles.currentPrice`
- `token_profiles.priceChange24h`

当前来源：
- `getTokenProfileBySymbol`

当前字段：
- `currentPrice`
- `priceChange24h`

结论：
- 可以直接做

### 3. `price_streak_up_3d`

- 类别：`price`
- 含义：连续 3 天上涨
- 建议优先级：`P0`

需要字段：
- 最近 3 个日级收盘价或日涨跌幅

当前状态：
- 目前代码里没有直接暴露“连续 3 天涨跌”字段
- 需要基于价格时序数据计算

建议来源：
- `ohlcv` / `kline`

备注：
- 逻辑清楚，但依赖日级时序

### 4. `price_streak_down_3d`

- 类别：`price`
- 含义：连续 3 天下跌
- 建议优先级：`P0`

字段要求：
- 同 `price_streak_up_3d`

当前状态：
- 需要时序计算

---

## 3.2 成交量类

### 5. `volume_24h_vs_7d_avg_gt_2x`

- 类别：`volume`
- 含义：24h 成交量超过近 7 天平均的 2 倍
- 建议优先级：`P0`

需要字段：
- 当前 `volume24h`
- 近 7 天平均成交量

当前来源：
- 已有 `token_profiles.volume24h`
- 近 7 天平均量需要时序数据计算

结论：
- 当前值已有
- 基线值需要补一层计算

### 6. `volume_4h_vs_7d_avg_gt_1_5x`

- 类别：`volume`
- 含义：4 小时成交量相对近 7 天均值放大
- 建议优先级：`P0`

需要字段：
- 4h volume
- 近 7 天同口径平均量

当前状态：
- 需要时序成交量数据支持

备注：
- 如果短期内没有细粒度时序，不建议先做

---

## 3.3 OI / Funding 类

### 7. `oi_change_12h_gt_50pct`

- 类别：`oi_funding`
- 含义：12 小时 OI 增长超过 50%
- 建议优先级：`P0`

需要字段：
- 当前 OI
- 12h 前 OI
- 变化比例

当前来源：
- `getTokenHoldersViewBySymbol` 返回 perps 级别 `series.totalOpenInterest`
- `getExchangeHoldersViewBySymbol` 返回单交易所 `series.openInterest`
- `getTokenDepthViewBySymbol` / `exchange_pairs` 也有 `openInterest`

结论：
- 可以做
- 推荐先按“聚合 OI”做 token 级 signal

### 8. `oi_change_24h_gt_100pct`

- 类别：`oi_funding`
- 含义：24 小时 OI 增长超过 100%
- 建议优先级：`P0`

字段来源：
- 同 `oi_change_12h_gt_50pct`

结论：
- 可以做

### 9. `funding_rate_gt_pos_threshold`

- 类别：`oi_funding`
- 含义：资金费率高于正阈值
- 建议优先级：`P0`

需要字段：
- 当前 `fundingRate`

当前来源：
- `getTokenHoldersViewBySymbol.series.fundingRate`
- `getExchangeHoldersViewBySymbol.series.fundingRate`
- `getTokenDepthViewBySymbol.items[].fundingRate`

结论：
- 可以直接做

### 10. `funding_rate_lt_neg_threshold`

- 类别：`oi_funding`
- 含义：资金费率低于负阈值
- 建议优先级：`P0`

字段来源：
- 同上

结论：
- 可以直接做

---

## 3.4 深度类

### 11. `buy_depth_24h_gt_50pct`

- 类别：`depth`
- 含义：24 小时买盘深度增长超过 50%
- 建议优先级：`P1`

需要字段：
- 当前 `totalDepthBuy2`
- 24h 前或前一基线周期 `totalDepthBuy2`

当前来源：
- `getTokenDepthTrendBySymbol.summary.totalDepthBuy2`
- `getTokenDepthTrendBySymbol.points[].totalDepthBuy2`
- `getTokenDepthViewBySymbol.items[].depthBuy2`

结论：
- 可以做
- 更推荐用 `token_trade_depth_daily` 聚合趋势而不是单快照

### 12. `sell_depth_24h_drop_30pct`

- 类别：`depth`
- 含义：24 小时卖盘深度下降超过 30%
- 建议优先级：`P1`

需要字段：
- 当前 `totalDepthSell2`
- 前一基线周期 `totalDepthSell2`

当前来源：
- 同 `buy_depth_24h_gt_50pct`

结论：
- 可以做

### 13. `bid_ask_ratio_gt_1_5`

- 类别：`depth`
- 含义：买卖盘比值高于阈值
- 建议优先级：`P1`

需要字段：
- `depthBuy2`
- `depthSell2`

当前来源：
- `getTokenDepthViewBySymbol.items[].depthBuy2`
- `getTokenDepthViewBySymbol.items[].depthSell2`

结论：
- 可以直接做
- 第一版建议先用聚合口径，不要分太多交易所维度

---

## 3.5 事件类

### 14. `unlock_within_7d`

- 类别：`event`
- 含义：7 天内存在解锁事件
- 建议优先级：`P0`

需要字段：
- `unlockDate`
- 当前时间

当前来源：
- `getTokenUnlockViewBySymbol.rows[].unlockDate`

结论：
- 可以直接做

### 15. `unlock_pct_gt_2pct`

- 类别：`event`
- 含义：某期解锁占总供应量比例超过阈值
- 建议优先级：`P0`

需要字段：
- `monthlyReleaseRatio`

当前来源：
- `getTokenUnlockViewBySymbol.rows[].monthlyReleaseRatio`

结论：
- 可以直接做

### 16. `new_listing_detected`

- 类别：`event`
- 含义：检测到新的上线事件
- 建议优先级：`P0`

需要字段：
- `listingTime`
- 交易所
- 市场类型

当前来源：
- `getTokenListingViewBySymbol.items[]`
- `searchListingAnnouncements`

关键字段：
- `eventType`
- `exchangeName`
- `marketType`
- `date`

结论：
- 可以直接做

### 17. `new_activity_detected`

- 类别：`event`
- 含义：检测到新的交易所活动
- 建议优先级：`P0`

需要字段：
- 活动时间
- 活动类型
- 奖励信息

当前来源：
- `getTokenListingViewBySymbol.items[]`

关键字段：
- `eventType = activity`
- `date`
- `rewardToken`
- `rewardAmount`

结论：
- 可以直接做

---

## 3.6 Holder / 链上类

### 18. `top_holder_balance_change_gt_x`

- 类别：`onchain`
- 含义：Top holder 持仓变化超过阈值
- 建议优先级：`P1`

需要字段：
- `balance`
- `balanceChange24h` / `balanceChange7d`
- `rank`

当前来源：
- `onchain.getHolders.items[]`

关键字段：
- `address`
- `balance`
- `rank`
- `balanceChange24h`
- `balanceChange7d`

结论：
- 可以做
- 第一版建议先聚焦 `Top 10 / Top 20`

### 19. `new_top_holder_entered`

- 类别：`onchain`
- 含义：有新地址进入前排 holder
- 建议优先级：`P1`

需要字段：
- `rank`
- `isNew`

当前来源：
- `onchain.getHolders.items[]`

关键字段：
- `rank`
- `isNew`
- `label`
- `kind`

结论：
- 可以直接做

### 20. `top_holder_exited`

- 类别：`onchain`
- 含义：有地址退出前排 holder
- 建议优先级：`P1`

需要字段：
- `rank`
- 历史前排地址集合
- 当前前排地址集合

当前来源：
- `onchain.getHolders.items[]`

关键字段：
- `address`
- `rank`
- `label`
- `kind`

当前状态：
- 当前快照可拿到
- 需要增加上一期前排集合对比

结论：
- 可以做
- 建议和 `new_top_holder_entered` 成对实现

### 21. `holder_count_change_gt_x`

- 类别：`onchain`
- 含义：holder 总数变化超过阈值
- 建议优先级：`P1`

需要字段：
- 最新 holder 总数
- 历史 holder 总数

当前来源：
- `token_profiles.tokenHolderCount`
- BigQuery `token_holder_snapshot`

当前状态：
- 最新值好拿
- 历史趋势在当前接口里还没直接暴露

结论：
- 可做，但需要再补一层历史聚合

### 22. `large_exchange_inflow`

- 类别：`onchain`
- 含义：出现大额流入交易所
- 建议优先级：`P2`

需要字段：
- 转账地址标签
- 交易所地址识别
- 转账金额

当前来源：
- `token_transfer_raw`
- `wallet_info`

当前状态：
- 有原始转账和标签表
- 但“交易所流入”口径当前还没有稳定聚合层

结论：
- 先作为候选

### 23. `large_exchange_outflow`

- 类别：`onchain`
- 含义：出现大额流出交易所
- 建议优先级：`P2`

字段状态：
- 同 `large_exchange_inflow`

结论：
- 先作为候选

### 24. `exchange_netflow_spike`

- 类别：`onchain`
- 含义：交易所净流入 / 净流出异常
- 建议优先级：`P2`

需要字段：
- inflow
- outflow
- netflow

当前状态：
- 目前代码里没有现成净流入聚合

结论：
- 暂不建议第一版实现

### 25. `fund_flow_layer1_spike`

- 类别：`onchain`
- 含义：资金扩散第一层出现异常集中
- 建议优先级：`P2`

需要字段：
- `onchain.getFundFlow.nodes`
- `onchain.getFundFlow.links`
- `onchain.getFundFlow.summaries`

当前状态：
- 原始图数据能拿到
- 但“什么叫 spike”还需要二次统计口径

结论：
- 可做探索型 signal
- 不建议第一版主推

---

## 4. 字段来源总表

## 4.1 MySQL / 市场数据侧

### `getTokenProfileBySymbol`

适合支持：
- `price_change_24h_gt_x`
- 部分成交量 signal

关键字段：
- `currentPrice`
- `volume24h`
- `priceChange24h`
- `priceChange7d`
- `tokenHolderCount`

### `getTokenUnlockViewBySymbol`

适合支持：
- `unlock_within_3d`
- `unlock_within_7d`
- `unlock_pct_gt_x`

关键字段：
- `rows[].unlockDate`
- `rows[].monthlyTotalRelease`
- `rows[].monthlyReleaseRatio`

### `getTokenListingViewBySymbol`

适合支持：
- `new_listing_detected`
- `new_activity_detected`

关键字段：
- `items[].eventType`
- `items[].date`
- `items[].exchangeName`
- `items[].marketType`
- `items[].rewardToken`
- `items[].rewardAmount`

### `getTokenDepthViewBySymbol`

适合支持：
- `bid_ask_ratio_gt_x`
- 部分深度和 funding/OI 快照 signal

关键字段：
- `items[].volume24h`
- `items[].depthBuy2`
- `items[].depthSell2`
- `items[].fundingRate`
- `items[].openInterest`

### `getTokenDepthTrendBySymbol`

适合支持：
- `buy_depth_24h_gt_x`
- `sell_depth_24h_drop_x`

关键字段：
- `summary.totalDepthBuy2`
- `summary.totalDepthSell2`
- `points[].snapshotDate`
- `points[].totalDepthBuy2`
- `points[].totalDepthSell2`
- `points[].totalVolume`

### `getTokenHoldersViewBySymbol`

适合支持：
- `oi_change_12h_gt_50pct`
- `oi_change_24h_gt_x`
- `funding_rate_gt_pos_threshold`
- `funding_rate_lt_neg_threshold`

关键字段：
- `series[].snapshotDate`
- `series[].totalOpenInterest`
- `series[].fundingRate`

## 4.2 BigQuery / 链上侧

### `onchain.getHolders`

适合支持：
- `top_holder_balance_change_gt_x`
- `new_top_holder_entered`
- `top_holder_exited`

关键字段：
- `snapshotDate`
- `items[].address`
- `items[].label`
- `items[].kind`
- `items[].balance`
- `items[].rank`
- `items[].balanceChange24h`
- `items[].balanceChange7d`
- `items[].isNew`

### `onchain.getFundFlow`

适合支持：
- `fund_flow_layer1_spike`
- `fund_flow_layer2_spike`

关键字段：
- `totalAmount`
- `nodes[].layer`
- `nodes[].amount`
- `nodes[].label`
- `nodes[].kind`
- `links[].amount`
- `summaries[].layer`
- `summaries[].count`
- `summaries[].totalAmount`

### `onchain.listTokens`

适合支持：
- 链上数据覆盖范围检查

关键字段：
- `transferCount`
- `holderCount`
- `dexActionCount`

---

## 5. 第一版落地建议

如果目标是尽快把 Signal 跑起来，建议第一版只做这些：

### 5.1 第一批直接可做

- `price_change_24h_gt_x`
- `oi_change_12h_gt_50pct`
- `oi_change_24h_gt_x`
- `funding_rate_gt_pos_threshold`
- `funding_rate_lt_neg_threshold`
- `unlock_within_7d`
- `unlock_pct_gt_x`
- `new_listing_detected`
- `new_activity_detected`
- `bid_ask_ratio_gt_x`
- `top_holder_balance_change_gt_x`
- `new_top_holder_entered`
- `top_holder_exited`

### 5.2 第二批适合补上

- `buy_depth_24h_gt_x`
- `sell_depth_24h_drop_x`
- `volume_24h_vs_7d_avg_gt_2x`
- `top_holder_exited`
- `holder_count_change_gt_x`

### 5.3 暂缓

- `large_exchange_inflow`
- `large_exchange_outflow`
- `exchange_netflow_spike`
- `fund_flow_layer1_spike`

原因：
- 不是不能做
- 而是当前口径还不够稳定，不适合第一版做成主 signal

---

## 6. 当前建议结论

当前数据基础下，最适合第一版落地的 signal 核心是：

- 市场异动
  - 价格
  - 成交量
  - OI / funding
  - 深度

- 事件异动
  - 解锁
  - 上线
  - 活动

- 轻量链上异动
  - top holder 变化
  - 新 holder 进入前排
  - 地址退出前排

而交易所链上流入流出、净流入、复杂资金扩散类 signal，建议放到后续版本。
