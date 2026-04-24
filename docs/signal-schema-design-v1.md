# Signal 表结构设计稿 v1

更新时间：
- 2026-04-23

适用范围：
- 本文档用于定义 Signal 模块第一版的数据结构
- 目标是支撑：
  - 定义信号
  - 触发信号
  - 展示信号
  - 处理信号
- 暂不包含 Templab 的组合分析结果表

关联文档：
- [signal-basic-anomaly-spec.md](/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/signal-basic-anomaly-spec.md)
- [signal-type-field-mapping-v1.md](/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/signal-type-field-mapping-v1.md)

---

## 1. 设计目标

第一版 schema 只需要解决 4 个问题：

1. 哪些 signal type 被定义了
2. 某个 token 在某个时间是否触发了某个 signal
3. 这条 signal 当时的数值证据是什么
4. 这条 signal 当前处于什么处理状态

第一版不追求：

- 复杂模板编排
- 多级审批流
- 策略输出持久化
- 大量历史审计字段

先把基础 signal 事实层建稳更重要。

---

## 2. 推荐表结构

第一版建议先建 4 张核心表：

1. `signal_templates`
2. `signal_events`
3. `signal_event_metrics`
4. `signal_event_actions`

这 4 张已经足够支撑 v1。

---

## 3. 各表职责

## 3.1 `signal_templates`

用途：
- 定义有哪些 signal type
- 定义 signal 的基础元信息

建议字段：

- `id`
- `signal_type`
- `name`
- `category`
- `description`
- `direction`
- `default_window`
- `default_threshold_text`
- `severity_rule`
- `source`
- `is_enabled`
- `priority`
- `created_at`
- `updated_at`

字段说明：

- `signal_type`
  唯一标识，例如 `oi_change_12h_gt_50pct`

- `category`
  如 `price / volume / oi_funding / depth / event / onchain`

- `direction`
  如 `up / down / in / out / upcoming / event`

- `default_window`
  如 `1h / 4h / 12h / 24h / 7d`

- `default_threshold_text`
  文本形式记录默认阈值，便于前端展示

- `severity_rule`
  可先简单存文本，后续再决定是否结构化

- `source`
  当前信号的主要数据来源

- `is_enabled`
  是否启用

- `priority`
  仅表示工程优先级或展示顺序，不表示交易含义

说明：
- 第一版不建议把模板规则拆得太碎
- 如果后面需要可配置规则引擎，再增加 `signal_template_rules`

---

## 3.2 `signal_events`

用途：
- 存储某条 signal 的实际触发记录
- 是 Signal 看板的核心表

建议字段：

- `id`
- `signal_type`
- `token_id`
- `symbol`
- `title`
- `summary`
- `category`
- `direction`
- `window`
- `severity`
- `status`
- `source`
- `triggered_at`
- `expires_at`
- `dedupe_key`
- `latest_metric_value`
- `baseline_value`
- `threshold_value`
- `change_pct`
- `payload_json`
- `created_at`
- `updated_at`

字段说明：

- `signal_type`
  对应 `signal_templates.signal_type`

- `token_id`
  关联 token

- `symbol`
  冗余保存，方便列表查询

- `title`
  用于 UI 展示，例如 `12h OI 异动`

- `summary`
  一句话事实描述，例如 `12h OI 增长 67%，超过 50% 阈值`

- `severity`
  只表示异动强弱，例如 `low / medium / high`

- `status`
  推荐枚举：
  - `new`
  - `active`
  - `muted`
  - `expired`

- `triggered_at`
  首次触发时间

- `expires_at`
  过期时间，用于自动失效

- `dedupe_key`
  去重键，防止同一 token 同一窗口内重复刷 signal

- `latest_metric_value`
  当前值

- `baseline_value`
  对比基线值

- `threshold_value`
  触发阈值

- `change_pct`
  变化比例

- `payload_json`
  保存 UI 展示所需补充信息，第一版允许灵活扩展

说明：
- `signal_events` 应该是“可展示对象”
- 前端列表优先查这张表，而不是临时实时计算

---

## 3.3 `signal_event_metrics`

用途：
- 存储 signal 触发时的结构化数值证据
- 避免所有内容都塞到 `payload_json`

建议字段：

- `id`
- `signal_event_id`
- `metric_key`
- `metric_label`
- `metric_value`
- `metric_unit`
- `baseline_value`
- `threshold_value`
- `sort_order`
- `created_at`

字段说明：

- `metric_key`
  如：
  - `price_change_24h`
  - `open_interest_change_12h`
  - `funding_rate`
  - `monthly_release_ratio`
  - `holder_balance_change_24h`

