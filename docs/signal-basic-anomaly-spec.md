# Signal 基础异动设计稿 v1

更新时间：
- 2026-04-23

适用范围：
- 本文档只定义 `Signal` 层的基础异动逻辑
- 不负责解释异动意味着什么
- 不负责给出交易判断
- 异动组合分析、策略解释、模型推理，统一放到 `Templab`

---

## 1. 目标

Signal 层的目标不是直接找结论，而是稳定地发现“发生了什么异常变化”。

Signal 在系统里的职责应当是：

- 定义可监控的客观异动维度
- 检测哪些标的触发了异动
- 把异动以统一结构展示出来
- 为 Templab 提供可组合、可解释的事实输入

Signal 不应该负责：

- 判断看涨/看跌
- 判断 alpha 机会大小
- 判断是否能买
- 判断是拉盘、出货还是洗盘

这些都交给后续策略层或模型层处理。

---

## 2. 设计原则

第一版建议遵循 5 个原则：

### 2.1 尽量客观

Signal 只描述事实，例如：

- `24h 价格上涨 12.4%`
- `12h OI 增长 67%`
- `7d 内存在解锁事件`
- `Top holder 24h 持仓下降 18%`

不要直接输出：

- “主力吸筹”
- “看涨信号”
- “危险信号”

### 2.2 尽量单维度

每条 signal 尽量只对应一类异动。

例如：

- `price_change_24h_gt_10pct`
- `oi_change_12h_gt_50pct`
- `unlock_within_7d`

而不要在 signal 层定义：

- “价格涨 + OI 涨 + 深度变厚 = 做多机会”

这种组合逻辑应该留给 Templab。

### 2.3 尽量可量化

每条 signal 都要能明确回答：

- 监控的是哪个指标
- 观察窗口是什么
- 阈值是什么
- 当前值是多少
- 相比基线变化了多少

### 2.4 尽量统一结构

所有 signal 建议统一输出一套结构，方便前端展示和 Templab 消费。

### 2.5 先少后多

第一版优先做一组最常用、最稳定、最容易解释的异动。
不要一开始覆盖所有想法。

---

## 3. 推荐的 Signal 分类

基于当前可获得的数据，第一版建议分成 6 大类：

1. 价格异动
2. 成交量异动
3. OI / Funding 异动
4. 深度 / 流动性异动
5. 事件异动
6. 链上异动

---

## 4. 各类 Signal 定义建议

以下定义是“信号模板方向”，不是最终阈值。
阈值后续可以单独再确认。

## 4.1 价格异动

价格是最基础的异动来源。

建议关注的维度：

- `1h price change`
- `4h price change`
- `12h price change`
- `24h price change`
- `3d cumulative price change`
- `连续 N 天上涨 / 下跌`
- `价格创 N 日新高 / 新低`
- `价格偏离近 N 日均值`

推荐信号模板：

- `price_change_1h_gt_x`
- `price_change_4h_gt_x`
- `price_change_12h_gt_x`
- `price_change_24h_gt_x`
- `price_streak_up_3d`
- `price_streak_down_3d`
- `price_breakout_7d_high`
- `price_breakdown_7d_low`

示例：

- 连续 3 天日涨幅都大于 3%
- 24h 涨幅大于 10%

说明：

- 价格 signal 最适合做“触发入口”
- 不适合单独被解释成 alpha 结论

## 4.2 成交量异动

成交量是价格异动的重要确认维度，也可以独立成为 signal。

建议关注的维度：

- `1h / 4h / 12h / 24h volume`
- `相对近 7d / 30d 平均成交量的放大倍数`
- `连续多周期放量`
- `量价是否同步`

推荐信号模板：

- `volume_change_4h_gt_x`
- `volume_change_24h_gt_x`
- `volume_24h_vs_7d_avg_gt_2x`
- `volume_4h_vs_7d_avg_gt_1_5x`
- `volume_streak_up_3bars`

说明：

- 成交量 signal 本身有很高的信息价值
- 很适合和价格、深度、OI 在 Templab 里做组合

