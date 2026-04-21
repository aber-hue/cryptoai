# Market Board 数据映射与缺口

更新时间：
- 2026-04-16

关联页面：
- `/market`
- `/coin/:symbol`

参考文件：
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/client/src/pages/DataManagement.tsx`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/client/src/pages/CoinDetail.tsx`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/client/src/features/crypto-ai/market-data.ts`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/外部文件/API_DOC.md`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/外部文件/DATABASE_DOC.md`

## 总体判断

这套外部 API / 数据库和 `market board` 的匹配度，明显高于 `On-chain Board`。

原因：
- `market board` 更偏代币资料、上币记录、公告、交易所市场数据
- 外部文档里已经有 `token_profiles`、`exchange_listings`、`exchange_activities`、`exchange_announcements`、`exchange_pairs`、`token_unlocks`
- 这些表和接口天然更接近当前页面所需字段

结论：
- `market board` 列表页可以优先接真实数据
- `coin detail` 详情页的大部分 tab 可以分批接
- 但仍有一部分内容目前只是产品展示结构，外部文档没有现成来源

## 一、列表页 `/market`

### 1. Coins 列表

当前页面字段主要来自 `listedTokens`：

| 页面字段 | 当前 mock 字段 | 推荐真实来源 | 备注 |
|---|---|---|---|
| 排名 | `rank` | 需新增排序规则 | 文档里没看到现成 rank 字段，可按上线时间或市值排序替代 |
| Symbol | `symbol` | `token_profiles.symbol` | 可直接映射 |
| 名称 | `name` | `token_profiles.name` | 可直接映射 |
| 上线时间 | `listedAt` | `exchange_listings.listingTime` 或同义字段 | 若一个币多个交易所，需要定义取“最近一次上线”还是“首次上线” |
| 价格 | `price` | `token_profiles.currentPrice` | 可直接映射 |
| 总供应量 | `totalSupply` | `token_profiles.totalSupply` | 可直接映射 |
| 流通量 | `circulatingSupply` | `token_profiles.circulatingSupply` | 可直接映射 |
| FDV | `fdv` | `token_profiles.fdv` | 可直接映射 |
| 市值 | `marketCap` | `token_profiles.marketCap` | 可直接映射 |
| 交易所列表 | `exchanges[]` | `exchange_listings` | 需要按 token 聚合 |
| 最近交易场所 | `recentVenue` | `exchange_listings` | 需要选最近一条 |
| 24h 成交量 | `volume24h` | `exchange_pairs.volume24h` 聚合 | 需要按 token 汇总 |

建议：
- 列表页适合做一个聚合接口，例如 `market.listTokens`
- 后端按 token 聚合 `token_profiles + exchange_listings + exchange_pairs`
- 前端继续保留当前列表结构即可

### 2. Announcements 公告页签

当前页面字段：
- 标题
- 交易所
- 展示标签
- 币种
- 时间
- 相对时间
- 摘要
- 类型

推荐真实来源：
- `exchange_announcements`
- `exchange_activities`
- `GET /api/exchange-activities/...`
- `GET /api/tokens/listingsAndactivities/:id`

映射判断：

| 页面字段 | 推荐来源 | 备注 |
|---|---|---|
| `title` | `exchange_announcements.title` | 可直接映射 |
| `exchange` | `exchange_announcements.exchangeName` | 可直接映射 |
| `token` | `exchange_announcements.symbol` 或关联 token | 需确认是否单币种、多币种或活动类文本 |
| `time` | `publishTime` | 可直接映射 |
| `summary` | `summary/content` | 需看字段长度 |
| `type` | 活动类型字段 | 需统一成 `listing / delisting / event / other` |

缺口：
- `relativeTime` 建议前端现算，不必后端提供
- `exchangeLabel` 需要前端自己规范化，外部数据未必直接给

## 二、详情页 `/coin/:symbol`

### 1. 左侧基础信息栏

当前内容包括：
- 价格
- 全周期涨跌
- 市值
- 解锁市值
- 24h 交易量
- 量/市值
- FDV
- 总供应量
- 最大供应量
- 流通供应量
- 持有者
- 行业标签
- 官网 / 合约地址
- 最新公告

推荐真实来源：

| 页面块 | 推荐来源 | 判断 |
|---|---|---|
| 价格 / 市值 / FDV / 总量 / 流通量 | `token_profiles` | 可直接接 |
| 持有者 | `token_profiles.tokenHolderCount` | 可直接接 |
| 24h 交易量 | `exchange_pairs` 按 token 汇总 | 需要聚合 |
| 量/市值 | BFF 派生 | 可轻计算 |
| 最大供应量 | 若 `token_profiles` 无单独字段则先用总量占位 | 需确认 |
| 行业标签 | `token_profiles.tags` 或类似字段 | 需确认文档具体字段 |
| 官网 | `token_profiles.website` | 需确认 |
| 合约地址 | `token_address` 或 `GET /api/tokens/address/:id` | 可直接接 |
| 最新公告 | `exchange_announcements` / `listingsAndactivities` | 可直接接近似版 |

缺口：
- `Profile score` 没看到现成来源
- “All” 区间涨跌幅未见统一字段

### 2. 上市策略 tab `listing`

当前内容：
- 价格趋势 + 事件点
- 上市时间线
- 上市 / 活动事件列表

可匹配来源：
- `exchange_listings`
- `exchange_activities`
- `exchange_announcements`
- `GET /api/tokens/listingsAndactivities/:id`

可直接支撑：
- 上市时间
- 上市交易所
- 公告链接
- 活动类事件

部分缺口：
- 图上的历史价格序列，文档里没看到明确的 token 日线表
- “上线价格”“上线时 FDV” 需要历史快照或事件发生时快照

建议：
- `listing` tab 可先接“事件列表版”
- 图表部分如果研发没有历史价格表，先保留 mock 或降级为静态事件时间线

### 3. 市场深度 tab `depth`

当前内容：
- K 线图
- 成交量图
- 交易所市场深度表

可匹配来源：
- `exchange_pairs`
- `token_trade_depth_snapshot`

可直接支撑：
- 各交易所交易对
- 当前价格
- 24h 交易量
- 深度快照
- 资金费率 / OI 类字段如果 `exchange_pairs` 已提供

缺口：
- K 线时间序列未在外部文档中明确看到
- 如果没有 OHLC 历史表，当前 K 线图只能先保留 mock

建议：
- 先接下半部分交易所市场深度表
- 图表等研发补历史行情序列后再切

### 4. 代币解锁 tab `unlock`

当前内容：
- 月度解锁计划完整表

推荐来源：
- `token_unlocks`

判断：
- 这个 tab 和外部数据文档匹配度很高
- 很适合优先替换 mock

需要确认：
- 字段是否已经按月聚合
- 是否包含累计解锁和累计占比

如果没有：
- 累计值可以在 BFF 层轻计算

### 5. 持仓信息 tab `holders`

当前内容：
- 总仓位与资金费率趋势
- 交易所持仓信息

注意：
- 这里页面语义更偏衍生品 / 交易所仓位，不是纯链上持仓

推荐来源：
- `exchange_pairs`
- 若存在衍生品 OI 表则更好

可支撑：
- 各交易所交易对
- 价格
- 24h 交易量
- 市场占比
- 资金费率

缺口：
- “总仓位与资金费率趋势”的时间序列文档中未明确看到
- `positionValue` / OI 历史曲线需要额外历史表

建议：
- 这个 tab 名字后续最好考虑和链上持仓区分
- 否则容易和 `On-chain Board` 的持仓集中度混淆

### 6. 投融资 / 团队 tab `funding`

当前内容：
- 融资总额
- 最近一轮
- 投资机构数
- 融资历史
- 团队成员

当前外部文档判断：
- 没看到明确的融资表
- 也没看到团队成员资料表

结论：
- 这个 tab 目前没有外部文档支撑
- 仍应视为独立数据源需求

### 7. 链上数据 tab `onchain`

关键发现：
- `CoinDetail.tsx` 里已经有 “链上数据” tab 按钮
- 但当前文件里没有 `activeTab === "onchain"` 的渲染内容

结论：
- 这个 tab 目前只有入口，没有落地页面
- 不建议在当前阶段把它纳入真实数据对接范围
- 如果后续要做，优先复用 `/onchain` 页面里的模块或做精简嵌入版

## 三、优先级建议

如果你要和研发对接 `market board`，建议按这个顺序推进：

### P0
- `/market` 列表页 coins
- `/market` 公告页 announcements
- `/coin/:symbol` 左侧基础信息
- `/coin/:symbol` 解锁 tab

### P1
- `/coin/:symbol` 上市策略 tab 的事件列表
- `/coin/:symbol` 市场深度 tab 的交易所表格

### P2
- `/coin/:symbol` 历史图表类模块
- `/coin/:symbol` 持仓信息 tab 的趋势图

### 暂缓
- `/coin/:symbol` funding tab
- `/coin/:symbol` onchain tab

## 四、推荐接口拆法

为了少改前端，推荐在当前项目里整理成这些聚合接口：

- `market.listTokens`
- `market.listAnnouncements`
- `token.getProfile`
- `token.getListingsAndActivities`
- `token.getDepthMarkets`
- `token.getUnlockSchedule`
- `token.getPositionOverview`

这样前端页面可以继续按“页面块”拿数据，而不是自己在浏览器里拼多个外部接口。

## 五、当前结论

和 `On-chain Board` 相比：
- `market board` 更适合优先接真实数据
- 外部文档和当前页面字段的重合度更高

其中最适合最快落地的是：
- 列表页
- 公告页
- 币种详情左侧信息
- 解锁计划
- 上市 / 活动列表

当前最大缺口集中在：
- 历史价格 / K 线时间序列
- OI / 资金费率历史序列
- 投融资 / 团队资料
- 详情页里的链上数据 tab 其实尚未实现