- `metric_label`
  用于前端直接展示

- `metric_value`
  当前值

- `metric_unit`
  如 `% / usd / count / ratio`

说明：
- 一条 signal 可挂多条 metric
- 例如：
  - `oi_change_12h_gt_50pct`
  - 附带 `current_oi`
  - `previous_oi`
  - `change_pct`

这样前端卡片和详情页会更清楚。

---

## 3.4 `signal_event_actions`

用途：
- 记录用户对 signal 的处理动作
- 支撑“处理信号”流程

建议字段：

- `id`
- `signal_event_id`
- `action_type`
- `from_status`
- `to_status`
- `operator_id`
- `note`
- `created_at`

建议动作类型：

- `mark_active`
- `mute`
- `unmute`
- `expire`
- `reopen`

说明：
- 第一版这张表很轻就够了
- 主要用于留操作痕迹，便于后续复盘

---

## 4. 状态流转建议

第一版建议保持简单：

- `new`
  新触发，尚未处理

- `active`
  继续展示

- `muted`
  已忽略，不再提醒

- `expired`
  自动或手动失效

推荐流转：

- `new -> active`
- `new -> muted`
- `active -> muted`
- `active -> expired`
- `muted -> active`

---

## 5. 去重与更新策略

Signal 很容易出现重复刷新的问题，因此建议从第一版就考虑去重。

## 5.1 去重键建议

推荐 `dedupe_key` 由以下信息拼成：

- `signal_type`
- `token_id`
- `window`
- 一个时间桶

例如：

- `oi_change_12h_gt_50pct:1234:12h:2026-04-23-08`

这样同一 token 在同一时间窗里不会反复生成大量重复 signal。

## 5.2 更新策略建议

如果同一 `dedupe_key` 再次命中：

- 更新 `latest_metric_value`
- 更新 `change_pct`
- 更新 `summary`
- 更新 `updated_at`

而不是新插入一条 event。

如果跨了新的时间桶，再新建一条 event。

---

## 6. 各业务环节与表的对应关系

## 6.1 定义信号

使用表：
- `signal_templates`

职责：
- 定义 signal type
- 维护 signal 元信息

## 6.2 触发信号

使用表：
- `signal_events`
- `signal_event_metrics`

职责：
- 记录某条 signal 是否被触发
- 记录触发时的数值证据

## 6.3 展示信号

使用表：
- `signal_events`
- `signal_event_metrics`

职责：
- 看板查询
- 详情页查询
- 按状态、类型、时间筛选

## 6.4 处理信号

使用表：
- `signal_events`
- `signal_event_actions`

职责：
- 更新状态
- 记录操作动作

---

## 7. 第一版建议索引

建议优先考虑以下索引：

### `signal_templates`

- 唯一索引：`signal_type`
- 普通索引：`category`
- 普通索引：`is_enabled`

### `signal_events`

- 普通索引：`symbol`
- 普通索引：`token_id`
- 普通索引：`signal_type`
- 普通索引：`status`
- 普通索引：`triggered_at`
- 唯一索引：`dedupe_key`
- 组合索引：`status + triggered_at`
- 组合索引：`signal_type + triggered_at`

### `signal_event_metrics`

- 普通索引：`signal_event_id`
- 普通索引：`metric_key`

### `signal_event_actions`

- 普通索引：`signal_event_id`
- 普通索引：`created_at`

---

## 8. 第一版不建议先做的表

以下表先不要急着建：

- `signal_template_rules`
- `signal_groups`
- `signal_strategy_links`
- `signal_model_outputs`
- `signal_backtest_stats`

原因：
- 这些更偏规则引擎或策略层
- 现在先把基础异动事实层建稳更重要

---

## 9. 推荐的最小可用方案

如果想尽快落地，我建议最小可用版本是：

### 必须有

- `signal_templates`
- `signal_events`

### 最好有

- `signal_event_metrics`

### 可以第二步再加

- `signal_event_actions`

如果只建前两张表，也能先跑起来；
但如果想让前端详情页和后续复盘更顺，`signal_event_metrics` 很值得一起上。

---

## 10. 当前建议结论

第一版 Signal schema 最核心的思想是：

- `templates` 管定义
- `events` 管触发结果
- `metrics` 管触发证据
- `actions` 管处理动作

这套结构已经足够支撑你现在确认过的业务链路：

- 定义信号
- 触发信号
- 展示信号
- 处理信号

并且不会过早把系统复杂度拉高。
