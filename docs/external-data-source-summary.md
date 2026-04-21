# 外部数据源摘要

来源文件：
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/外部文件/API_DOC.md`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/外部文件/DATABASE_DOC.md`

更新时间：
- 2026-04-16

## 结论

这套外部数据源更适合支撑以下能力：
- 代币基础资料
- 市场基础信息
- 上币记录
- 交易所活动/公告
- 解锁计划
- 地址持仓快照
- 从 `0x0` 地址开始的有限层级转账记录

它目前不等于你需求文档里那种“每日链上信号宽表”。

尤其缺少或未明确提供这些已经按日聚合好的指标：
- `token_daily_metrics`
- 交易所链上净流入日序列
- DEX 买卖结构日序列
- 大户行为日序列
- 标签地址净变化日序列
- 可直接用于看板的多指标历史序列

所以这套数据源可以作为上游数据基础，但还不够直接驱动现在的 On-chain Board 全部模块。

## API 能力摘要

当前文档里和我们最相关的接口有：

### `GET /api/tokens`
- 获取代币列表
- 支持按 `symbol`、`exchangeIds`、排序、分页过滤

### `GET /api/tokens/:id`
- 获取单个代币详情
- 包含基础资料、价格、市值、FDV、总量、流通量、24h/7d 变化、标签

### `GET /api/tokens/address/:id`
- 获取代币多链合约地址

### `GET /api/tokens/:id/transfers`
- 获取代币转账记录
- 文档说明：从 `0x0` 地址开始追踪 3 层关系
- 返回 `from/to`、标签、数量、时间
- 这是当前最接近我们“资金流图”页面的数据接口

### `GET /api/tokens/listingsAndactivities/:id`
- 获取上币记录和活动信息

### `GET /api/exchange-activities/...`
- 交易所活动列表和按币种查询

## 数据库能力摘要

和当前看板最相关的表：

### `token_profiles`
- 代币基础资料
- 价格、市值、FDV、总量、流通量、24h/7d 变化
- `tokenHolderCount` 可用于持币人数展示

### `token_address`
- 多链合约地址

### `token_allocation`
- 白皮书解析出的分配信息
- 可以辅助控盘结构的早期版本，但不等于真实链上控盘

### `exchange_listings`
- 上币记录

### `exchange_activities`
- 交易所活动

### `exchange_announcements`
- 公告

### `exchange_pairs`
- 交易对维度的价格、交易量、深度、资金费率、OI
- 更偏交易所市场数据，不是链上宽表

### `token_unlocks`
- 解锁计划

### `token_holding`
- 地址持仓快照
- 包含 `address`、`balance`、`percentageOfCirculating`、`label`
- 可支撑：
  - Top 持仓地址
  - 持仓集中度
  - 地址标签展示
- 但文档里没看到“按日历史持仓变化”表

### `token_trade_depth_snapshot`
- 深度快照
- 偏交易所盘口数据

## 对 On-chain Board 的直接可用性

### 可直接支持

#### A. 代币基础信息
- 基本可支持
- 主要来自 `token_profiles`

#### H. 新增/流失 Top 持仓地址
- 目前不能直接完整支持
- 因为文档里没有看到“按日地址余额变化表”
- 如果只有 `token_holding` 当前快照，不足以做“新增/流失”

#### 资金流图页
- 可以先接 `GET /api/tokens/:id/transfers`
- 但当前接口文档只写了 3 层
- 当前页面已调整为按 3 层展示，和外部文档保持一致
- 后续如果研发支持 `depth` 参数，再考虑扩成可配置层数

### 部分支持

#### B. 控盘结构
- 只能做“近似版”
- 需要用 `token_allocation` + `token_holding.label` 拼
- 但这和你需求里“显性 / 隐性 / 间接控盘”的口径还不完全一致

#### C. 持仓集中度
- 可以先做
- 用 `token_holding` 计算 Top10/50/100
- 但若要历史趋势，需要额外的按日快照表

### 当前明显不够

#### D. 交易所流向（链上口径）
- 没看到现成“按日交易所流入/流出/净流入”表
- 也没看到交易所钱包标签覆盖表

#### F. DEX 买卖结构
- 没看到 DEX 买卖按地址、按方向、按日聚合的数据表

#### G. 大户行为
- 没看到 Top100 地址的日内/日级流向聚合表

#### I. 重点标签地址净变化
- 没看到标签地址按日净变化表

#### J. 多指标综合趋势
- 缺少统一历史宽表或可稳定拼装的历史指标接口

## 技术建议

结合本工程当前实现，最合适的接法不是“前端直接打外部 API”，而是：

### 推荐方式
- 继续沿用当前工程里的 `Express + tRPC`
- 在本项目内加一个很薄的 `onchain` 数据路由层
- 由这个薄层去调用研发给的 API 或查研发给的只读库
- 前端页面只消费本项目自己的统一数据结构

### 原因
- 当前项目已经有后端骨架，不需要再引入新体系
- On-chain Board 不是简单表格页，很多模块需要“拼装后的页面数据结构”
- 资金流图尤其需要 BFF 做轻量整形
- 这样可以把 mock 数据平滑替换成真实数据，不必重写前端

## 下一步需要和研发确认的问题

1. `GET /api/tokens/:id/transfers` 是否真的只能返回 3 层，还是支持 depth 参数。
2. `token_holding` 是否有按日历史版本或变更流水表。
3. 是否存在未写进文档的链上聚合表，例如：
   - 交易所净流入日表
   - DEX 买卖聚合表
   - 大户行为日表
   - 标签地址净变化表
4. `token_profiles.id` 和我们前端当前 `symbol` 维度怎么映射。
5. 是否有统一的 token 查询接口支持通过 `symbol` 反查 `id`。
