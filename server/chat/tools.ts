import { ENV } from "../_core/env";
import { callDataApi } from "../_core/dataApi";
import {
  getOnchainFundFlowBySymbol,
  getOnchainHoldersBySymbol,
  getRecentListingsByExchanges,
  screenTokensByDailyBullishStreak,
  getTokenDepthTrendBySymbol,
  getTokenDepthViewBySymbol,
  getTokenListingViewBySymbol,
  getTokenProfileBySymbol,
  getTokenUnlockViewBySymbol,
  searchAnnouncements,
} from "../liveData";
import type { ChatToolResult } from "./types";

const timestamp = () => new Date().toISOString();

export async function runProfileTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getTokenProfileBySymbol(symbol);
  if (!data) return null;

  return {
    toolName: "get_token_profile",
    title: `${data.symbol} 基础画像`,
    source: "token_profiles",
    summary: [
      `${data.symbol} 当前价格 ${formatNumber(data.currentPrice)}`,
      `24h 交易量 ${formatNumber(data.volume24h)}`,
      `市值 ${formatNumber(data.marketCap)}`,
      `FDV ${formatNumber(data.fdv)}`,
      `持币地址数 ${formatNumber(data.tokenHolderCount)}`,
    ].join("，"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runUnlockTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getTokenUnlockViewBySymbol(symbol);
  if (!data) return null;

  const nextUnlock = data.rows.find(row => row.monthlyTotalRelease && row.monthlyTotalRelease > 0) ?? null;

  return {
    toolName: "get_token_unlock_view",
    title: `${symbol.toUpperCase()} 解锁视图`,
    source: "token_unlocks + token_allocation",
    summary: nextUnlock
      ? `最近一期解锁在 ${nextUnlock.unlockDate}，释放 ${formatNumber(nextUnlock.monthlyTotalRelease)}，占总供应 ${formatPercent(nextUnlock.monthlyReleaseRatio)}`
      : "未查到有效解锁排期",
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runListingTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getTokenListingViewBySymbol(symbol);
  if (!data) return null;

  const latest = data.items[0] ?? null;
  return {
    toolName: "get_token_listing_view",
    title: `${symbol.toUpperCase()} 上线与活动`,
    source: "exchange_listings + exchange_activities",
    summary: latest
      ? `最近事件为 ${latest.exchangeName} 的${latest.eventType === "listing" ? "上线" : "活动"}，时间 ${latest.date ?? "未知"}`
      : "未查到上线或活动记录",
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runAnnouncementSearchTool(
  query: string,
  symbol?: string
): Promise<ChatToolResult | null> {
  const data = await searchAnnouncements({
    query,
    symbol,
    limit: 8,
  });

  if (data.items.length === 0) return null;

  const latest = data.items[0];
  return {
    toolName: "search_announcements",
    title: symbol ? `${symbol.toUpperCase()} 公告搜索` : "公告搜索",
    source: "exchange_announcements",
    summary: `共匹配 ${data.total} 条公告，最新一条为 ${latest.title}，发布时间 ${latest.publishedAt ?? "未知"}`,
    data: {
      ...data,
      fetchedAt: timestamp(),
      query,
      symbol: symbol ?? null,
    },
  };
}

export async function runExchangeRecentListingsTool(options: {
  exchangeSlugs: string[];
  days?: number;
  marketType?: "spot" | "perps" | null;
}): Promise<ChatToolResult | null> {
  const rawData = await getRecentListingsByExchanges(options);
  const data = {
    ...rawData,
    items: rawData.items.filter(item => matchesListingMarketType(item.title, options.marketType ?? null)),
  };
  if (data.items.length === 0) return null;

  const exchangesLabel = options.exchangeSlugs.map(toExchangeLabel).join(" / ");
  const latest = data.items[0];

  return {
    toolName: "get_exchange_recent_listings",
    title: `${exchangesLabel} 最近上币`,
    source: "exchange_announcements",
    summary: `最近 ${options.days ?? 60} 天共命中 ${data.total} 条上币公告，最新一条是 ${latest.exchangeName} 的 ${latest.title}`,
    data: {
      ...data,
      days: options.days ?? 60,
      exchangeSlugs: options.exchangeSlugs,
      marketType: options.marketType ?? null,
      fetchedAt: timestamp(),
    },
  };
}

export async function runExchangeListingFilterTool(options: {
  includeExchanges: string[];
  excludeExchanges: string[];
  days: number;
  marketType?: "spot" | "perps" | null;
}) {
  const allExchanges = Array.from(new Set([...options.includeExchanges, ...options.excludeExchanges]));
  const data = await getRecentListingsByExchanges({
    exchangeSlugs: allExchanges,
    days: options.days,
    limit: 200,
  });

  if (data.items.length === 0) return null;

  const listingMap = new Map<
    string,
    {
      symbol: string;
      title: string;
      exchanges: Set<string>;
      events: Array<{
        exchangeSlug: string | null;
        exchangeName: string;
        publishedAt: string | null;
        title: string;
        url: string | null;
      }>;
    }
  >();

  for (const item of data.items) {
    if (!matchesListingMarketType(item.title, options.marketType ?? null)) continue;
    const symbol = extractListingSymbol(item.title);
    if (!symbol || !item.exchangeSlug) continue;
    const current = listingMap.get(symbol) ?? {
      symbol,
      title: item.title,
      exchanges: new Set<string>(),
      events: [],
    };
    current.exchanges.add(item.exchangeSlug);
    current.events.push({
      exchangeSlug: item.exchangeSlug,
      exchangeName: item.exchangeName,
      publishedAt: item.publishedAt,
      title: item.title,
      url: item.url,
    });
    listingMap.set(symbol, current);
  }

  const matched = Array.from(listingMap.values()).filter(entry => {
    const hasAllIncluded = options.includeExchanges.every(exchange => entry.exchanges.has(exchange));
    const hasAnyExcluded = options.excludeExchanges.some(exchange => entry.exchanges.has(exchange));
    return hasAllIncluded && !hasAnyExcluded;
  });

  const includedLabel = options.includeExchanges.map(toExchangeLabel).join(" + ");
  const excludedLabel = options.excludeExchanges.map(toExchangeLabel).join(" + ");

  return {
    toolName: "filter_exchange_listings",
    title: "交易所上币筛选",
    source: "exchange_announcements",
    summary:
      excludedLabel.length > 0
        ? `最近 ${options.days} 天里，同时上了 ${includedLabel}、但没有上 ${excludedLabel} 的代币共 ${matched.length} 个`
        : `最近 ${options.days} 天里，同时上了 ${includedLabel} 的代币共 ${matched.length} 个`,
    data: {
      days: options.days,
      marketType: options.marketType ?? null,
      includeExchanges: options.includeExchanges,
      excludeExchanges: options.excludeExchanges,
      matched: matched.map(item => ({
        symbol: item.symbol,
        exchanges: Array.from(item.exchanges),
        events: item.events.sort((left, right) => {
          const leftTs = left.publishedAt ? new Date(left.publishedAt).getTime() : 0;
          const rightTs = right.publishedAt ? new Date(right.publishedAt).getTime() : 0;
          return rightTs - leftTs;
        }),
      })),
      fetchedAt: timestamp(),
    },
  } satisfies ChatToolResult;
}

export async function runDepthViewTool(
  symbol: string,
  marketType?: "spot" | "perps"
): Promise<ChatToolResult | null> {
  const data = await getTokenDepthViewBySymbol(symbol, marketType);
  if (!data) return null;

  const topVenue = [...data.items]
    .sort((left, right) => (right.volume24h ?? 0) - (left.volume24h ?? 0))
    .at(0);

  return {
    toolName: "get_token_depth_view",
    title: `${symbol.toUpperCase()} 深度快照`,
    source: "exchange_pairs",
    summary: topVenue
      ? `成交量最高的场所在 ${topVenue.exchangeName}，24h 成交量 ${formatNumber(topVenue.volume24h)}，买盘深度 ${formatNumber(topVenue.depthBuy2)}，卖盘深度 ${formatNumber(topVenue.depthSell2)}`
      : "未查到有效深度快照",
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runDepthTrendTool(
  symbol: string,
  marketType?: "spot" | "perps"
): Promise<ChatToolResult | null> {
  const data = await getTokenDepthTrendBySymbol(symbol, 14, marketType);
  if (!data) return null;

  const firstPoint = data.points[0] ?? null;
  const lastPoint = data.points.at(-1) ?? null;
  const buyDelta =
    firstPoint?.totalDepthBuy2 != null && lastPoint?.totalDepthBuy2 != null
      ? lastPoint.totalDepthBuy2 - firstPoint.totalDepthBuy2
      : null;

  return {
    toolName: "get_token_depth_trend",
    title: `${symbol.toUpperCase()} 深度趋势`,
    source: "token_trade_depth_daily + token_trade_depth_snapshot",
    summary: lastPoint
      ? `最近 ${data.points.length} 个样本点里，最新买盘深度 ${formatNumber(lastPoint.totalDepthBuy2)}，卖盘深度 ${formatNumber(lastPoint.totalDepthSell2)}，买盘变化 ${formatSignedNumber(buyDelta)}`
      : "未查到深度趋势数据",
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runOnchainHoldersTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getOnchainHoldersBySymbol(symbol, { page: 1, pageSize: 20 });
  if (!data) return null;

  const topHolder = data.items[0] ?? null;
  return {
    toolName: "get_onchain_holders",
    title: `${symbol.toUpperCase()} 链上持仓`,
    source: "bigquery.token_holder_snapshot",
    summary: topHolder
      ? `快照日 ${data.snapshotDate ?? "未知"}，Top1 地址余额 ${formatNumber(topHolder.balance)}，24h 变化 ${formatSignedNumber(topHolder.balanceChange24h)}`
      : "未查到链上 holder 快照",
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runOnchainFundFlowTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getOnchainFundFlowBySymbol(symbol, { depth: 3, limitPerLayer: 20 });
  if (!data) return null;

  const firstLayer = data.summaries.find(item => item.layer === 1) ?? null;
  return {
    toolName: "get_onchain_fund_flow",
    title: `${symbol.toUpperCase()} 链上资金流`,
    source: "bigquery.token_transfer_raw",
    summary: firstLayer
      ? `总扩散量 ${formatNumber(data.totalAmount)}，第一层地址 ${firstLayer.count} 个，累计流出 ${formatNumber(firstLayer.totalAmount)}`
      : `总扩散量 ${formatNumber(data.totalAmount)}`,
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

export async function runWebSearchTool(query: string): Promise<ChatToolResult | null> {
  const apiId = ENV.newsSearchApiId || ENV.webSearchApiId;
  if (!apiId) return null;

  try {
    const data = await callDataApi(apiId, {
      query: {
        q: query,
        query,
      },
    });

    const normalizedItems = normalizeSearchItems(data).slice(0, 6);
    if (normalizedItems.length === 0) return null;

    return {
      toolName: "search_web",
      title: "外部搜索",
      source: `data_api:${apiId}`,
      summary: `外部搜索命中 ${normalizedItems.length} 条结果，首条为 ${normalizedItems[0]?.title ?? "未知"}`,
      data: {
        query,
        items: normalizedItems,
        fetchedAt: timestamp(),
      },
    };
  } catch {
    return null;
  }
}

export async function runBullishStreakScreenTool(options?: {
  streakDays?: number;
  marketType?: "spot" | "perps";
  maxTokens?: number;
}): Promise<ChatToolResult | null> {
  const data = await screenTokensByDailyBullishStreak(options);
  if (data.scannedTokens === 0) return null;

  return {
    toolName: "screen_daily_bullish_streak",
    title: `连续 ${data.streakDays} 天日线收涨筛选`,
    source: "listMarketTokens + token_kline_api",
    summary: `扫描 ${data.scannedTokens} 个已收录代币，命中 ${data.matchedTokens} 个连续 ${data.streakDays} 天日线收涨的代币`,
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

function formatNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function formatPercent(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  return `${value.toFixed(2)}%`;
}

function formatSignedNumber(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "N/A";
  const formatted = formatNumber(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function normalizeSearchItems(data: unknown) {
  if (!data || typeof data !== "object") return [];

  const container = data as Record<string, unknown>;
  const candidates = [container.items, container.results, container.data].find(Array.isArray) as
    | Array<Record<string, unknown>>
    | undefined;

  if (!candidates) return [];

  return candidates
    .map(item => ({
      title: pickString(item, ["title", "name", "headline"]),
      url: pickString(item, ["url", "link"]),
      snippet: pickString(item, ["snippet", "summary", "description"]),
      publishedAt: pickString(item, ["publishedAt", "published_at", "time"]),
      source: pickString(item, ["source", "site", "domain"]),
    }))
    .filter(item => item.title || item.url);
}

function pickString(item: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toExchangeLabel(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (normalized === "upbit") return "Upbit";
  if (normalized === "bithumb") return "Bithumb";
  return normalized;
}

function extractListingSymbol(title: string) {
  const symbolInParens = title.match(/\(([A-Z0-9]{2,12})\)/);
  if (symbolInParens?.[1]) return symbolInParens[1];

  const leadingToken = title.match(/^([A-Za-z][A-Za-z0-9.+-]{1,20})\s/);
  if (leadingToken?.[1]) return leadingToken[1].toUpperCase();

  return null;
}

function matchesListingMarketType(title: string, marketType: "spot" | "perps" | null) {
  if (!marketType) return true;

  const upper = title.toUpperCase();
  const isPerps = /PERPETUAL|FUTURES|PERPS|CONTRACT/.test(upper);
  if (marketType === "perps") {
    return isPerps;
  }

  if (marketType === "spot") {
    return !isPerps;
  }

  return true;
}
