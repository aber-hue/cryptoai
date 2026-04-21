# On-chain Board 数据映射与缺口

## 页面目标

当前页面：
- `/onchain`

目标：
- 把当前 mock 数据逐步替换成真实数据
- 尽量不改页面组件结构

## 推荐对接策略

按模块分阶段接入：

1. 先接最稳定、最直接的数据
2. 再接需要轻计算的数据
3. 最后接需要图结构拼装的数据

推荐顺序：

### 第一阶段
- A. 代币基础信息
- C. 持仓集中度
- 资金流图页的基础版本

### 第二阶段
- B. 控盘结构
- H. Top 地址页签

### 第三阶段
- D / F / G / I / J

这些需要研发补更多链上聚合数据，否则你自己在 BFF 层拼会越来越重。

## 字段映射

### A. 代币基础信息

| 页面字段 | 现有来源 | 备注 |
|---|---|---|
| `tokenName` | `token_profiles.name` | 可直接映射 |
| `tokenSymbol` | `token_profiles.symbol` | 可直接映射 |
| `priceUsd` | `token_profiles.currentPrice` | 可直接映射 |
| `priceChange24h` | `token_profiles.priceChange24h` | 可直接映射 |
| `totalSupply` | `token_profiles.totalSupply` | 可直接映射 |
| `circulatingSupply` | `token_profiles.circulatingSupply` | 可直接映射 |
| `marketCap` | `token_profiles.marketCap` | 可直接映射 |
| `fdv` | `token_profiles.fdv` | 可直接映射 |
| `holderCount` | `token_profiles.tokenHolderCount` | 可直接映射 |

缺口：
- `holderCountChange1d`
- `controlRate`
- `top10_ratio/top50_ratio/top100_ratio`

### B. 控盘结构

可尝试来源：
- `token_allocation`
- `token_holding`

问题：
- 当前文档没有能严格支撑“显性 / 隐性 / 间接控盘”口径的聚合表
- 更像需要研发明确规则后，在 SQL 层做衍生

### C. 持仓集中度

可尝试来源：
- `token_holding`

可做：
- Top10 持有量
- Top50 持有量
- Top100 持有量
- 占流通量比例

缺口：
- 持币人数历史趋势
- 历史集中度趋势

### D. 交易所流向（链上口径）

当前文档未见直接来源。

需要新增或确认以下数据：
- 交易所标签地址库
- 按日 inflow / outflow / netflow 聚合表

### F. DEX 买卖结构

当前文档未见直接来源。

需要新增或确认以下数据：
- DEX swap 明细或日聚合表
- 买卖方向标记
- 买卖地址数
- Top5 买/卖量

### G. 大户行为

可部分依赖：
- `token_holding`
- `tokens/:id/transfers`

但若要稳定支撑页面：
- 需要 Top100 地址集合
- 需要按日流向聚合

### H. 新增/流失 Top 地址

当前文档未见可直接支持的历史变化表。

需要新增：
- 地址余额日快照
- 或地址余额变化流水聚合表

### I. 标签地址净变化

当前文档未见可直接支持的标签地址净变化表。

### J. 综合趋势

当前文档未见统一日级宽表。

最理想方式：
- 研发提供 `token_daily_metrics` 类似宽表
- 或我们在薄 BFF 前面再接一个日级聚合 SQL 层

## 资金流图页特殊说明

当前页面 mock 实现已经支持：
- 多层节点
- 高亮路径
- 展开/收起
- 金额过滤
- 全屏查看

研发当前文档里最相关的是：
- `GET /api/tokens/:id/transfers`

但需要确认：
- 是否支持 `depth`
- 是否返回完整时间序列
- 是否能返回标签
- 是否能限制 `minAmount`

当前对齐策略：
- 页面先按 `0 地址 + 3 层转账` 展示
- 与外部文档当前能力保持一致
- 未来如果接口支持更多层数，前端再扩展

如果不能，建议 BFF 做参数兼容层，比如统一输出：

```ts
type FundFlowGraphResponse = {
  nodes: Array<{
    id: string;
    layer: number;
    address: string;
    label: string;
    amount: number;
    outgoingCount: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    amount: number;
  }>;
  totalAmount: number;
};
```

## 对接建议

建议你和研发对齐时直接按“页面能力”沟通，而不是按“表名”沟通。

可以直接提这四个问题：

1. 我们能不能先把 `/onchain` 的真实数据拆成 `snapshot / holdings / transfers` 三组？
2. `transfers` 接口当前 3 层之外，后续是否支持 `depth` 参数扩层？
3. 是否已有地址历史快照表，能支持 Top 地址变化？
4. 是否已有日级链上聚合表，能支撑交易所流向、DEX 买卖、大户行为？

## 当前建议结论

这套外部数据：
- 足够支撑第一阶段对接
- 不足够一次性替换整个 On-chain Board

最现实的策略是：
- 先接基础币种信息
- 再接持仓集中度
- 再接资金流图
- 其他模块等研发补链上日级聚合数据后再替换
