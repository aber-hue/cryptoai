import { ENV } from "../_core/env";
import { callDataApi } from "../_core/dataApi";
import {
  getOnchainFundFlowBySymbol,
  getOnchainHoldersBySymbol,
  getOnchainLargeTransfersBySymbol,
  getOnchainCexFlowsBySymbol,
  getOnchainOverviewBySymbol,
  getRecentListingsByExchanges,
  screenTokensByDailyBullishStreak,
  getTokenDepthTrendBySymbol,
  getTokenDepthViewBySymbol,
  getTokenFundingViewBySymbol,
  getTokenKlineBySymbol,
  getTokenListingViewBySymbol,
  getTokenProfileBySymbol,
  getTokenSocialHeatViewBySymbol,
  getTokenUnlockViewBySymbol,
  getExchangeHoldersViewBySymbol,
  listMarketTokens,
  searchAnnouncements,
} from "../liveData";
import * as db from "../db";
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

// ─────────────────────────────────────────────
// 新增工具：覆盖剩余数据边界
// ─────────────────────────────────────────────

/** 工具1：K线 / 价格历史 */
export async function runKlineTool(
  symbol: string,
  range: "1m" | "3m" | "6m" | "1y" = "3m"
): Promise<ChatToolResult | null> {
  const data = await getTokenKlineBySymbol(symbol, range);
  if (!data || data.points.length === 0) return null;

  const first = data.points[0];
  const last = data.points.at(-1);
  const startPrice = first?.close ?? first?.open ?? null;
  const endPrice = last?.close ?? null;
  const changePct =
    startPrice && endPrice && startPrice > 0
      ? (((endPrice - startPrice) / startPrice) * 100).toFixed(2)
      : null;

  const highs = data.points.map(p => p.high ?? 0).filter(Boolean);
  const lows = data.points.map(p => p.low ?? 0).filter(Boolean);
  const periodHigh = highs.length > 0 ? Math.max(...highs) : null;
  const periodLow = lows.length > 0 ? Math.min(...lows) : null;

  return {
    toolName: "get_token_kline",
    title: `${symbol.toUpperCase()} K线 (${range})`,
    source: data.source,
    summary: [
      `共 ${data.points.length} 根K线，时间范围 ${first?.time ?? "?"} ~ ${last?.time ?? "?"}`,
      startPrice != null && endPrice != null
        ? `区间涨跌 ${changePct}%，起点 ${formatNumber(startPrice)}，终点 ${formatNumber(endPrice)}`
        : "价格数据不完整",
      periodHigh != null ? `区间最高 ${formatNumber(periodHigh)}，最低 ${formatNumber(periodLow)}` : "",
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具2：融资轮次 / 投资人 / 团队 */
export async function runFundingRoundsTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getTokenFundingViewBySymbol(symbol);
  if (!data) return null;

  const visibleRounds = data.rounds.filter(r => !r.isHidden);
  const topRound = visibleRounds[0] ?? null;
  const investorNames = visibleRounds
    .flatMap(r => r.investors)
    .filter(Boolean)
    .slice(0, 6);

  return {
    toolName: "get_funding_rounds",
    title: `${symbol.toUpperCase()} 融资与团队`,
    source: "token_funding_rounds + token_team_members",
    summary: [
      `累计融资 ${formatNumber(data.summary.totalRaised)}，共 ${visibleRounds.length} 轮，${data.summary.investorCount} 位投资人`,
      topRound
        ? `最近一轮：${topRound.roundType ?? topRound.kind ?? "未知类型"} (${topRound.roundDate ?? "日期未知"})，融资 ${formatNumber(topRound.raise)}，估值 ${formatNumber(topRound.valuation)}`
        : "",
      investorNames.length > 0 ? `主要投资方：${investorNames.join("、")}` : "",
      data.teamMembers.length > 0 ? `核心团队 ${data.teamMembers.length} 人` : "",
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具3：Twitter / 社交热度 */
export async function runSocialHeatTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getTokenSocialHeatViewBySymbol(symbol);
  if (!data) return null;

  const s = data.summary;
  const topTweet = data.tweets[0] ?? null;

  return {
    toolName: "get_social_heat",
    title: `${symbol.toUpperCase()} 社交热度`,
    source: "token_social_posts (Twitter)",
    summary: [
      `7天提及 ${s.mentionCount7d} 次，24h ${s.mentionCount24h} 次，独立作者 ${s.uniqueAuthors7d} 人`,
      `7天总互动 ${formatNumber(s.totalEngagement7d)}，总浏览 ${formatNumber(s.totalViews7d)}`,
      topTweet
        ? `最新热帖：@${topTweet.author.username} (${topTweet.author.followerCount?.toLocaleString() ?? "?"} 粉丝)，赞 ${topTweet.likeCount}，转发 ${topTweet.retweetCount}`
        : "",
      s.summaryText ? `概况：${s.summaryText}` : "",
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具4：链上大额转账明细 */
export async function runLargeTransfersTool(
  symbol: string,
  pageSize = 20
): Promise<ChatToolResult | null> {
  const data = await getOnchainLargeTransfersBySymbol(symbol, { page: 1, pageSize });
  if (!data || data.items.length === 0) return null;

  const latest = data.items[0];
  const totalValue = data.items.reduce((sum, item) => sum + (item.value ?? 0), 0);

  return {
    toolName: "get_large_transfers",
    title: `${symbol.toUpperCase()} 大额转账`,
    source: "bigquery.token_transfer_raw (large)",
    summary: [
      `共 ${data.total} 笔大额转账，阈值 ${formatNumber(data.thresholdAmount)} 个代币`,
      latest
        ? `最新一笔：${latest.fromLabel || latest.fromAddress.slice(0, 8)} → ${latest.toLabel || latest.toAddress.slice(0, 8)}，金额 ${formatNumber(latest.amount)}，时间 ${latest.blockTime ?? "未知"}`
        : "",
      `本页 ${data.items.length} 笔估算总价值 ${formatNumber(totalValue)}`,
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具5：CEX 净流入 / 流出（链上交易所资金流） */
export async function runCexFlowTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getOnchainCexFlowsBySymbol(symbol);
  if (!data) return null;

  const latestDay = data.days[0] ?? null;
  const netflowSign = data.totalNetflow >= 0 ? "净流入" : "净流出";

  return {
    toolName: "get_cex_flow",
    title: `${symbol.toUpperCase()} 交易所链上资金流`,
    source: "bigquery.token_transfer_raw (cex-tagged)",
    summary: [
      `统计 ${data.dayCount} 天，总流入 ${formatNumber(data.totalInflow)}，总流出 ${formatNumber(data.totalOutflow)}，${netflowSign} ${formatNumber(Math.abs(data.totalNetflow))}`,
      latestDay
        ? `最新一天 (${latestDay.date})：流入 ${formatNumber(latestDay.inflow)}，流出 ${formatNumber(latestDay.outflow)}，净流 ${formatSignedNumber(latestDay.netflow)}，涉及 ${latestDay.exchangeCount} 个交易所`
        : "",
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具6：链上持仓总览（集中度 / 增减变化） */
export async function runOnchainOverviewTool(symbol: string): Promise<ChatToolResult | null> {
  const data = await getOnchainOverviewBySymbol(symbol);
  if (!data) return null;

  const topIncreaser = data.increaseRows[0] ?? null;
  const topDecreaser = data.decreaseRows[0] ?? null;

  return {
    toolName: "get_onchain_overview",
    title: `${symbol.toUpperCase()} 链上持仓总览`,
    source: "bigquery.token_holder_snapshot (overview)",
    summary: [
      `Holder 数 ${formatNumber(data.tokenHolderCount)}，24h 变化 ${formatSignedNumber(data.holderCountChange24h)}`,
      data.top10Ratio != null
        ? `Top10 持仓占比 ${data.top10Ratio.toFixed(2)}%，Top50 ${data.top50Ratio?.toFixed(2) ?? "N/A"}%，Top100 ${data.top100Ratio?.toFixed(2) ?? "N/A"}%`
        : "",
      topIncreaser ? `增仓最多：${topIncreaser.label || topIncreaser.address.slice(0, 8)}，加仓 ${formatNumber(topIncreaser.changeBalance)}` : "",
      topDecreaser ? `减仓最多：${topDecreaser.label || topDecreaser.address.slice(0, 8)}，减仓 ${formatNumber(Math.abs(topDecreaser.changeBalance))}` : "",
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      ...data,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具7：市场代币筛选（排行 / 条件筛选） */
export async function runMarketScreenerTool(options: {
  query?: string;
  marketType?: "spot" | "perps";
  sortBy?: "listedAt" | "marketCap" | "volume24h";
  sortOrder?: "asc" | "desc";
  limit?: number;
}): Promise<ChatToolResult | null> {
  const data = await listMarketTokens({
    query: options.query,
    marketType: options.marketType,
    sortBy: options.sortBy ?? "volume24h",
    sortOrder: options.sortOrder ?? "desc",
    page: 1,
    pageSize: Math.min(options.limit ?? 20, 50),
  });

  if (data.items.length === 0) return null;

  const top3 = data.items
    .slice(0, 3)
    .map(item => `${item.symbol}(${formatNumber(item.volume24h)}V)`)
    .join("、");

  const sortLabel: Record<string, string> = {
    volume24h: "24h成交量",
    marketCap: "市值",
    listedAt: "上线时间",
  };

  return {
    toolName: "screen_market_tokens",
    title: "市场代币筛选",
    source: "token_profiles + exchange_pairs",
    summary: [
      `按 ${sortLabel[options.sortBy ?? "volume24h"]} ${options.sortOrder === "asc" ? "升序" : "降序"}，共命中 ${data.total} 个代币`,
      options.marketType ? `市场类型：${options.marketType}` : "",
      `前3名：${top3}`,
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      items: data.items.map(item => ({
        symbol: item.symbol,
        name: item.name,
        price: item.price,
        volume24h: item.volume24h,
        marketCap: item.marketCap,
        fdv: item.fdv,
        listedAt: item.listedAt,
      })),
      total: data.total,
      sortBy: options.sortBy ?? "volume24h",
      sortOrder: options.sortOrder ?? "desc",
      marketType: options.marketType ?? null,
      fetchedAt: timestamp(),
    },
  };
}

/** 工具8：当前信号事件列表 */
export async function runSignalEventsTool(options?: {
  symbol?: string;
  category?: string;
  status?: "new" | "active" | "muted" | "expired";
  limit?: number;
}): Promise<ChatToolResult | null> {
  const events = await db.listSignalEvents({
    symbol: options?.symbol,
    category: options?.category,
    status: options?.status ?? "new",
    limit: options?.limit ?? 30,
  });

  if (events.length === 0) return null;

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const e of events) {
    bySeverity[e.severity] = (bySeverity[e.severity] ?? 0) + 1;
  }

  const topEvent = events[0];
  const symbolSet = Array.from(new Set(events.map(e => e.symbol))).slice(0, 5);

  return {
    toolName: "get_signal_events",
    title: options?.symbol ? `${options.symbol.toUpperCase()} 信号事件` : "当前信号看板",
    source: "signal_events",
    summary: [
      `共 ${events.length} 条信号，高危 ${bySeverity.high}、中危 ${bySeverity.medium}、低危 ${bySeverity.low}`,
      topEvent
        ? `最新：${topEvent.symbol} — ${topEvent.title}（${topEvent.severity}），触发于 ${topEvent.triggeredAt}`
        : "",
      symbolSet.length > 1 ? `涉及代币：${symbolSet.join("、")}等` : "",
    ]
      .filter(Boolean)
      .join("；"),
    data: {
      events: events.map(e => ({
        id: e.id,
        symbol: e.symbol,
        signalType: e.signalType,
        title: e.title,
        summary: e.summary,
        category: e.category,
        severity: e.severity,
        status: e.status,
        direction: e.direction,
        window: e.window,
        triggeredAt: e.triggeredAt,
        changePct: e.changePct,
        latestMetricValue: e.latestMetricValue,
      })),
      total: events.length,
      fetchedAt: timestamp(),
    },
  };
}