## 4.3 OI / Funding 异动

OI 和 funding 对山寨币的情绪变化很敏感，适合做基础异动监控。

建议关注的维度：

- `oi_change_1h`
- `oi_change_4h`
- `oi_change_12h`
- `oi_change_24h`
- `funding_rate`
- `funding_rate_change`
- `oi 和 funding 的背离`

推荐信号模板：

- `oi_change_4h_gt_x`
- `oi_change_12h_gt_50pct`
- `oi_change_24h_gt_x`
- `funding_rate_gt_pos_threshold`
- `funding_rate_lt_neg_threshold`
- `oi_up_funding_flat`
- `oi_up_funding_extreme`

示例：

- 12h OI 增长超过 50%
- funding rate 低于负阈值

说明：

- 这类 signal 不在 signal 层判断多空含义
- 只陈述衍生品热度发生了什么变化

## 4.4 深度 / 流动性异动

深度对山寨币非常重要，适合做客观流动性监控。

建议关注的维度：

- `buy depth change`
- `sell depth change`
- `bid / ask ratio`
- `spread`
- `深度相对近几日均值变化`
- `盘口突然变薄`
- `盘口修复`

推荐信号模板：

- `buy_depth_12h_gt_x`
- `buy_depth_24h_gt_x`
- `sell_depth_24h_drop_x`
- `bid_ask_ratio_gt_x`
- `bid_ask_ratio_lt_x`
- `spread_widened`
- `depth_drop_1d`
- `depth_recovery_1d`

说明：

- 深度 signal 非常适合作为 Templab 的过滤条件
- 例如用于区分“有价格动作但没流动性”与“可交易异动”

## 4.5 事件异动

事件是离散型 signal，不是连续指标，但对于山寨币非常重要。

建议关注的维度：

- `解锁事件`
- `上线事件`
- `活动开始 / 结束`
- `公告密集发布`
- `新增交易所交易对`
- `launchpool / alpha / boost`

推荐信号模板：

- `unlock_within_3d`
- `unlock_within_7d`
- `unlock_pct_gt_x`
- `new_listing_detected`
- `new_activity_detected`
- `campaign_start`
- `campaign_end`
- `announcement_spike_24h`

说明：

- 事件 signal 只表示“某类事件发生或临近”
- 不在 signal 层判断利好还是利空

## 4.6 链上异动

链上异动更适合做事实层输入，而不是直接得出交易结论。

基于当前已有数据，建议先关注这些方向：

- 大额流入交易所
- 大额流出交易所
- 交易所净流入 / 净流出
- Top holder 变化
- 新地址进入前排
- 地址退出前排
- holder 数量变化
- 资金流扩散层级变化
- 标签地址异动

推荐信号模板：

- `exchange_inflow_large`
- `exchange_outflow_large`
- `exchange_netflow_spike`
- `top_holder_balance_change_gt_x`
- `new_top_holder_entered`
- `top_holder_exited`
- `holder_count_change_gt_x`
- `fund_flow_layer1_spike`
- `fund_flow_layer2_spike`

说明：

- 如果当前交易所标签地址和净流入聚合还不稳定，这部分应先作为候选
- holder 和扩散类 signal 目前更容易先落地

---

## 5. 第一版建议优先做的 Signal

为了保证第一版简洁、稳定，建议优先做下面这一组：

### 5.1 价格

- `price_change_1h_gt_5pct`
- `price_change_24h_gt_10pct`
- `price_streak_up_3d`
- `price_streak_down_3d`

### 5.2 成交量

- `volume_24h_vs_7d_avg_gt_2x`
- `volume_4h_vs_7d_avg_gt_1_5x`

### 5.3 OI / Funding

- `oi_change_12h_gt_50pct`
- `oi_change_24h_gt_100pct`
- `funding_rate_gt_pos_threshold`
- `funding_rate_lt_neg_threshold`

### 5.4 深度

- `buy_depth_24h_gt_50pct`
- `sell_depth_24h_drop_30pct`
- `bid_ask_ratio_gt_1_5`

### 5.5 事件

