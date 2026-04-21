import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, bigint, decimal } from "drizzle-orm/mysql-core";

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
