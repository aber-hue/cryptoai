# 真实表到页面接口接入设计

更新时间：
- 2026-04-16

目标：
- 基于当前真实数据库表，设计一层适合前端页面消费的接口
- 尽量少改现有页面结构
- 避免前端直接依赖原始表和研发外部 API 的细节

适用页面：
- `/market`
- `/coin/:symbol`
- `/onchain`

相关文档：
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/live-db-discovery.md`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/market-board-data-mapping.md`
- `/Users/mmobay202303/Desktop/vibe coding/crypto ai/crypto_exchange_dashboard/docs/onchain-board-data-mapping.md`

## 一、总体设计原则

建议采用：
- 页面层只调用本项目自己的薄 BFF
- 薄 BFF 再去查真实数据库表
- 接口按“页面块”组织，不按“单表 CRUD”组织

原因：
- 当前页面很多模块是多表拼装结果
- 原始表字段命名和前端展示结构不一致
- 同一个页面块通常需要 join 多张表
- 后续研发改外部 API 或字段时，前端可以不跟着一起改

推荐放置方式：
- 在当前项目 `Express + tRPC` 里新增 router
- 优先新增：
  - `market`
  - `token`
  - `onchain`

## 二、接口分层建议

### L0：真实表

直接来自数据库：
- `token_profiles`
- `exchange_listings`
- `exchange_announcements`
- `exchange_activities`
- `exchange_pairs`
- `token_address`
- `token_unlocks`
- `token_holding`
- `token_allocation`
- `chaindata_flow`
- `wallet_address_tags`
- `funding_rate_daily`
- `token_trade_depth_daily`
- `token_trade_depth_snapshot`

### L1：页面查询函数

建议在 server 里形成按页面块的查询函数，例如：
- `getMarketTokenList`
- `getMarketAnnouncements`
- `getTokenProfile`
- `getTokenListings`
- `getTokenDepthMarkets`
- `getTokenUnlockSchedule`
- `getTokenHoldingConcentration`
- `getTokenFundFlow`

### L2：页面接口

对前端暴露统一接口，例如：
- `market.listTokens`
- `market.listAnnouncements`
- `token.getProfile`
- `token.getListingView`
- `token.getDepthView`
- `token.getUnlockView`
- `onchain.getSnapshot`
- `onchain.getFundFlow`

## 三、页面到接口设计

## 1. `/market` 列表页

### 接口

`market.listTokens`

### 入参

```ts
{
  query?: string;
  exchangeIds?: number[];
  marketType?: "spot" | "perps";
  sortBy?: "listedAt" | "marketCap" | "volume24h";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}
```

### 出参

```ts
{
  items: Array<{
    tokenId: number;
    symbol: string;
    name: string;
    logoUrl?: string | null;
    price: number | null;
    totalSupply: number | null;
    circulatingSupply: number | null;
    fdv: number | null;
    marketCap: number | null;
    volume24h: number | null;
    listedAt: string | null;
    recentVenue: string | null;
    exchanges: Array<{
      exchangeId: number;
      exchangeName: string;
      marketType: "spot" | "perps";
    }>;
  }>;
  total: number;
}
```

### 推荐表来源

- 主表：`token_profiles`
- join：`exchange_listings`
- join：`exchange_pairs`
- 可选 join：`exchange_platforms`

### 处理逻辑

- `volume24h`：按 token 汇总 `exchange_pairs.volume_24h`
- `listedAt`：取最近上线时间或首次上线时间，建议接口支持配置
- `recentVenue`：取最近一条 `exchange_listings`
- `exchanges`：汇总 token 对应交易所

## 2. `/market` 公告页

### 接口

`market.listAnnouncements`

### 入参

```ts
{
  query?: string;
  type?: "listing" | "delisting" | "event" | "other";
  exchangeSlug?: string;
  tokenId?: number;
  page?: number;
  pageSize?: number;
}
```

### 出参

```ts
{
  items: Array<{
    id: number;
    title: string;
    exchangeSlug: string | null;
    tokenIds?: number[];
    publishedAt: string | null;
    summary: string | null;
    url: string | null;
    type: "listing" | "delisting" | "event" | "other";
  }>;
  total: number;
}
```

### 推荐表来源

- 主表：`exchange_announcements`
- 可补：`exchange_activities`

### 处理逻辑

- `type` 映射：
  - `is_listing = 1` -> `listing`
  - `is_delisting_risk = 1` -> `delisting`
  - `is_activity = 1` -> `event`
  - 其他 -> `other`
- `summary` 优先取 `content_summary`

## 3. `/coin/:symbol` 左侧基础信息

### 接口

`token.getProfile`

### 入参

