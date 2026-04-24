# Signal 模板默认值草案 v1

更新时间：
- 2026-04-23

用途：
- 记录第一版 signal template 的默认阈值与展示文案
- 这些值用于初始化 `signalTemplates`
- 后续如果你要调整，只需要更新模板，不需要改表结构

---

## 已采用的默认值

### 价格类

- `price_change_24h_gt_10pct`
  - 窗口：`24h`
  - 阈值：`> 10%`
  - 方向：`up`

- `price_streak_up_3d`
  - 窗口：`3d`
  - 阈值：`连续 3 天上涨`
  - 方向：`up`

- `price_streak_down_3d`
  - 窗口：`3d`
  - 阈值：`连续 3 天下跌`
  - 方向：`down`

### 成交量类

- `volume_24h_vs_7d_avg_gt_2x`
  - 窗口：`24h`
  - 阈值：`> 7d avg 2x`
  - 方向：`up`

### OI / Funding 类

- `oi_change_12h_gt_50pct`
  - 窗口：`12h`
  - 阈值：`> 50%`
  - 方向：`up`

- `oi_change_24h_gt_100pct`
  - 窗口：`24h`
  - 阈值：`> 100%`
  - 方向：`up`

- `funding_rate_gt_pos_threshold`
  - 窗口：`now`
  - 阈值：`> 0.05`
  - 方向：`up`

- `funding_rate_lt_neg_threshold`
  - 窗口：`now`
  - 阈值：`< -0.05`
  - 方向：`down`

### 深度类

- `bid_ask_ratio_gt_1_5`
  - 窗口：`now`
  - 阈值：`> 1.5`
  - 方向：`up`

- `buy_depth_24h_gt_50pct`
  - 窗口：`24h`
  - 阈值：`> 50%`
  - 方向：`up`

- `sell_depth_24h_drop_30pct`
  - 窗口：`24h`
  - 阈值：`< -30%`
  - 方向：`down`

### 事件类

- `unlock_within_7d`
  - 窗口：`7d`
  - 阈值：`距离解锁 <= 7d`
  - 方向：`upcoming`

- `unlock_pct_gt_2pct`
  - 窗口：`event`
  - 阈值：`> 2% total supply`
  - 方向：`upcoming`

- `new_listing_detected`
  - 窗口：`event`
  - 阈值：`检测到新上线`
  - 方向：`event`

- `new_activity_detected`
  - 窗口：`event`
  - 阈值：`检测到新活动`
  - 方向：`event`

### 链上类

- `top_holder_balance_change_gt_x`
  - 窗口：`24h`
  - 阈值：`Top holder balance change > 10%`
  - 方向：`both`

- `new_top_holder_entered`
  - 窗口：`snapshot`
  - 阈值：`新地址进入前排`
  - 方向：`in`

- `top_holder_exited`
  - 窗口：`snapshot`
  - 阈值：`地址退出前排`
  - 方向：`out`

---

## 已确认阈值

以下数值已经确认，可直接作为模板默认值：

- `funding_rate_gt_pos_threshold = 0.05`
- `funding_rate_lt_neg_threshold = -0.05`
- `top_holder_balance_change_gt_x = 10%`