- `unlock_within_7d`
- `unlock_pct_gt_2pct`
- `new_listing_detected`

### 5.6 链上

- `top_holder_balance_change_gt_x`
- `new_top_holder_entered`
- `top_holder_exited`
- `large_exchange_inflow`
- `large_exchange_outflow`

说明：

- 第一版不要求全部同时落地
- 可以按数据成熟度分批做

---

## 6. Signal 统一输出结构建议

每条 signal 建议统一具备以下字段：

- `signal_type`
- `symbol`
- `category`
- `direction`
- `window`
- `current_value`
- `baseline_value`
- `threshold_value`
- `change_pct`
- `severity`
- `triggered_at`
- `source`
- `summary`

字段说明：

- `signal_type`
  例如 `oi_change_12h_gt_50pct`

- `category`
  例如 `price / volume / oi_funding / depth / event / onchain`

- `direction`
  例如 `up / down / upcoming / in / out`

- `window`
  例如 `1h / 4h / 12h / 24h / 3d / 7d`

- `current_value`
  当前观测值

- `baseline_value`
  对比基线值

- `threshold_value`
  触发阈值

- `change_pct`
  变化幅度

- `severity`
  建议只表达异动强度，如 `low / medium / high`

- `source`
  数据来源

- `summary`
  一句话事实描述，不带结论

示例：

- `signal_type`: `oi_change_12h_gt_50pct`
- `category`: `oi_funding`
- `direction`: `up`
- `window`: `12h`
- `current_value`: `18200000`
- `baseline_value`: `10900000`
- `threshold_value`: `50%`
- `change_pct`: `67.0%`
- `severity`: `high`
- `source`: `oi_funding`
- `summary`: `12h OI 增长 67%，超过 50% 阈值`

---

## 7. 展示原则

Signal 页面建议展示“异动事实”，不要展示“解释结论”。

每张 signal 卡片建议固定展示：

- 信号名称
- Symbol
- 当前值
- 阈值
- 变化幅度
- 时间窗
- 触发时间
- 数据来源

示例文案：

- `12h OI 异动`
- `当前 +67.0%`
- `阈值 +50%`
- `时间窗 12h`
- `来源 oi_funding`

不建议在 Signal 页面直接出现：

- “偏多”
- “偏空”
- “拉盘”
- “出货”
- “alpha 机会”

这些解释统一交给 Templab。

---

## 8. Signal 状态建议

即使只是基础异动，仍然建议保留最简单的状态流转。

推荐状态：

- `new`
- `active`
- `muted`
- `expired`

含义：

- `new`
  新触发，尚未处理

- `active`
  当前有效，继续展示

- `muted`
  暂时忽略，不再提醒

- `expired`
  超过观察时效，自动失效

说明：

- 第一版不建议把状态设计得太复杂
- 等后续和 Templab 联动更深时，再扩展 `reviewed / linked / resolved`

---

## 9. 与 Templab 的边界

Signal 和 Templab 的职责边界建议明确如下：

### Signal 负责

- 监控客观指标
- 输出单点异动
- 提供统一结构化数据

### Templab 负责

- 解释异动意味着什么
- 组合多条 signal
- 做策略判断
- 做模型推理
- 给出机会评分或风险判断

示例：

- Signal 输出：
  - `price_streak_up_3d`
  - `oi_change_12h_gt_50pct`
  - `unlock_within_7d`

- Templab 才去判断：
  - 这三条一起出现意味着什么
  - 是预期差、逼空、兑现前拉升，还是风险累积

---

## 10. 当前建议结论

第一版 Signal 最合适的定位是：

**基础异动事实层**

而不是：

**交易结论层**

推荐路线：

1. 先定义一组客观、单维度、可量化的基础 signal
2. 先把 signal 的展示和触发逻辑做稳定
3. 再让 Templab 去消费这些 signal 做组合分析
4. 最后再考虑更复杂的“机会评分型 signal”

这样做的好处是：

- Signal 层更稳定
- 噪音更可控
- 后续扩展更容易
- 复盘和策略优化更清楚