```ts
{
  symbol: string;
}
```

### 出参

```ts
{
  tokenId: number;
  symbol: string;
  name: string;
  slug: string | null;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  whitepaperUrl: string | null;
  currentPrice: number | null;
  marketCap: number | null;
  fdv: number | null;
  totalSupply: number | null;
  circulatingSupply: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
  priceChange7d: number | null;
  tokenHolderCount: number | null;
  coinTags: string[];
  addresses: Array<{
    chainName: string;
    address: string;
  }>;
  latestAnnouncements: Array<{
    id: number;
    title: string;
    publishedAt: string | null;
    url: string | null;
    type: "listing" | "delisting" | "event" | "other";
  }>;
}
```

### 推荐表来源

- 主表：`token_profiles`
- join：`token_address`
- join：`exchange_announcements`
- 可补：`exchange_pairs`

### 处理逻辑

- `coinTags`：从 `coin_tags` 解析
- `addresses`：从 `token_address` 查
- `latestAnnouncements`：优先按 symbol / 关联 listing 查最近 3 条

## 4. `/coin/:symbol` 上市策略页

### 接口

`token.getListingView`

### 入参

```ts
{
  symbol: string;
}
```

### 出参

```ts
{
  listings: Array<{
    exchangeId: number;
    exchangeName: string;
    listingTime: string | null;
    depositTime: string | null;
    pairName: string | null;
    announcementId: number | null;
    announcementUrl: string | null;
    priceAtList: number | null;
    circulatingSupplyAtList: number | null;
    fdvAtList: number | null;
    marketCapAtList: number | null;
    volume24hAtList: number | null;
    pricePre24h: number | null;
    changePre24h: number | null;
    pricePost15m: number | null;
    changePost15m: number | null;
  }>;
  activities: Array<{
    id: number;
    title: string;
    activityType: string | null;
    publisher: string | null;
    rewardToken: string | null;
    rewardAmount: number | null;
    estimatedValue: number | null;
    startTime: string | null;
    endTime: string | null;
    announcementId: number | null;
  }>;
}
```

### 推荐表来源

- 主表：`exchange_listings`
- join：`exchange_announcements`
- join：`exchange_activities`

### 处理逻辑

- 先保证时间线和列表可用
- 历史价格图后置，单独做 `listingTrend` 接口

## 5. `/coin/:symbol` 市场深度页

### 接口

`token.getDepthView`

### 入参

```ts
{
  symbol: string;
}
```

### 出参

```ts
{
  markets: Array<{
    exchangeId: number;
    exchangeName: string;
    pairName: string | null;
    quoteCurrency: string | null;
    price: number | null;
    volume24h: number | null;
    depthBuy2: number | null;
    depthSell2: number | null;
    fundingRate: number | null;
    openInterest: number | null;
    listingTime: string | null;
  }>;
  snapshotTs?: string | null;
}
```

### 推荐表来源

- 主表：`exchange_pairs`
- 可补：`token_trade_depth_snapshot`

### 扩展接口

后续可以加：

`token.getDepthTrend`

```ts
{
  symbol: string;
  days: 30 | 60 | 90;
}
```

来源：
- `token_trade_depth_daily`
- `funding_rate_daily`

## 6. `/coin/:symbol` 解锁页

### 接口

`token.getUnlockView`

### 入参

```ts
{
  symbol: string;
}
```

### 出参

```ts
{
  items: Array<{
    unlockDate: string;
    recipientCategory: string | null;
    unlockAmount: number | null;
    percentageOfTotalSupply: number | null;
    cumulativeUnlockAmount: number | null;
    cumulativeUnlockRatio: number | null;
  }>;
}
```

### 推荐表来源

- 主表：`token_unlocks`

### 处理逻辑

- 按 `unlock_date` 排序
- `cumulative*` 在 BFF 层顺序累加

## 7. `/coin/:symbol` 持仓信息页

### 接口

`token.getPositionOverview`

### 入参

```ts
{
  symbol: string;
  days?: 30 | 60 | 90;
}
```

### 出参

```ts
{
  summary: Array<{
    snapshotTs: string;
    fundingRate: number | null;
    openInterest: number | null;
  }>;
  markets: Array<{
    exchangeId: number;
    exchangeName: string;
    pairName: string | null;
    price: number | null;
    volume24h: number | null;
    fundingRate: number | null;
    openInterest: number | null;
  }>;
}
```

### 推荐表来源

- 主表：`funding_rate_daily`
- join：`exchange_pairs`

## 8. `/onchain` 基础快照

### 接口

`onchain.getSnapshot`

### 入参

```ts
{
  symbol: string;
}
```

### 出参

