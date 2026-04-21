import { eq, desc, and, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { nanoid } from "nanoid";
import { 
  InsertUser, 
  users, 
  coins, 
  exchanges, 
  listings, 
  activities, 
  tokenUnlocks,
  addressHoldings,
  chatArtifacts,
  chatConversations,
  chatMessages,
  InsertCoin,
  InsertExchange,
  InsertListing,
  InsertActivity,
  InsertTokenUnlock,
  InsertAddressHolding,
  type InsertChatArtifact,
  type InsertChatConversation,
  type InsertChatMessage,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ==================== Coin Queries ====================

export async function getAllCoins() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(coins).orderBy(desc(coins.marketCap));
}

export async function getCoinById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(coins).where(eq(coins.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createCoin(coin: InsertCoin) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(coins).values(coin);
  return coin;
}

export async function updateCoin(id: string, updates: Partial<InsertCoin>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(coins).set(updates).where(eq(coins.id, id));
}

export async function deleteCoin(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(coins).where(eq(coins.id, id));
}

// ==================== Exchange Queries ====================

export async function getAllExchanges() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(exchanges).orderBy(exchanges.name);
}

export async function getExchangeById(id: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(exchanges).where(eq(exchanges.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function createExchange(exchange: InsertExchange) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(exchanges).values(exchange);
  return exchange;
}

export async function updateExchange(id: string, updates: Partial<InsertExchange>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(exchanges).set(updates).where(eq(exchanges.id, id));
}

export async function deleteExchange(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(exchanges).where(eq(exchanges.id, id));
}

// ==================== Listing Queries ====================

export async function getListingsByCoinId(coinId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(listings).where(eq(listings.coinId, coinId));
}

export async function getListingsByExchangeId(exchangeId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(listings).where(eq(listings.exchangeId, exchangeId));
}

export async function getListingByCoinAndExchange(coinId: string, exchangeId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(listings)
    .where(and(eq(listings.coinId, coinId), eq(listings.exchangeId, exchangeId)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getAllListings() {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(listings).orderBy(desc(listings.createdAt));
}

export async function createListing(listing: InsertListing) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(listings).values(listing);
  return result;
}

export async function updateListing(id: number, updates: Partial<InsertListing>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(listings).set(updates).where(eq(listings.id, id));
}

export async function deleteListing(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(listings).where(eq(listings.id, id));
}

// ==================== Activity Queries ====================

export async function getActivitiesByCoinId(coinId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(activities)
    .where(eq(activities.coinId, coinId))
    .orderBy(desc(activities.publishTime));
}

export async function getActivitiesByExchangeId(exchangeId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(activities)
    .where(eq(activities.exchangeId, exchangeId))
    .orderBy(desc(activities.publishTime));
}

export async function getActivitiesByCoinAndExchange(coinId: string, exchangeId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(activities)
    .where(and(eq(activities.coinId, coinId), eq(activities.exchangeId, exchangeId)))
    .orderBy(desc(activities.publishTime));
}

export async function createActivity(activity: InsertActivity) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(activities).values(activity);
  return activity;
}

export async function deleteActivity(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(activities).where(eq(activities.id, id));
}

// ==================== Free Chat Persistence ====================

export async function listChatConversationsByOwner(ownerOpenId: string) {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.ownerOpenId, ownerOpenId))
    .orderBy(desc(chatConversations.updatedAt));
}

export async function getChatConversationById(id: string, ownerOpenId: string) {
  const db = await getDb();
  if (!db) return null;

  const conversationRows = await db
    .select()
    .from(chatConversations)
    .where(and(eq(chatConversations.id, id), eq(chatConversations.ownerOpenId, ownerOpenId)))
    .limit(1);

  const conversation = conversationRows[0];
  if (!conversation) return null;

  const messages = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, id))
    .orderBy(chatMessages.createdAt);

  const artifacts = await db
    .select()
    .from(chatArtifacts)
    .where(eq(chatArtifacts.conversationId, id))
    .orderBy(desc(chatArtifacts.createdAt));

  return {
    conversation,
    messages,
    artifacts,
  };
}

export async function upsertChatConversation(input: {
  conversationId?: string;
  ownerOpenId: string;
  title: string;
  detectedSymbol?: string | null;
  taskType: string;
  summary?: string | null;
  stateJson?: string | null;
}) {
  const db = await getDb();
  if (!db) return { id: input.conversationId ?? nanoid(16) };

  const id = input.conversationId ?? nanoid(16);
  const values: InsertChatConversation = {
    id,
    ownerOpenId: input.ownerOpenId,
    title: input.title,
    detectedSymbol: input.detectedSymbol ?? null,
    taskType: input.taskType,
    summary: input.summary ?? null,
    stateJson: input.stateJson ?? null,
  };

  await db.insert(chatConversations).values(values).onDuplicateKeyUpdate({
    set: {
      title: values.title,
      detectedSymbol: values.detectedSymbol,
      taskType: values.taskType,
      summary: values.summary,
      stateJson: values.stateJson,
      updatedAt: new Date(),
    },
  });

  return { id };
}

