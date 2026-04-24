# Template Lab 设计稿 v1

更新时间：
- 2026-04-23

## 1. 模块定位

`Template Lab` 不负责自动交易。

它负责把底层 `signalEvents` 组合成更高一层的“机会对象”：

- `signal` 解决：发生了什么异动
- `template lab` 解决：这些异动组合起来意味着什么机会
- `execution` 以后再解决：是否下单、如何下单

这三层必须分开，避免一开始就把产品做成“黑盒自动交易”。

---

## 2. 为什么这个模块值得做

市面上很多工具已经能做：

- 单个 signal 筛选
- 单个交易所榜单
- 某类异动排行
- prompt + skill 的一次性分析

但你的优势不应该是“也做一个榜单”。

你的优势应该是：

1. 你有自己的数据拼装能力
2. 你能把价格、OI、Funding、Depth、Unlock、Announcement、Onchain 按统一 symbol 组织起来
3. 你能把多源事实组合成可复用模板，而不是每次临时问 AI

所以 `Template Lab` 的核心不是问答，而是模板化机会发现。

---

## 3. v1 输入输出

### 输入

来自现有 `signal` 层：

- `signalTemplates`
- `signalEvents`
- `signalEventMetrics`

### 输出

`Opportunity`

建议字段：

- `templateId`
- `symbol`
- `score`
- `confidence`
- `bias`
- `summary`
- `supportingPoints`
- `riskPoints`
- `matchedSignalIds`
- `dataEdges`
- `lastTriggeredAt`

注意：
- 输出的是“机会线索”
- 不是交易指令
- 不包含仓位、止损、下单路由

---

## 4. v1 推荐模板

第一版先做 4 类模板就够：

1. `momentum_continuation`
   价格 + OI + 深度联动，找趋势延续

2. `crowded_reversal`
   OI + Funding + 价格错位，找拥挤反转

3. `event_pressure`
   解锁 + 活动 + 上新 + 衍生品状态，找事件窗口

4. `holder_rotation`
   Top holder 变化 + 新地址进入，找筹码迁移

这些模板并不是最终版，但很适合做 v1 骨架。

---

## 5. 产品页结构

`/analysis` 也就是 `Template Lab` 页面建议分 3 列：

1. 左侧：模板列表
   - 模板名称
   - 模板描述
   - 当前命中数量

2. 中间：机会列表
   - Symbol
   - Score
   - Confidence
   - Bias
   - 支持证据
   - 风险提醒
   - 底层命中 signal

3. 右侧：方法论说明
   - 数据护城河
   - v1 原则
   - 下一步持久化方案

---

## 6. 为什么先不做自动交易

原因很简单：

1. 现在最稀缺的是“发现机会”的能力，不是执行按钮
2. 自动交易会倒逼你过早绑定仓位、风控、路由和权限
3. 如果机会层做不扎实，自动执行只会放大错误

所以 v1 应该先验证：

- 哪些模板稳定有价值
- 哪些数据源最能形成优势
- 哪些机会类型最值得被持续追踪

---

## 7. 下一步后端表结构

当你决定把 v1 从前端组合升级成持久化系统时，建议新增：

### `templabTemplates`

用途：
- 持久化模板定义
- 存权重、阈值、描述、是否启用

建议字段：
- `id`
- `name`
- `category`
- `description`
- `objective`
- `ownDataAngle`
- `minimumScore`
- `configJson`
- `isEnabled`
- `createdAt`
- `updatedAt`

### `templabRuns`

用途：
- 记录每次模板运行

建议字段：
- `id`
- `templateId`
- `runScope`
- `inputJson`
- `summaryJson`
- `startedAt`
- `finishedAt`
- `status`

### `templabOpportunities`

用途：
- 记录每次运行产出的机会对象

建议字段：
- `id`
- `runId`
- `templateId`
- `symbol`
- `score`
- `confidence`
- `bias`
- `title`
- `summary`
- `evidenceJson`
- `riskJson`
- `matchedSignalIdsJson`
- `status`
- `createdAt`
- `updatedAt`

---

## 8. v2 以后再做的事

- 模板配置 UI
- 模板版本管理
- 机会状态流转
- AI 总结解释
- Telegram / 飞书推送
- 自动下单联动

这些都应该在 v1 机会层跑顺以后再接。