```ts
{
  profile: {
    tokenId: number;
    symbol: string;
    name: string;
    currentPrice: number | null;
    marketCap: number | null;
    fdv: number | null;
    totalSupply: number | null;
    circulatingSupply: number | null;
    holderCount: number | null;
  };
  concentration: {
    top10Balance: number;
    top10Ratio: number;
    top50Balance: number;
    top50Ratio: number;
    top100Balance: number;
    top100Ratio: number;
  };
  topHoldingRows: Array<{
    address: string;
    label: string | null;
    balance: number | null;
    ratio: number | null;
  }>;
}
```

### 推荐表来源

- 主表：`token_profiles`
- join：`token_holding`

### 处理逻辑

- `top10/top50/top100` 由 `token_holding` 排序累加
- 不强行做当前没有的链上宽表指标

## 9. `/onchain` 资金流图

### 接口

`onchain.getFundFlow`

### 入参

```ts
{
  symbol: string;
  depth?: 3;
  minAmount?: number;
  limitPerLayer?: number;
}
```

### 出参

```ts
{
  tokenId: number;
  tokenAddressId?: number | null;
  totalAmount: number;
  nodes: Array<{
    id: string;
    layer: number;
    address: string;
    label: string | null;
    amount: number;
    outgoingCount: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    amount: number;
    time?: string | null;
    txhash?: string | null;
  }>;
}
```

### 推荐表来源

- 主表：`chaindata_flow`
- join：`token_address`
- join：`wallet_address_tags`

### 处理逻辑

- 先通过 `symbol -> token_id -> token_address.id`
- 再查对应 `token_address_id` 的流向明细
- 当前只实现 `3` 层
- `layer` 需要在 BFF 层做 BFS/分层
- `label` 通过地址 join `wallet_address_tags.tags`
- `minAmount` 在查询后或查询时过滤

## 四、我建议“已有 API”怎么用

## 结论

不是“全部不用”，也不是“全部照搬”。

**最合适的是混合策略：**
- 简单稳定的对象，可以复用已有 API
- 页面型、聚合型、链上型接口，建议重新在本项目里写薄 BFF

## 建议复用的已有 API 场景

如果研发已有 API 稳定可用，这些可以优先考虑复用：

- `GET /api/tokens`
  - 用于 token 列表的基础拉取
- `GET /api/tokens/:id`
  - 用于单币基础资料
- `GET /api/tokens/address/:id`
  - 用于合约地址
- `GET /api/tokens/listingsAndactivities/:id`
  - 用于 listing / activity 基础版本

这些接口的特点是：
- 语义简单
- 返回结构接近实体对象
- 复用成本低

## 建议不要直接依赖已有 API 的场景

这些更适合你自己在项目里重新写接口：

- `market.listTokens`
  - 因为列表页要混合 profiles / listings / pairs
- `market.listAnnouncements`
  - 因为页面要统一类型和筛选逻辑
- `token.getDepthView`
  - 因为要整合 depth / volume / funding / OI
- `token.getPositionOverview`
  - 因为要按时间序列和交易所汇总
- `onchain.getSnapshot`
  - 因为要从 holdings 现算集中度
- `onchain.getFundFlow`
  - 因为链上流图需要分层、标签、阈值、节点整形

这些接口的共同特点是：
- 明显是页面拼装结果
- 不像基础实体查询
- 直接依赖已有 API 会让前端变复杂

## 为什么不建议“全部重新写”

全部重写的问题：
- 你会把研发已有的数据服务价值浪费掉
- 多写很多重复查询
- 维护成本更高

## 为什么也不建议“全部沿用已有 API”

全部沿用的问题：
- 页面需要多次请求再前端拼装
- 接口语义不贴合页面
- 链上资金流图这种复杂视图很难靠通用 API 直接解决

## 最推荐的落地方案

### 第一阶段

- 优先复用已有的 token 基础 API
- 在本项目里新增页面聚合接口

### 第二阶段

- 当某个页面聚合逻辑稳定后
- 再决定是否沉淀成研发侧正式 API

## 五、推荐实施顺序

### 第一步
- `market.listTokens`
- `market.listAnnouncements`

### 第二步
- `token.getProfile`
- `token.getListingView`
- `token.getUnlockView`
- `token.getDepthView`

### 第三步
- `onchain.getSnapshot`
- `onchain.getFundFlow`

## 六、最终建议

一句话版：

**已有 API 要用，但只用在“基础实体查询”上；页面真正要消费的接口，最好还是在当前项目里重新写一层薄 BFF。**

这样能兼顾：
- 接入速度
- 页面灵活性
- 对研发已有能力的复用
- 后续迭代的可控性