export async function replaceChatMessages(input: {
  conversationId: string;
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}) {
  const db = await getDb();
  if (!db) return;

  await db.delete(chatMessages).where(eq(chatMessages.conversationId, input.conversationId));

  if (input.messages.length === 0) return;

  const values: InsertChatMessage[] = input.messages.map((message, index) => ({
    id: `${input.conversationId}-msg-${index + 1}-${nanoid(6)}`,
    conversationId: input.conversationId,
    role: message.role,
    content: message.content,
  }));

  await db.insert(chatMessages).values(values);
}

export async function replaceChatArtifacts(input: {
  conversationId: string;
  artifacts: Array<{
    id?: string;
    name: string;
    type: "report" | "table" | "csv";
    status: "ready" | "generating";
    summary?: string | null;
    content?: string | null;
  }>;
}) {
  const db = await getDb();
  if (!db) return;

  await db.delete(chatArtifacts).where(eq(chatArtifacts.conversationId, input.conversationId));

  if (input.artifacts.length === 0) return;

  const values: InsertChatArtifact[] = input.artifacts.map((artifact, index) => ({
    id: artifact.id ?? `${input.conversationId}-artifact-${index + 1}`,
    conversationId: input.conversationId,
    name: artifact.name,
    type: artifact.type,
    status: artifact.status,
    summary: artifact.summary ?? null,
    content: artifact.content ?? null,
  }));

  await db.insert(chatArtifacts).values(values);
}

export async function getChatArtifactById(id: string, ownerOpenId: string) {
  const db = await getDb();
  if (!db) return null;

  const rows = await db
    .select({
      id: chatArtifacts.id,
      conversationId: chatArtifacts.conversationId,
      name: chatArtifacts.name,
      type: chatArtifacts.type,
      status: chatArtifacts.status,
      summary: chatArtifacts.summary,
      content: chatArtifacts.content,
      createdAt: chatArtifacts.createdAt,
      updatedAt: chatArtifacts.updatedAt,
    })
    .from(chatArtifacts)
    .innerJoin(chatConversations, eq(chatConversations.id, chatArtifacts.conversationId))
    .where(and(eq(chatArtifacts.id, id), eq(chatConversations.ownerOpenId, ownerOpenId)))
    .limit(1);

  return rows[0] ?? null;
}

// ==================== TokenUnlock Queries ====================

export async function getTokenUnlocksByCoinId(coinId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(tokenUnlocks)
    .where(eq(tokenUnlocks.coinId, coinId))
    .orderBy(tokenUnlocks.unlockDate);
}

export async function createTokenUnlock(unlock: InsertTokenUnlock) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(tokenUnlocks).values(unlock);
  return unlock;
}

export async function deleteTokenUnlock(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(tokenUnlocks).where(eq(tokenUnlocks.id, id));
}

// ==================== Dashboard Queries ====================

export async function getRecentListings(limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select({
      listing: listings,
      coin: coins,
      exchange: exchanges,
    })
    .from(listings)
    .leftJoin(coins, eq(listings.coinId, coins.id))
    .leftJoin(exchanges, eq(listings.exchangeId, exchanges.id))
    .orderBy(desc(listings.spotListingTime))
    .limit(limit);
}

export async function getExchangeStats() {
  const db = await getDb();
  if (!db) return [];
  
  return await db
    .select({
      exchangeId: exchanges.id,
      exchangeName: exchanges.name,
      exchangeLogo: exchanges.logoUrl,
      totalListings: sql<number>`COUNT(DISTINCT ${listings.coinId})`,
      totalVolume24h: sql<number>`SUM(${listings.currentVolume24h})`,
    })
    .from(exchanges)
    .leftJoin(listings, eq(exchanges.id, listings.exchangeId))
    .groupBy(exchanges.id, exchanges.name, exchanges.logoUrl);
}

// ==================== AddressHolding Queries ====================

export async function getAddressHoldingsByCoinId(coinId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(addressHoldings)
    .where(eq(addressHoldings.coinId, coinId))
    .orderBy(desc(addressHoldings.balance));
}

export async function getExchangeAddressHoldings(coinId: string) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(addressHoldings)
    .where(and(eq(addressHoldings.coinId, coinId), eq(addressHoldings.isExchange, true)))
    .orderBy(desc(addressHoldings.balance));
}

export async function getNonExchangeAddressHoldings(coinId: string, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(addressHoldings)
    .where(and(eq(addressHoldings.coinId, coinId), eq(addressHoldings.isExchange, false)))
    .orderBy(desc(addressHoldings.balance))
    .limit(limit);
}

export async function createAddressHolding(holding: InsertAddressHolding) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(addressHoldings).values(holding);
  return holding;
}

export async function deleteAddressHolding(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(addressHoldings).where(eq(addressHoldings.id, id));
}
