import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint, decimal, index, uniqueIndex } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * 交易所表
 */
export const exchanges = mysqlTable("exchanges", {
  id: varchar("id", { length: 64 }).primaryKey(), // e.g., "binance"
  name: varchar("name", { length: 128 }).notNull(), // e.g., "Binance"
  logoUrl: text("logoUrl"), // Logo图片地址
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Exchange = typeof exchanges.$inferSelect;
export type InsertExchange = typeof exchanges.$inferInsert;

/**
 * 币种表
 */
export const coins = mysqlTable("coins", {
  id: varchar("id", { length: 64 }).primaryKey(), // e.g., "bitcoin"
  symbol: varchar("symbol", { length: 32 }).notNull(), // e.g., "BTC"
  name: varchar("name", { length: 128 }).notNull(), // e.g., "Bitcoin"
  description: text("description"), // 项目介绍
  logoUrl: text("logoUrl"), // Logo图片地址
  website: text("website"), // 官网链接
  whitepaperUrl: text("whitepaperUrl"), // 白皮书链接
  currentPrice: bigint("currentPrice", { mode: "number" }), // 当前价格 (USD cents)
  marketCap: bigint("marketCap", { mode: "number" }), // 流通市值 (USD cents)
  fdv: bigint("fdv", { mode: "number" }), // 完全稀释估值 (USD cents)
  totalSupply: bigint("totalSupply", { mode: "number" }), // 发行总量
  circulatingSupply: bigint("circulatingSupply", { mode: "number" }), // 流通量
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Coin = typeof coins.$inferSelect;
export type InsertCoin = typeof coins.$inferInsert;

/**
 * 上币信息表
 */
export const listings = mysqlTable("listings", {
  id: int("id").autoincrement().primaryKey(),
  coinId: varchar("coinId", { length: 64 }).notNull(), // 关联币种ID
  exchangeId: varchar("exchangeId", { length: 64 }).notNull(), // 关联交易所ID
  hasSpot: boolean("hasSpot").default(false).notNull(), // 是否上线现货
  hasFutures: boolean("hasFutures").default(false).notNull(), // 是否上线合约
  spotListingTime: timestamp("spotListingTime"), // 现货上线时间
  futuresListingTime: timestamp("futuresListingTime"), // 合约上线时间
  listingPrice: bigint("listingPrice", { mode: "number" }), // 上线时价格 (USD cents)
  listingVolume24h: bigint("listingVolume24h", { mode: "number" }), // 上线后24小时交易量 (USD cents)
  listingCirculatingSupply: bigint("listingCirculatingSupply", { mode: "number" }), // 上线时流通量
  listingFdv: bigint("listingFdv", { mode: "number" }), // 上线时FDV (USD cents)
  currentVolume24h: bigint("currentVolume24h", { mode: "number" }), // 当前24小时交易量 (USD cents)
  currentDepthUp2: bigint("currentDepthUp2", { mode: "number" }), // 当前买盘2%深度 (USD cents)
  currentDepthDown2: bigint("currentDepthDown2", { mode: "number" }), // 当前卖盘2%深度 (USD cents)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type InsertListing = typeof listings.$inferInsert;

/**
 * 交易所活动表
 */
export const activities = mysqlTable("activities", {
  id: int("id").autoincrement().primaryKey(),
  coinId: varchar("coinId", { length: 64 }).notNull(), // 关联币种ID
  exchangeId: varchar("exchangeId", { length: 64 }).notNull(), // 关联交易所ID
  title: varchar("title", { length: 512 }).notNull(), // 活动标题
  content: text("content"), // 活动内容摘要
  url: text("url"), // 公告原文链接
  publishTime: timestamp("publishTime").notNull(), // 发布时间
  snapshotPrice: bigint("snapshotPrice", { mode: "number" }), // 活动时价格快照 (USD cents)
  snapshotFdv: bigint("snapshotFdv", { mode: "number" }), // 活动时FDV快照 (USD cents)
  snapshotVolume24h: bigint("snapshotVolume24h", { mode: "number" }), // 活动时24h交易量快照 (USD cents)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Activity = typeof activities.$inferSelect;
export type InsertActivity = typeof activities.$inferInsert;

/**
 * 代币解锁表
 */
export const tokenUnlocks = mysqlTable("tokenUnlocks", {
  id: int("id").autoincrement().primaryKey(),
  coinId: varchar("coinId", { length: 64 }).notNull(), // 关联币种ID
  unlockDate: timestamp("unlockDate").notNull(), // 解锁日期
  unlockAmount: bigint("unlockAmount", { mode: "number" }).notNull(), // 解锁数量
  percentageOfTotalSupply: int("percentageOfTotalSupply"), // 占总供应量百分比 (0-10000, 代表0.00%-100.00%)
  recipientCategory: varchar("recipientCategory", { length: 128 }), // 接收方类别 (e.g., "Team", "Investors", "Community")
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TokenUnlock = typeof tokenUnlocks.$inferSelect;
export type InsertTokenUnlock = typeof tokenUnlocks.$inferInsert;

/**
 * 地址持仓表
 */
export const addressHoldings = mysqlTable("addressHoldings", {
  id: int("id").autoincrement().primaryKey(),
  coinId: varchar("coinId", { length: 64 }).notNull(), // 关联币种ID
  address: varchar("address", { length: 128 }).notNull(), // 链上地址
  balance: bigint("balance", { mode: "number" }).notNull(), // 持仓数量
  percentageOfCirculating: int("percentageOfCirculating"), // 占流通量百分比 (0-10000, 代表0.00%-100.00%)
  isExchange: boolean("isExchange").default(false).notNull(), // 是否为交易所地址
  exchangeId: varchar("exchangeId", { length: 64 }), // 关联交易所ID（如果是交易所地址）
  label: varchar("label", { length: 256 }), // 地址标签（如果有）
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AddressHolding = typeof addressHoldings.$inferSelect;
export type InsertAddressHolding = typeof addressHoldings.$inferInsert;

/**
 * 持仓数据表（用于存储合约持仓、多空比、资金费率等数据）
 */
export const positionData = mysqlTable("positionData", {
  id: int("id").autoincrement().primaryKey(),
  coinId: varchar("coinId", { length: 64 }).notNull(), // 关联币种ID
  exchangeId: varchar("exchangeId", { length: 64 }).notNull(), // 关联交易所ID
  timestamp: timestamp("timestamp").notNull(), // 数据时间戳
  // 合约持仓量
  openInterestBtc: bigint("openInterestBtc", { mode: "number" }), // 持仓量（BTC）
  openInterestUsdt: bigint("openInterestUsdt", { mode: "number" }), // 持仓量（USDT）
  // 多空比相关
  longShortRatio: int("longShortRatio"), // 多空比 (0-10000, 代表0.00-100.00)
  longAccountRatio: int("longAccountRatio"), // 多头账户占比 (0-10000)
  shortAccountRatio: int("shortAccountRatio"), // 空头账户占比 (0-10000)
  topTraderLongRatio: int("topTraderLongRatio"), // 大户多头占比 (0-10000)
  topTraderShortRatio: int("topTraderShortRatio"), // 大户空头占比 (0-10000)
  // 资金流动
  netInflow: bigint("netInflow", { mode: "number" }), // 大户净流入（正数为流入，负数为流出）
  // 主动买卖量
  buyVolume: bigint("buyVolume", { mode: "number" }), // 主动买入量
  sellVolume: bigint("sellVolume", { mode: "number" }), // 主动卖出量
  // 基差和溢价
  basis: bigint("basis", { mode: "number" }), // 基差（合约价格 - 现货价格）
  premiumIndex: int("premiumIndex"), // 溢价指数 (可为负数, -10000 to 10000, 代表-100.00% to 100.00%)
  // 资金费率
  fundingRate: int("fundingRate"), // 资金费率 (-10000 to 10000, 代表-100.00% to 100.00%)
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PositionData = typeof positionData.$inferSelect;
export type InsertPositionData = typeof positionData.$inferInsert;

/**
 * Free Chat 会话表
 */
export const chatConversations = mysqlTable("chatConversations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ownerOpenId: varchar("ownerOpenId", { length: 64 }),
  title: varchar("title", { length: 255 }).notNull(),
  detectedSymbol: varchar("detectedSymbol", { length: 32 }),
  taskType: varchar("taskType", { length: 64 }).notNull(),
  summary: text("summary"),
  stateJson: text("stateJson"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatConversation = typeof chatConversations.$inferSelect;
export type InsertChatConversation = typeof chatConversations.$inferInsert;

/**
 * Free Chat 消息表
 */
export const chatMessages = mysqlTable("chatMessages", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  role: mysqlEnum("role", ["system", "user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;
export type InsertChatMessage = typeof chatMessages.$inferInsert;

/**
 * Free Chat 产出物表
 */
export const chatArtifacts = mysqlTable("chatArtifacts", {
  id: varchar("id", { length: 64 }).primaryKey(),
  conversationId: varchar("conversationId", { length: 64 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["report", "table", "csv"]).notNull(),
  status: mysqlEnum("status", ["ready", "generating"]).notNull(),
  summary: text("summary"),
  content: text("content"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ChatArtifact = typeof chatArtifacts.$inferSelect;
export type InsertChatArtifact = typeof chatArtifacts.$inferInsert;

/**
 * Signal 模板定义表
 */
export const signalTemplates = mysqlTable(
  "signalTemplates",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    signalType: varchar("signalType", { length: 128 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    category: varchar("category", { length: 64 }).notNull(),
    description: text("description"),
    direction: varchar("direction", { length: 32 }).notNull(),
    defaultWindow: varchar("defaultWindow", { length: 32 }),
    defaultThresholdText: varchar("defaultThresholdText", { length: 255 }),
    severityRule: text("severityRule"),
    source: varchar("source", { length: 64 }).notNull(),
    isEnabled: boolean("isEnabled").default(true).notNull(),
    priority: int("priority").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    signalTypeUnique: uniqueIndex("uq_signal_templates_signal_type").on(table.signalType),
    categoryIdx: index("idx_signal_templates_category").on(table.category),
    enabledIdx: index("idx_signal_templates_enabled").on(table.isEnabled),
  })
);

export type SignalTemplate = typeof signalTemplates.$inferSelect;
export type InsertSignalTemplate = typeof signalTemplates.$inferInsert;

/**
 * Signal 触发事件表
 */
export const signalEvents = mysqlTable(
  "signalEvents",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    signalType: varchar("signalType", { length: 128 }).notNull(),
    tokenId: bigint("tokenId", { mode: "number" }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    summary: text("summary"),
    category: varchar("category", { length: 64 }).notNull(),
    direction: varchar("direction", { length: 32 }).notNull(),
    window: varchar("window", { length: 32 }),
    severity: mysqlEnum("severity", ["low", "medium", "high"]).notNull(),
    status: mysqlEnum("status", ["new", "active", "muted", "expired"]).default("new").notNull(),
    source: varchar("source", { length: 64 }).notNull(),
    triggeredAt: timestamp("triggeredAt").notNull(),
    expiresAt: timestamp("expiresAt"),
    dedupeKey: varchar("dedupeKey", { length: 255 }).notNull(),
    latestMetricValue: decimal("latestMetricValue", { precision: 36, scale: 12 }),
    baselineValue: decimal("baselineValue", { precision: 36, scale: 12 }),
    thresholdValue: decimal("thresholdValue", { precision: 36, scale: 12 }),
    changePct: decimal("changePct", { precision: 18, scale: 6 }),
    payloadJson: text("payloadJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    dedupeKeyUnique: uniqueIndex("uq_signal_events_dedupe_key").on(table.dedupeKey),
    symbolIdx: index("idx_signal_events_symbol").on(table.symbol),
    tokenIdx: index("idx_signal_events_token_id").on(table.tokenId),
    typeIdx: index("idx_signal_events_signal_type").on(table.signalType),
    statusIdx: index("idx_signal_events_status").on(table.status),
    triggeredAtIdx: index("idx_signal_events_triggered_at").on(table.triggeredAt),
    statusTriggeredIdx: index("idx_signal_events_status_triggered_at").on(table.status, table.triggeredAt),
    typeTriggeredIdx: index("idx_signal_events_type_triggered_at").on(table.signalType, table.triggeredAt),
  })
);

export type SignalEvent = typeof signalEvents.$inferSelect;
export type InsertSignalEvent = typeof signalEvents.$inferInsert;

/**
 * Signal 事件指标明细表
 */
export const signalEventMetrics = mysqlTable(
  "signalEventMetrics",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    signalEventId: varchar("signalEventId", { length: 64 }).notNull(),
    metricKey: varchar("metricKey", { length: 128 }).notNull(),
    metricLabel: varchar("metricLabel", { length: 255 }).notNull(),
    metricValue: decimal("metricValue", { precision: 36, scale: 12 }),
    metricUnit: varchar("metricUnit", { length: 32 }),
    baselineValue: decimal("baselineValue", { precision: 36, scale: 12 }),
    thresholdValue: decimal("thresholdValue", { precision: 36, scale: 12 }),
    sortOrder: int("sortOrder").default(0).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    eventIdx: index("idx_signal_event_metrics_event_id").on(table.signalEventId),
    metricKeyIdx: index("idx_signal_event_metrics_metric_key").on(table.metricKey),
  })
);

export type SignalEventMetric = typeof signalEventMetrics.$inferSelect;
export type InsertSignalEventMetric = typeof signalEventMetrics.$inferInsert;

/**
 * Signal 事件处理动作表
 */
export const signalEventActions = mysqlTable(
  "signalEventActions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    signalEventId: varchar("signalEventId", { length: 64 }).notNull(),
    actionType: mysqlEnum("actionType", ["mark_active", "mute", "unmute", "expire", "reopen"]).notNull(),
    fromStatus: mysqlEnum("fromStatus", ["new", "active", "muted", "expired"]),
    toStatus: mysqlEnum("toStatus", ["new", "active", "muted", "expired"]),
    operatorOpenId: varchar("operatorOpenId", { length: 64 }),
    note: text("note"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    eventIdx: index("idx_signal_event_actions_event_id").on(table.signalEventId),
    createdAtIdx: index("idx_signal_event_actions_created_at").on(table.createdAt),
  })
);

export type SignalEventAction = typeof signalEventActions.$inferSelect;
export type InsertSignalEventAction = typeof signalEventActions.$inferInsert;

/**
 * 地址标签分析 run 表
 */
export const labelAnalysisRuns = mysqlTable(
  "labelAnalysisRuns",
  {
    runId: varchar("runId", { length: 64 }).primaryKey(),
    tokenId: bigint("tokenId", { mode: "number" }).notNull(),
    chain: varchar("chain", { length: 64 }).notNull(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    triggeredBy: varchar("triggeredBy", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["running", "success", "failed"]).notNull(),
    proposalCount: int("proposalCount").default(0).notNull(),
    approvedCount: int("approvedCount").default(0).notNull(),
    rejectedCount: int("rejectedCount").default(0).notNull(),
    configJson: text("configJson").notNull(),
    sourceSummaryJson: text("sourceSummaryJson"),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt").notNull(),
    finishedAt: timestamp("finishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tokenStartedIdx: index("idx_label_runs_token_started").on(table.tokenId, table.startedAt),
    statusStartedIdx: index("idx_label_runs_status_started").on(table.status, table.startedAt),
    symbolStartedIdx: index("idx_label_runs_symbol_started").on(table.symbol, table.startedAt),
  })
);

export type LabelAnalysisRun = typeof labelAnalysisRuns.$inferSelect;
export type InsertLabelAnalysisRun = typeof labelAnalysisRuns.$inferInsert;

/**
 * 地址标签 proposal 表
 */
export const addressLabelProposals = mysqlTable(
  "addressLabelProposals",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    runId: varchar("runId", { length: 64 }).notNull(),
    tokenId: bigint("tokenId", { mode: "number" }).notNull(),
    chain: varchar("chain", { length: 64 }).notNull(),
    address: varchar("address", { length: 128 }).notNull(),
    proposedLabel: varchar("proposedLabel", { length: 64 }).notNull(),
    proposedSubtype: varchar("proposedSubtype", { length: 64 }),
    proposedTagsJson: text("proposedTagsJson"),
    confidence: decimal("confidence", { precision: 6, scale: 4 }).notNull(),
    detector: varchar("detector", { length: 64 }).notNull(),
    stage: mysqlEnum("stage", ["bootstrap", "downstream", "behavior", "sink", "cluster"]).notNull(),
    reasonSummary: text("reasonSummary").notNull(),
    evidenceJson: text("evidenceJson").notNull(),
    reviewStatus: mysqlEnum("reviewStatus", ["pending", "approved", "rejected"]).default("pending").notNull(),
    reviewer: varchar("reviewer", { length: 64 }),
    reviewedAt: timestamp("reviewedAt"),
    reviewSubtype: varchar("reviewSubtype", { length: 64 }),
    reviewTagsJson: text("reviewTagsJson"),
    reviewNote: text("reviewNote"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    runReviewIdx: index("idx_label_proposals_run_review").on(table.runId, table.reviewStatus),
    tokenChainAddressIdx: index("idx_label_proposals_token_chain_address").on(table.tokenId, table.chain, table.address),
    labelIdx: index("idx_label_proposals_label").on(table.proposedLabel),
  })
);

export type AddressLabelProposal = typeof addressLabelProposals.$inferSelect;
export type InsertAddressLabelProposal = typeof addressLabelProposals.$inferInsert;

/**
 * 地址标签生产表
 */
export const addressLabels = mysqlTable(
  "addressLabels",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    tokenId: bigint("tokenId", { mode: "number" }).notNull(),
    chain: varchar("chain", { length: 64 }).notNull(),
    address: varchar("address", { length: 128 }).notNull(),
    label: varchar("label", { length: 64 }).notNull(),
    subtype: varchar("subtype", { length: 64 }),
    tagsJson: text("tagsJson"),
    confidence: decimal("confidence", { precision: 6, scale: 4 }).notNull(),
    sourceProposalId: varchar("sourceProposalId", { length: 64 }).notNull(),
    approvedBy: varchar("approvedBy", { length: 64 }).notNull(),
    approvedAt: timestamp("approvedAt").notNull(),
    supersededBy: varchar("supersededBy", { length: 64 }),
    isActive: boolean("isActive").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tokenChainActiveIdx: index("idx_address_labels_token_chain_active").on(table.tokenId, table.chain, table.isActive),
    tokenLabelActiveIdx: index("idx_address_labels_token_label_active").on(table.tokenId, table.label, table.isActive),
    addressIdx: index("idx_address_labels_chain_address").on(table.chain, table.address),
  })
);

export type AddressLabel = typeof addressLabels.$inferSelect;
export type InsertAddressLabel = typeof addressLabels.$inferInsert;
