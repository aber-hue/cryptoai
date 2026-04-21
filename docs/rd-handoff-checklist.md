# 研发对接清单

更新时间：
- 2026-04-16

适用范围：
- `Market Board`
- `Coin Detail`
- `On-chain Board`

相关参考：
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/external-data-source-summary.md`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/market-board-data-mapping.md`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/onchain-board-data-mapping.md`

## 一、先对齐的总体原则

本次希望优先对接：
- 列表页
- 币种详情页的基础信息和解锁信息
- 链上资金流图的基础版本

本次暂不要求研发一次性解决：
- 全部链上聚合指标
- 全部历史图表
- 投融资 / 团队资料

建议对接方式：
- 由当前项目内的薄 BFF 统一接研发数据
- 前端不直接拼多个外部接口
- 研发只需要确认表、字段、接口能力和限制

## 二、需要研发先确认的基础问题

### 1. Token 主键怎么统一

需要确认：
- `token_profiles.id`
- `symbol`
- 合约地址

希望研发回答：
- 前端应该用哪个主键作为统一查询键
- 是否支持通过 `symbol` 反查 `id`
- 是否一个 `symbol` 可能对应多链多地址

原因：
- 当前页面主要按 `symbol` 驱动
- 外部接口更多像是按 `id` 查询

### 2. 是否有稳定的只读数据源

需要确认：
- 我们最终接的是只读数据库，还是研发已有 API
- 如果是 API，是否有分页、限流、缓存策略
- 如果是数据库，是否有只读副本和查询范围限制

### 3. schema / 字段变更通知方式

需要确认：
- 核心表字段变更是否会提前通知
- 有没有固定文档位置或 Git 仓库维护 schema

原因：
- 当前页面会直接依赖字段契约

## 三、P0 优先对接项

## 1. Market Board 列表页 `/market`

目标：
- 用真实数据替换当前币种列表 mock

需要研发确认的字段来源：
- `token_profiles`
- `exchange_listings`
- `exchange_pairs`

希望拿到的数据能力：

| 页面字段 | 期望来源 | 备注 |
|---|---|---|
| `symbol` | `token_profiles.symbol` | 必需 |
| `name` | `token_profiles.name` | 必需 |
| `currentPrice` | `token_profiles.currentPrice` | 必需 |
| `totalSupply` | `token_profiles.totalSupply` | 必需 |
| `circulatingSupply` | `token_profiles.circulatingSupply` | 必需 |
| `fdv` | `token_profiles.fdv` | 必需 |
| `marketCap` | `token_profiles.marketCap` | 必需 |
| `24h volume` | `exchange_pairs` 聚合 | 必需 |
| `exchange list` | `exchange_listings` 聚合 | 必需 |
| `latest listing time` | `exchange_listings` | 必需 |

需要研发明确的问题：
1. 一个币多个交易所时，`listedAt` 是取首次上线还是最近上线。
2. `24h volume` 是否已有 token 级聚合字段，还是需要我们自己从交易对汇总。
3. 是否存在现成 rank 字段，如果没有，我们先按上线时间或市值排序。

## 2. Market Board 公告页

目标：
- 用真实公告 / 活动数据替换当前公告 mock

可用来源候选：
- `exchange_announcements`
- `exchange_activities`
- `GET /api/exchange-activities/...`
- `GET /api/tokens/listingsAndactivities/:id`

希望研发确认：
1. 公告和活动是否已统一存储，还是两套来源。
2. 是否有标准事件类型，能映射到：
   - `listing`
   - `delisting`
   - `event`
   - `other`
3. 一条公告是否总能明确关联到单个 token。

## 3. Coin Detail 左侧基础信息

目标：
- 替换币种详情页左侧基础资料 mock

希望拿到的数据字段：

| 页面字段 | 期望来源 |
|---|---|
| 价格 | `token_profiles.currentPrice` |
| 市值 | `token_profiles.marketCap` |
| FDV | `token_profiles.fdv` |
| 总供应量 | `token_profiles.totalSupply` |
| 流通供应量 | `token_profiles.circulatingSupply` |
| 持有者 | `token_profiles.tokenHolderCount` |
| 24h 交易量 | `exchange_pairs` 聚合 |
| 官网 | `token_profiles.website` |
| 行业标签 | `token_profiles.tags` |
| 合约地址 | `token_address` |

需要研发明确的问题：
1. 是否有 `maxSupply` 字段。
2. 是否有适合展示的标签 / 赛道字段。
3. 是否有“全周期涨跌幅”这类可直接展示字段。

## 4. Coin Detail 解锁页 `unlock`

目标：
- 优先接真实解锁数据

可用来源：
- `token_unlocks`

希望研发确认：
1. 是否按月存储。
2. 是否已经包含：
   - 月度释放总量
   - 月度释放占比
   - 累计释放
   - 累计释放占比
3. 如果没有累计字段，是否允许我们在 BFF 层轻计算。

## 5. On-chain Board 资金流图

目标：
- 先接资金流图基础版

当前前端已经按以下口径对齐：
- `0 地址`
- 3 层转账关系

对应来源：
- `GET /api/tokens/:id/transfers`

希望研发明确的问题：
1. 当前接口是否固定只有 3 层。
2. 后续是否支持 `depth` 参数。
3. 是否返回：
   - `from`
   - `to`
   - `amount`
   - `timestamp`
   - `fromLabel`
   - `toLabel`
4. 是否支持金额阈值过滤，例如 `minAmount`。
5. 是否默认就是从 `0x0` 开始追踪，还是需要前端传起点。

## 四、P1 对接项

## 1. Coin Detail 上市策略页 `listing`

目标：
- 先接事件列表和时间线
- 图表历史序列后置

希望研发确认：
1. `exchange_listings` 是否包含：
   - 交易所
   - 上线时间
   - 公告链接
   - 上线价格
   - 上线时 FDV
2. 活动事件是否和上币事件可统一返回。
3. 历史价格序列是否有现成表。

当前建议：
- 如果没有历史价格表，先只对接事件列表，不强求走势图。

## 2. Coin Detail 市场深度页 `depth`

目标：
- 先接交易所市场深度表

可用来源：
- `exchange_pairs`
- `token_trade_depth_snapshot`

希望研发确认：
1. 是否有 token 对应的交易对清单。
2. 是否有各交易对的：
   - 当前价格
   - 24h 交易量
   - 深度
   - 资金费率
   - OI
3. 是否有 K 线 / OHLC 历史序列。

当前建议：
- 没有历史序列时，先上表格，不急着接图。

## 五、P2 及暂缓项

## 1. On-chain Board 其他链上模块

这些模块目前文档里没有稳定来源，需要研发明确是否已有聚合表：
- 交易所链上净流入
- DEX 买卖结构
- 大户行为
- 标签地址净变化
- 综合趋势宽表

希望研发回答：
1. 是否存在类似 `token_daily_metrics` 的宽表。
2. 是否已有按日聚合好的链上指标表，而不是只给原始明细。

## 2. Coin Detail 持仓信息页 `holders`

注意：
- 当前页面内容更偏衍生品仓位，不是链上地址持仓

需要研发确认：
1. 是否有 OI 历史表。
2. 是否有 funding rate 历史表。
3. 是否有交易所维度的 position / OI 快照。

## 3. Coin Detail 投融资 / 团队页 `funding`

当前问题：
- 外部文档未见融资表
- 外部文档未见团队成员表

建议：
- 这个模块先不纳入第一批对接

## 六、建议发给研发的简版问题

如果只想先发一段短消息，可以直接发这版：

1. `token_profiles.id`、`symbol`、合约地址三者怎么映射，是否支持通过 `symbol` 查 `id`？
2. Market Board 列表页需要 `token_profiles + exchange_listings + exchange_pairs` 聚合，请确认是否已有可直接查询的接口或视图。
3. Coin Detail 左侧基础信息和 `unlock` 页是否可直接由 `token_profiles / token_address / token_unlocks` 支撑？
4. `GET /api/tokens/:id/transfers` 当前是否固定只支持 `0 地址 + 3 层`，以及是否返回地址标签、时间、金额、是否支持 `minAmount/depth`？
5. 是否已有链上日级聚合表，可支撑交易所净流入、DEX 买卖结构、大户行为、标签地址净变化？

## 七、当前建议结论

最推荐的对接顺序：

### 第一批
- Market Board 列表页
- Market Board 公告页
- Coin Detail 左侧基础信息
- Coin Detail 解锁页
- On-chain Board 资金流图基础版

### 第二批
- Coin Detail 上市策略页
- Coin Detail 市场深度页表格

### 第三批
- 其余链上聚合模块
- 历史图表
- 融资 / 团队
