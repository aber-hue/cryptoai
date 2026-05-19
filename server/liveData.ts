import { BigQuery } from "@google-cloud/bigquery";
import axios from "axios";
import { createPool, type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";
import { createRequire } from "module";
import path from "path";
import { ENV } from "./_core/env";
import { getFeaturePool } from "./featureDb";

type MarketListInput = {
  query?: string;
  symbols?: string[];
  exchangeIds?: number[];
  marketType?: "all" | "spot" | "perps";
  sortBy?: "listedAt" | "marketCap" | "volume24h";
  sortOrder?: "asc" | "desc";
  page?: number;
  pageSize?: number;
};

type MarketWatchlistItem = {
  symbol: string;
  tokenId: number | null;
  tokenName: string | null;
  createdAt: string;
};

export type BinanceAlphaListingItem = {
  symbol: string;
  name: string | null;
  tokenId: number | null;
  pairName: string | null;
  listingTime: string | null;
  price: number | null;
  volume24h: number | null;
  marketCap: number | null;
  fdv: number | null;
  source: "internal_db" | "binance_api";
  url: string | null;
};

let marketWatchlistTableReady: Promise<void> | null = null;
const require = createRequire(import.meta.url);
const { HttpsProxyAgent } = require("https-proxy-agent") as {
  HttpsProxyAgent: new (proxyUrl: string) => any;
};
let outboundHttpsProxyAgent: any | null | undefined;

function getOutboundHttpsProxyAgent() {
  if (outboundHttpsProxyAgent !== undefined) return outboundHttpsProxyAgent;

  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null;

  outboundHttpsProxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;
  return outboundHttpsProxyAgent;
}

async function ensureMarketWatchlistTable() {
  if (!marketWatchlistTableReady) {
    marketWatchlistTableReady = (async () => {
      const featurePool = getFeaturePool();
      await featurePool.query(`
        CREATE TABLE IF NOT EXISTS market_watchlist_tokens (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
          token_symbol VARCHAR(32) NOT NULL,
          token_id BIGINT NULL,
          token_name VARCHAR(255) NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_market_watchlist_symbol (token_symbol)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch(error => {
      marketWatchlistTableReady = null;
      throw error;
    });
  }

  await marketWatchlistTableReady;
}

export async function listMarketWatchlist(): Promise<{ items: MarketWatchlistItem[] }> {
  await ensureMarketWatchlistTable();
  const featurePool = getFeaturePool();
  const [rows] = await featurePool.query<
    (RowDataPacket & {
      symbol: string;
      tokenId: number | null;
      tokenName: string | null;
      createdAt: string;
    })[]
  >(`
    SELECT
      token_symbol AS symbol,
      token_id AS tokenId,
      token_name AS tokenName,
      created_at AS createdAt
    FROM market_watchlist_tokens
    ORDER BY created_at DESC, token_symbol ASC
  `);

  return {
    items: rows.map(row => ({
      symbol: row.symbol,
      tokenId: row.tokenId != null ? Number(row.tokenId) : null,
      tokenName: row.tokenName,
      createdAt: row.createdAt,
    })),
  };
}

export async function toggleMarketWatchlist(input: {
  symbol: string;
  tokenId?: number | null;
  tokenName?: string | null;
}) {
  await ensureMarketWatchlistTable();
  const featurePool = getFeaturePool();
  const symbol = input.symbol.trim().toUpperCase();

  const [existingRows] = await featurePool.query<(RowDataPacket & { id: number })[]>(
    `SELECT id FROM market_watchlist_tokens WHERE token_symbol = ? LIMIT 1`,
    [symbol]
  );

  if (existingRows[0]) {
    await featurePool.query(`DELETE FROM market_watchlist_tokens WHERE token_symbol = ?`, [symbol]);
    return { watched: false as const };
  }

  await featurePool.query(
    `
      INSERT INTO market_watchlist_tokens (token_symbol, token_id, token_name)
      VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE
        token_id = VALUES(token_id),
        token_name = VALUES(token_name),
        updated_at = CURRENT_TIMESTAMP
    `,
    [symbol, input.tokenId ?? null, input.tokenName?.trim() || null]
  );

  return { watched: true as const };
}

function getMarketTypeFilterValues(marketType: MarketListInput["marketType"]) {
  if (marketType === "spot") {
    return ["spot", "alpha", "boost", "xlaunch"];
  }

  if (marketType === "perps") {
    return ["perps"];
  }

  return [];
}

type MarketTokenRow = {
  tokenId: number;
  symbol: string;
  name: string;
  logoUrl: string | null;
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
    exchangeLogoUrl: string | null;
    marketType: string | null;
    listingTime: string | null;
  }>;
};

type TokenProfileResult = {
  tokenId: number;
  symbol: string;
  name: string;
  slug: string | null;
  description: string | null;
  logoUrl: string | null;
  coinMarketCapId: string | null;
  coinGeckoId: string | null;
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
  allTimeHighPrice: number | null;
  allTimeHighAt: string | null;
  allTimeLowPrice: number | null;
  allTimeLowAt: string | null;
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
};

type TokenUnlockViewResult = {
  tokenId: number;
  categories: Array<{
    key: string;
    label: string;
    ratio: number;
  }>;
  rows: Array<{
    unlockDate: string;
    categoryValues: Record<string, number | null>;
    monthlyTotalRelease: number | null;
    monthlyReleaseRatio: number | null;
    cumulativeRelease: number | null;
    cumulativeReleaseRatio: number | null;
  }>;
};

type TokenListingViewResult = {
  tokenId: number;
  items: Array<{
    id: string;
    exchangeId: number | null;
    exchangeName: string;
    exchangeLogoUrl: string | null;
    marketType: string | null;
    eventType: "listing" | "activity";
    title: string;
    date: string | null;
    depositTime: string | null;
    priceAtList: number | null;
    fdvAtList: number | null;
    marketCapAtList: number | null;
    pairName: string | null;
    pricePost5m: number | null;
    pricePost15m: number | null;
    changePost15m: number | null;
    publisher: string | null;
    activityType: string | null;
    rewardToken: string | null;
    rewardAmount: number | null;
    estimatedValue: number | null;
    dilutionRatio: string | null;
    description: string | null;
    participationThreshold: string | null;
    operationSteps: string | null;
    endTime: string | null;
    rewardDistributionTime: string | null;
    publishedAt: string | null;
    url: string | null;
  }>;
};

type TokenKlineRange = "1m" | "3m" | "6m" | "1y";
const CMC_MAX_SAFE_HISTORICAL_DAYS = 89;

type TokenKlineResult = {
  tokenId: number;
  source: "coinmarketcap" | "coingecko";
  range: TokenKlineRange;
  points: Array<{
    time: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    marketCap: number | null;
  }>;
};

type TokenDepthViewResult = {
  tokenId: number;
  items: Array<{
    exchangeId: number;
    exchangeName: string;
    exchangeLogoUrl: string | null;
    marketType: string | null;
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
};

type TokenDepthTrendResult = {
  tokenId: number;
  summary: {
    latestPrice: number | null;
    totalVolume24h: number | null;
    totalDepthBuy2: number | null;
    totalDepthSell2: number | null;
    latestSnapshotTs: string | null;
  };
  points: Array<{
    snapshotDate: string;
    totalVolume: number | null;
    totalDepthBuy2: number | null;
    totalDepthSell2: number | null;
  }>;
};

type ExchangeDepthViewResult = {
  tokenId: number;
  exchangeId: number;
  exchangeName: string;
  marketType: string | null;
  timeframe: "1h" | "4h" | "12h" | "1d";
  points: Array<{
    snapshotDate: string;
    buyDepth: number | null;
    sellDepth: number | null;
    totalDepth: number | null;
    spread: number | null;
  }>;
};

type TokenHoldersViewResult = {
  tokenId: number;
  updatedAt: string | null;
  series: Array<{
    snapshotDate: string;
    totalOpenInterest: number | null;
    fundingRate: number | null;
  }>;
  items: Array<{
    exchangeId: number;
    exchangeName: string;
    exchangeLogoUrl: string | null;
    marketType: string | null;
    pairName: string | null;
    price: number | null;
    volume24h: number | null;
    marketShare: number | null;
    fundingRate: number | null;
    openInterest: number | null;
  }>;
};

type TokenFundingViewResult = {
  tokenId: number;
  summary: {
    totalRaised: number | null;
    latestRound: string | null;
    latestRoundDate: string | null;
    investorCount: number;
  };
  rounds: Array<{
    id: number;
    kind: string | null;
    roundType: string | null;
    roundDate: string | null;
    raise: number | null;
    valuation: number | null;
    announcementUrl: string | null;
    showOnlyYear: boolean;
    tokensForSale: number | null;
    priceUsd: number | null;
    lockupPeriod: string | null;
    roi: number | null;
    athRoi: number | null;
    isHidden: boolean;
    investors: string[];
    ieoPlatform: string | null;
    saleStatus: string | null;
  }>;
  teamMembers: Array<{
    id: number;
    name: string;
    logoUrl: string | null;
    jobs: string[];
    isFormer: boolean;
    links: Array<{
      label: string;
      url: string;
    }>;
    sortOrder: number;
  }>;
};

type TokenSocialHeatViewResult = {
  tokenId: number;
  summary: {
    mentionCount24h: number;
    mentionCount7d: number;
    uniqueAuthors7d: number;
    totalEngagement7d: number;
    totalViews7d: number;
    latestPublishedAt: string | null;
    summaryText: string;
  };
  tweets: Array<{
    id: number;
    tweetId: string;
    tweetUrl: string;
    content: string | null;
    publishedAt: string;
    replyCount: number;
    retweetCount: number;
    likeCount: number;
    quoteCount: number;
    viewCount: number | null;
    bookmarkCount: number | null;
    isRetweet: boolean;
    isQuote: boolean;
    isReply: boolean;
    lang: string | null;
    author: {
      username: string;
      userId: string;
      name: string | null;
      avatarUrl: string | null;
      followerCount: number | null;
      isBlueVerified: boolean;
      isVerified: boolean;
      description: string | null;
    };
    media: Array<{
      type: string;
      previewUrl: string | null;
    }>;
  }>;
};

type ExchangeHoldersViewResult = {
  tokenId: number;
  exchangeId: number;
  exchangeName: string;
  marketType: string | null;
  updatedAt: string | null;
  latestPrice: number | null;
  latestVolume24h: number | null;
  latestOpenInterest: number | null;
  latestFundingRate: number | null;
  series: Array<{
    snapshotDate: string;
    openInterest: number | null;
    fundingRate: number | null;
  }>;
  rows: Array<{
    snapshotDate: string;
    openInterest: number | null;
    fundingRate: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type OnchainFundFlowResult = {
  tokenId: number;
  tokenAddressId: number | null;
  totalAmount: number;
  nodes: Array<{
    id: string;
    layer: number;
    address: string;
    label: string;
    amount: number;
    currentBalance: number | null;
    kind: string;
    outgoingCount: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    amount: number;
    time: string | null;
    txhash: string | null;
  }>;
  summaries: Array<{
    layer: number;
    title: string;
    count: number;
    totalAmount: number;
  }>;
};

export type OnchainEarlyDistributionResult = {
  tokenId: number;
  tokenAddressId: number | null;
  tokenAddress: string | null;
  firstTransferAt: string | null;
  graphWindowEnd: string | null;
  behaviorWindowEnd: string | null;
  rootAddress: string | null;
  totalMintedAmount: number;
  nodes: Array<{
    address: string;
    layer: number;
    label: string;
    kind: string;
    isContract: boolean;
    currentBalance: number | null;
    incomingAmount: number;
    incomingTxCount: number;
    firstReceivedAt: string | null;
    parentAddresses: string[];
    outgoingAmountInBehaviorWindow: number;
    outgoingTxCountInBehaviorWindow: number;
    uniqueRecipientsInBehaviorWindow: number;
  }>;
  links: Array<{
    source: string;
    target: string;
    amount: number;
    time: string | null;
    txhash: string | null;
    layer: number;
  }>;
};

type OnchainHolderListResult = {
  tokenId: number;
  tokenAddressId: number | null;
  tokenAddress: string | null;
  snapshotDate: string | null;
  total: number;
  page: number;
  pageSize: number;
  items: Array<{
    address: string;
    label: string;
    kind: string;
    isContract: boolean;
    balance: number | null;
    rank: number | null;
    balanceChange24h: number | null;
    balanceChange7d: number | null;
    isNew: boolean;
  }>;
};

type OnchainLargeTransferListResult = {
  tokenId: number;
  tokenAddressId: number | null;
  tokenAddress: string | null;
  totalSupply: number | null;
  thresholdAmount: number | null;
  total: number;
  page: number;
  pageSize: number;
  sortOrder: "asc" | "desc";
  latestBlockTime: string | null;
  items: Array<{
    txhash: string;
    logIndex: number | null;
    blockTime: string | null;
    fromAddress: string;
    toAddress: string;
    fromLabel: string;
    toLabel: string;
    fromKind: string;
    toKind: string;
    amount: number | null;
    ratioOfSupply: number | null;
    value: number | null;
  }>;
};

type OnchainCexFlowResult = {
  tokenId: number;
  tokenAddressId: number | null;
  tokenAddress: string | null;
  totalInflow: number;
  totalOutflow: number;
  totalNetflow: number;
  dayCount: number;
  days: Array<{
    date: string;
    inflow: number;
    outflow: number;
    netflow: number;
    exchangeCount: number;
    exchanges: Array<{
      exchange: string;
      inflow: number;
      outflow: number;
      netflow: number;
      inflowTxCount: number;
      outflowTxCount: number;
    }>;
  }>;
};

type OnchainCexFlowTransferDetailsResult = {
  tokenId: number;
  tokenAddressId: number | null;
  tokenAddress: string | null;
  totalSupply: number | null;
  date: string;
  exchange: string;
  direction: "all" | "inflow" | "outflow";
  transferCount: number;
  totalAmount: number;
  items: Array<{
    txhash: string;
    logIndex: number | null;
    blockTime: string | null;
    fromAddress: string;
    toAddress: string;
    fromLabel: string;
    toLabel: string;
    fromKind: string;
    toKind: string;
    amount: number | null;
    ratioOfSupply: number | null;
    value: number | null;
  }>;
};

type OnchainPoolAddsResult = {
  tokenId: number;
  tokenAddressId: number | null;
  tokenAddress: string | null;
  total: number;
  earliestBlockTime: string | null;
  earliestStartedTime: string | null;
  items: Array<{
    poolRegistryId: string | null;
    poolId: string | null;
    poolAddress: string | null;
    txhash: string | null;
    blockTime: string | null;
    startedTime: string | null;
    traderAddress: string;
    recipientAddress: string | null;
    quoteTokenAddress: string | null;
    quoteTokenSymbol: string | null;
    token0Symbol: string | null;
    token1Symbol: string | null;
    actionType: string | null;
    eventName: string | null;
    tokenAmount: number | null;
    quoteTokenAmount: number | null;
    value: number | null;
    price: number | null;
    parseSource: string | null;
    parseReason: string | null;
    chainId: number | null;
  }>;
};

type OnchainPoolAddsByPoolResult = {
  poolRegistryId: string;
  poolId: string | null;
  poolAddress: string | null;
  total: number;
  earliestBlockTime: string | null;
  earliestStartedTime: string | null;
  items: OnchainPoolAddsResult["items"];
};

type AnnouncementSearchResult = {
  items: Array<{
    id: number;
    title: string;
    exchangeSlug: string | null;
    publishedAt: string | null;
    summary: string | null;
    url: string | null;
    type: "listing" | "delisting" | "event" | "other";
  }>;
  total: number;
};

type ExchangeListingAnnouncementResult = {
  items: Array<{
    id: number;
    exchangeSlug: string | null;
    exchangeName: string;
    title: string;
    publishedAt: string | null;
    url: string | null;
    summary: string | null;
  }>;
  total: number;
};

type ListingAnnouncementSearchResult = {
  items: Array<{
    id: string;
    tokenId: number;
    symbol: string;
    tokenName: string;
    exchangeId: number;
    exchangeName: string;
    exchangeSlug: string | null;
    marketType: string | null;
    pairName: string | null;
    depositTime: string | null;
    listingTime: string | null;
    announcementTitle: string | null;
    announcementUrl: string | null;
    publishedAt: string | null;
  }>;
  total: number;
};

type AvailableOnchainTokenResult = {
  items: Array<{
    tokenId: number;
    chainId: number | null;
    symbol: string;
    name: string;
    tokenAddressId: number | null;
    tokenAddress: string | null;
    transferCount: number;
    holderCount: number;
    dexActionCount: number;
  }>;
};

type AvailableOnchainPoolResult = {
  items: Array<{
    poolRegistryId: string | null;
    poolId: string | null;
    poolAddress: string | null;
    chainId: number | null;
    dexName: string | null;
    protocolVersion: string | null;
    coreTokenSymbol: string | null;
    coreTokenAddress: string | null;
    quoteTokenSymbol: string | null;
    quoteTokenAddress: string | null;
    token0Symbol: string | null;
    token0Address: string | null;
    token1Symbol: string | null;
    token1Address: string | null;
    poolLockTime: string | null;
    poolCreatedTime: string | null;
    startedTime: string | null;
    firstAddLiquidityTime: string | null;
    firstAddTraderAddress: string | null;
    firstAddTokenAmount: number | null;
    firstAddQuoteTokenAmount: number | null;
    firstAddValue: number | null;
    firstAddPrice: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
};

type OnchainOverviewResult = {
  tokenId: number;
  symbol: string;
  name: string;
  logoUrl: string | null;
  currentPrice: number | null;
  priceChange24h: number | null;
  totalSupply: number | null;
  circulatingSupply: number | null;
  marketCap: number | null;
  fdv: number | null;
  tokenHolderCount: number | null;
  holderCountChange24h: number | null;
  tokenAddress: string | null;
  holderSnapshotDate: string | null;
  top10Balance: number | null;
  top10Ratio: number | null;
  top50Balance: number | null;
  top50Ratio: number | null;
  top100Balance: number | null;
  top100Ratio: number | null;
  holderHistory: Array<{
    snapshotDate: string;
    holderCount: number;
  }>;
  increaseRows: Array<{
    address: string;
    label: string;
    kind: string;
    changeBalance: number;
    currentBalance: number | null;
    firstSeen: string | null;
  }>;
  decreaseRows: Array<{
    address: string;
    label: string;
    kind: string;
    changeBalance: number;
    currentBalance: number | null;
  }>;
};

const fallbackOnchainTokens: Record<
  string,
  {
    tokenId: number;
    addresses: string[];
  }
> = {
  BSB: {
    tokenId: 0,
    addresses: ["0x595deaad1eb5476ff1e649fdb7efc36f1e4679cc"],
  },
  GENIUS: {
    tokenId: 1522,
    addresses: ["0x1f12b85aac097e43aa1555b2881e98a51090e9a6"],
  },
  ST: {
    tokenId: 1248,
    addresses: ["0x70be40667385500c5da7f108a022e21b606045dd"],
  },
  ARIA: {
    tokenId: 1467,
    addresses: ["0x5d3a12c42e5372b2cc3264ab3cdcf660a1555238"],
  },
  UP: {
    tokenId: 1178,
    addresses: ["0x000008d2175f9aeaddb2430c26f8a6f73c5a0000"],
  },
  EDGE: {
    tokenId: 794,
    addresses: ["0x70f2eadf1ca1969ff42b0c78e9da519e8937cbaf"],
  },
  PRL: {
    tokenId: 1244,
    addresses: ["0xd20fb09a49a8e75fef536a2dbc68222900287bac"],
  },
  R2: {
    tokenId: 1295,
    addresses: ["0x223a20e1b83aa3832e78d4b7b132df022e739222"],
  },
  BASED: {
    tokenId: 1297,
    addresses: ["0x1d28d989f9e3ccb8b15d0cec601734514f958e4d"],
  },
  OPG: {
    tokenId: 1584,
    addresses: ["0x5feccd17c393caf1001d18164236a37e731fcb9d"],
  },
};

const ONCHAIN_CHAIN_NAME_HINTS: Record<number, string[]> = {
  1: ["eth", "ethereum"],
  56: ["bnb", "bsc", "binance"],
  8453: ["base"],
};

type ProfileRow = RowDataPacket & {
  tokenId: number;
  symbol: string;
  name: string;
  slug: string | null;
  description: string | null;
  logoUrl: string | null;
  coinMarketCapId: string | null;
  coinGeckoId: string | null;
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
  allTimeHighPrice: number | null;
  allTimeHighAt: string | null;
  allTimeLowPrice: number | null;
  allTimeLowAt: string | null;
  coinTagsRaw: string | null;
};

let pool: Pool | null = null;
let bigQueryClient: BigQuery | null = null;
let tokenProfilesOptionalColumnsPromise: Promise<Set<string>> | null = null;

function getPool() {
  if (pool) return pool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const url = new URL(databaseUrl);
  const options: PoolOptions = {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: url.searchParams.get("charset") ?? "utf8mb4",
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(url.searchParams.get("connection_limit") ?? 10),
  };

  pool = createPool(options);
  return pool;
}

async function getTokenProfilesOptionalColumns() {
  if (!tokenProfilesOptionalColumnsPromise) {
    tokenProfilesOptionalColumnsPromise = (async () => {
      const currentPool = getPool();
      const [rows] = await currentPool.query<(RowDataPacket & { Field: string })[]>("DESCRIBE token_profiles");
      return new Set(rows.map(row => String(row.Field)));
    })().catch(error => {
      tokenProfilesOptionalColumnsPromise = null;
      throw error;
    });
  }

  return await tokenProfilesOptionalColumnsPromise;
}

function getBigQueryClient() {
  if (bigQueryClient) return bigQueryClient;

  const projectId = process.env.BIGQUERY_PROJECT_ID;
  const keyFilename = process.env.BIGQUERY_CREDENTIALS_PATH;
  const credentialsJson =
    process.env.BIGQUERY_CREDENTIALS_JSON ??
    process.env.GOOGLE_CREDENTIALS_JSON ??
    process.env.GCP_SERVICE_ACCOUNT_JSON ??
    null;

  if (!projectId || (!keyFilename && !credentialsJson)) {
    throw new Error("BIGQUERY_PROJECT_ID and either BIGQUERY_CREDENTIALS_PATH or BIGQUERY_CREDENTIALS_JSON must be configured");
  }

  if (credentialsJson) {
    let credentials: Record<string, unknown>;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (error) {
      throw new Error(`Failed to parse BIGQUERY_CREDENTIALS_JSON: ${error instanceof Error ? error.message : "unknown error"}`);
    }

    bigQueryClient = new BigQuery({
      projectId,
      credentials,
    });
  } else {
    const safeKeyFilename = keyFilename as string;
    const resolvedKeyFilename = path.isAbsolute(safeKeyFilename)
      ? safeKeyFilename
      : path.resolve(process.cwd(), safeKeyFilename);

    bigQueryClient = new BigQuery({
      projectId,
      keyFilename: resolvedKeyFilename,
    });
  }

  return bigQueryClient;
}

function parseCoinTags(value: string | null) {
  if (!value) return [];
  return value
    .split(/[;,|]/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeUnlockCategory(value: string | null) {
  if (!value) return "Unspecified";

  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const SHANGHAI_DATE_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const UTC_OFFSETLESS_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?)?$/;

function parseDbUtcDate(value: string | Date | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = UTC_OFFSETLESS_DATE_RE.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildUtcBucketExpression(
  column: string,
  timeframe: "1h" | "4h" | "12h" | "1d"
) {
  const localTs = `DATE_ADD(${column}, INTERVAL 8 HOUR)`;

  if (timeframe === "1h") {
    return `DATE_FORMAT(${column}, '%Y-%m-%d %H:00:00')`;
  }

  if (timeframe === "4h") {
    return `DATE_FORMAT(
      DATE_SUB(
        DATE(${localTs}) + INTERVAL FLOOR(HOUR(${localTs}) / 4) * 4 HOUR,
        INTERVAL 8 HOUR
      ),
      '%Y-%m-%d %H:00:00'
    )`;
  }

  if (timeframe === "12h") {
    return `DATE_FORMAT(
      DATE_SUB(
        DATE(${localTs}) + INTERVAL FLOOR(HOUR(${localTs}) / 12) * 12 HOUR,
        INTERVAL 8 HOUR
      ),
      '%Y-%m-%d %H:00:00'
    )`;
  }

  return `DATE_FORMAT(
    DATE_SUB(DATE(${localTs}), INTERVAL 8 HOUR),
    '%Y-%m-%d %H:00:00'
  )`;
}

function buildUtcBucketExpressionFromShanghaiStored(
  column: string,
  timeframe: "1h" | "4h" | "12h" | "1d"
) {
  if (timeframe === "1h") {
    return `DATE_FORMAT(
      DATE_SUB(${column}, INTERVAL 8 HOUR),
      '%Y-%m-%d %H:00:00'
    )`;
  }

  if (timeframe === "4h") {
    return `DATE_FORMAT(
      DATE_SUB(
        DATE(${column}) + INTERVAL FLOOR(HOUR(${column}) / 4) * 4 HOUR,
        INTERVAL 8 HOUR
      ),
      '%Y-%m-%d %H:00:00'
    )`;
  }

  if (timeframe === "12h") {
    return `DATE_FORMAT(
      DATE_SUB(
        DATE(${column}) + INTERVAL FLOOR(HOUR(${column}) / 12) * 12 HOUR,
        INTERVAL 8 HOUR
      ),
      '%Y-%m-%d %H:00:00'
    )`;
  }

  return `DATE_FORMAT(
    DATE_SUB(DATE(${column}), INTERVAL 8 HOUR),
    '%Y-%m-%d %H:00:00'
  )`;
}

function toShanghaiDateKey(value: string) {
  const date = parseDbUtcDate(value);
  if (!date) return value.slice(0, 10);
  const parts = SHANGHAI_DATE_KEY_FORMATTER.formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value ?? "";
  const month = parts.find(part => part.type === "month")?.value ?? "";
  const day = parts.find(part => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : value.slice(0, 10);
}

function mapAnnouncementType(row: {
  isListing?: number | null;
  isDelistingRisk?: number | null;
  isActivity?: number | null;
}): "listing" | "delisting" | "event" | "other" {
  if (row.isListing) return "listing";
  if (row.isDelistingRisk) return "delisting";
  if (row.isActivity) return "event";
  return "other";
}

function toNullableNumber(value: unknown) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getKlineRangeConfig(range: TokenKlineRange) {
  switch (range) {
    case "1m":
      return { period: "hourly", interval: "1h", count: 24 * 30, bucketHours: 1 };
    case "3m":
      return { period: "hourly", interval: "4h", count: 6 * CMC_MAX_SAFE_HISTORICAL_DAYS, bucketHours: 4 };
    case "6m":
      return { period: "daily", interval: "1d", count: 180, bucketHours: 24 };
    case "1y":
      return { period: "daily", interval: "1d", count: 365, bucketHours: 24 };
    default:
      return { period: "hourly", interval: "4h", count: 6 * 90, bucketHours: 4 };
  }
}

function canUseCoinMarketCapForKline(range: TokenKlineRange) {
  return range === "1m" || range === "3m";
}

function getCoinGeckoDays(range: TokenKlineRange) {
  switch (range) {
    case "1m":
      return "30";
    case "3m":
      return "90";
    case "6m":
      return "180";
    case "1y":
      return "365";
    default:
      return "90";
  }
}

function getLatestComparableKlinePrice(
  points: Array<{
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }>
) {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const point = points[index];
    const price = point.close ?? point.high ?? point.open ?? point.low;
    if (price != null && Number.isFinite(price)) {
      return price;
    }
  }

  return null;
}

function isKlineSeriesConsistentWithCurrentPrice(
  points: Array<{
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
  }>,
  currentPrice: number | null
) {
  if (currentPrice == null || !Number.isFinite(currentPrice) || currentPrice <= 0) {
    return true;
  }

  const latestPrice = getLatestComparableKlinePrice(points);
  if (latestPrice == null || !Number.isFinite(latestPrice) || latestPrice <= 0) {
    return true;
  }

  const ratio = Math.max(latestPrice, currentPrice) / Math.min(latestPrice, currentPrice);
  return ratio <= 50;
}

function normalizeCoinMarketCapOhlcvResponse(payload: any) {
  const collected: any[] = [];
  const data = payload?.data;

  if (Array.isArray(data)) {
    collected.push(...data);
  } else if (data && typeof data === "object") {
    Object.values(data).forEach((entry: any) => {
      if (Array.isArray(entry)) {
        collected.push(...entry);
        return;
      }

      if (Array.isArray(entry?.quotes)) {
        collected.push(...entry.quotes);
        return;
      }

      if (Array.isArray(entry?.ohlcv)) {
        collected.push(...entry.ohlcv);
      }
    });
  }

  const normalized = collected
    .map(item => {
      const usd =
        item?.quote?.USD ??
        item?.quote?.usd ??
        item?.USD ??
        item?.usd ??
        item;
      const time =
        item?.timestamp ??
        item?.time_open ??
        item?.timeOpen ??
        item?.time_close ??
        item?.timeClose ??
        usd?.timestamp ??
        usd?.time_open ??
        usd?.timeOpen ??
        null;

      if (!time) return null;

      return {
        time: new Date(time).toISOString(),
        open: toNullableNumber(usd?.open),
        high: toNullableNumber(usd?.high),
        low: toNullableNumber(usd?.low),
        close: toNullableNumber(usd?.close),
        volume: toNullableNumber(usd?.volume),
        marketCap: toNullableNumber(usd?.market_cap ?? usd?.marketCap),
      };
    })
    .filter(
      (
        item
      ): item is {
        time: string;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
        volume: number | null;
        marketCap: number | null;
      } => Boolean(item?.time)
    )
    .sort((left, right) => new Date(left.time).getTime() - new Date(right.time).getTime());

  const deduped = new Map<string, (typeof normalized)[number]>();
  normalized.forEach(point => {
    deduped.set(point.time, point);
  });

  return Array.from(deduped.values());
}

async function fetchCoinMarketCapKline(identifier: string, range: TokenKlineRange) {
  if (!ENV.coinMarketCapApiKey) {
    throw new Error("CMC_API_KEY is not configured");
  }

  const { period, interval, count } = getKlineRangeConfig(range);
  const url = new URL("https://pro-api.coinmarketcap.com/v2/cryptocurrency/ohlcv/historical");
  if (/^\d+$/.test(identifier)) {
    url.searchParams.set("id", identifier);
  } else {
    url.searchParams.set("slug", identifier);
  }
  url.searchParams.set("time_period", period);
  if (interval) {
    url.searchParams.set("interval", interval);
  }
  url.searchParams.set("count", `${count}`);
  url.searchParams.set("convert", "USD");

  try {
    const response = await axios.get(url.toString(), {
      headers: {
        Accept: "application/json",
        "X-CMC_PRO_API_KEY": ENV.coinMarketCapApiKey,
      },
      timeout: 20_000,
      httpsAgent: getOutboundHttpsProxyAgent() ?? undefined,
      proxy: false,
    });

    return normalizeCoinMarketCapOhlcvResponse(response.data);
  } catch (error) {
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data?.status?.error_message ||
        error.response?.data?.status?.errorMessage ||
        error.response?.data?.error ||
        error.message
      : error instanceof Error
        ? error.message
        : "Unknown request failure";
    throw new Error(`CMC price request failed: ${errorMessage}`);
  }
}

function normalizeCoinGeckoMarketChartResponse(payload: any) {
  const prices = Array.isArray(payload?.prices) ? payload.prices : [];
  const marketCaps = new Map<string, number | null>(
    (Array.isArray(payload?.market_caps) ? payload.market_caps : []).map((entry: any) => [
      new Date(Number(entry?.[0])).toISOString(),
      toNullableNumber(entry?.[1]),
    ])
  );
  const volumes = new Map<string, number | null>(
    (Array.isArray(payload?.total_volumes) ? payload.total_volumes : []).map((entry: any) => [
      new Date(Number(entry?.[0])).toISOString(),
      toNullableNumber(entry?.[1]),
    ])
  );

  return prices
    .map((entry: any) => {
      const timestamp = Number(entry?.[0]);
      const close = toNullableNumber(entry?.[1]);
      if (!Number.isFinite(timestamp)) return null;

      const time = new Date(timestamp).toISOString();
      return {
        time,
        open: close,
        high: close,
        low: close,
        close,
        volume: volumes.get(time) ?? null,
        marketCap: marketCaps.get(time) ?? null,
      };
    })
    .filter(
      (
        item: {
          time: string;
          open: number | null;
          high: number | null;
          low: number | null;
          close: number | null;
          volume: number | null;
          marketCap: number | null;
        } | null
      ): item is {
        time: string;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
        volume: number | null;
        marketCap: number | null;
      } => Boolean(item?.time)
    )
    .sort(
      (
        left: {
          time: string;
        },
        right: {
          time: string;
        }
      ) => new Date(left.time).getTime() - new Date(right.time).getTime()
    );
}

async function fetchCoinGeckoKline(coinId: string, range: TokenKlineRange) {
  const url = new URL(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("days", getCoinGeckoDays(range));
  if (range === "1y") {
    url.searchParams.set("interval", "daily");
  }

  try {
    const response = await axios.get(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      timeout: 20_000,
      httpsAgent: getOutboundHttpsProxyAgent() ?? undefined,
      proxy: false,
    });

    return normalizeCoinGeckoMarketChartResponse(response.data);
  } catch (error) {
    const errorMessage = axios.isAxiosError(error)
      ? error.response?.data?.status?.error_message ||
        error.response?.data?.error ||
        error.message
      : error instanceof Error
        ? error.message
        : "Unknown request failure";
    throw new Error(`CoinGecko price request failed: ${errorMessage}`);
  }
}

function formatAddressTagLabel(value: string | null | undefined) {
  if (!value) return "普通地址";
  const primary = value
    .split(/[;,|]/)
    .map(item => item.trim())
    .filter(Boolean)[0];

  if (!primary) return "普通地址";

  return primary
    .replace(/[._]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectCentralizedExchangeName(label: string | null | undefined, kind: string | null | undefined) {
  const text = `${label ?? ""} ${kind ?? ""}`.toLowerCase();
  if (!text.trim()) return null;
  if (/router|swap|pool|vault|lp|pair|pancake|uniswap|dex/i.test(text)) return null;

  const rules: Array<{ name: string; pattern: RegExp }> = [
    { name: "Binance", pattern: /binance/ },
    { name: "Bybit", pattern: /bybit/ },
    { name: "OKX", pattern: /\bokx\b/ },
    { name: "Gate", pattern: /\bgate\b/ },
    { name: "KuCoin", pattern: /kucoin/ },
    { name: "MEXC", pattern: /mexc/ },
    { name: "Bitget", pattern: /bitget/ },
    { name: "Coinbase", pattern: /coinbase/ },
    { name: "Kraken", pattern: /kraken/ },
    { name: "HTX", pattern: /\bhtx\b|huobi/ },
    { name: "BingX", pattern: /bingx/ },
    { name: "Upbit", pattern: /upbit/ },
    { name: "Bithumb", pattern: /bithumb/ },
    { name: "BitMart", pattern: /bitmart/ },
    { name: "LBank", pattern: /lbank/ },
  ];

  for (const rule of rules) {
    if (rule.pattern.test(text)) {
      return rule.name;
    }
  }

  return null;
}

function bucketKlinePoints(
  points: Array<{
    time: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    marketCap: number | null;
  }>,
  bucketHours: number
) {
  if (bucketHours <= 1) return points;

  const bucketMs = bucketHours * 60 * 60 * 1000;
  const groups = new Map<
    number,
    Array<{
      time: string;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
      volume: number | null;
      marketCap: number | null;
    }>
  >();

  points.forEach(point => {
    const timestamp = new Date(point.time).getTime();
    if (!Number.isFinite(timestamp)) return;
    const bucketStart = Math.floor(timestamp / bucketMs) * bucketMs;
    const bucket = groups.get(bucketStart) ?? [];
    bucket.push(point);
    groups.set(bucketStart, bucket);
  });

  return Array.from(groups.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([bucketStart, bucket]) => {
      const sortedBucket = [...bucket].sort(
        (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime()
      );
      const first = sortedBucket[0];
      const last = sortedBucket[sortedBucket.length - 1];
      const highs = sortedBucket.map(item => item.high ?? item.open ?? item.close ?? item.low).filter((value): value is number => value != null);
      const lows = sortedBucket.map(item => item.low ?? item.open ?? item.close ?? item.high).filter((value): value is number => value != null);
      const volume = sortedBucket.reduce((sum, item) => sum + (item.volume ?? 0), 0);

      return {
        time: new Date(bucketStart).toISOString(),
        open: first.open ?? first.close ?? first.high ?? first.low,
        high: highs.length ? Math.max(...highs) : null,
        low: lows.length ? Math.min(...lows) : null,
        close: last.close ?? last.open ?? last.high ?? last.low,
        volume: volume > 0 ? volume : null,
        marketCap: last.marketCap ?? null,
      };
    });
}

function safeParseJsonArray(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractInvestorNames(value: string | null | undefined) {
  if (!value) return [];

  let parsed: any = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }

  const entries = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object"
      ? Object.values(parsed).flatMap(item => (Array.isArray(item) ? item : []))
      : [];

  return entries
    .map((item: any) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.name ?? item.title ?? item.slug ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function extractJobs(value: string | null | undefined) {
  return safeParseJsonArray(value)
    .map((item: any) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        return String(item.title ?? item.name ?? item.role ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
}

function extractLinks(value: string | null | undefined) {
  return safeParseJsonArray(value)
    .map((item: any) => {
      if (typeof item === "string") {
        return { label: "Link", url: item.trim() };
      }
      if (item && typeof item === "object") {
        const url = String(item.url ?? item.link ?? item.href ?? "").trim();
        const label = String(item.type ?? item.label ?? item.name ?? "Link").trim();
        if (!url) return null;
        return { label: label || "Link", url };
      }
      return null;
    })
    .filter((item): item is { label: string; url: string } => Boolean(item?.url));
}

function humanizeSlug(value: string | null | undefined) {
  if (!value) return null;
  return value
    .split(/[-_]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function extractFundingRawMeta(value: string | null | undefined) {
  if (!value) {
    return {
      ieoPlatform: null,
      saleStatus: null,
    };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      ieoPlatform: humanizeSlug(String(parsed?.idoPlatformKey ?? parsed?.platformKey ?? "").trim()) ?? null,
      saleStatus: String(parsed?.status ?? "").trim() || null,
    };
  } catch {
    return {
      ieoPlatform: null,
      saleStatus: null,
    };
  }
}

function safeParseJsonObject(value: string | null | undefined) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function escapeMysqlRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTwitterTokenMatch(profile: { symbol: string; name: string | null }) {
  const conditions: string[] = [];
  const params: string[] = [];
  const symbol = profile.symbol.trim().toLowerCase();
  const name = profile.name?.trim().toLowerCase() ?? "";

  if (symbol) {
    conditions.push("LOWER(content) LIKE ?");
    params.push(`%$${symbol}%`);

    if (symbol.length >= 4) {
      conditions.push("LOWER(content) REGEXP ?");
      params.push(`(^|[^a-z0-9])${escapeMysqlRegex(symbol)}([^a-z0-9]|$)`);
    }
  }

  if (name && name.length >= 4) {
    conditions.push("LOWER(content) LIKE ?");
    params.push(`%${name}%`);
  }

  return {
    sql: conditions.length > 0 ? `(${conditions.join(" OR ")})` : "0=1",
    params,
  };
}

function extractTweetAuthorMeta(rawJson: any) {
  const authorResult = rawJson?.core?.user_results?.result;
  const legacy = authorResult?.legacy ?? null;

  return {
    avatarUrl:
      typeof legacy?.profile_image_url_https === "string" ? legacy.profile_image_url_https : null,
    followerCount: toNullableNumber(legacy?.followers_count),
    isBlueVerified: Boolean(authorResult?.is_blue_verified),
    isVerified: Boolean(legacy?.verified || authorResult?.verified || authorResult?.verified_type),
    description: typeof legacy?.description === "string" ? legacy.description : null,
  };
}

function extractTweetMedia(rawJson: any) {
  const mediaItems: Array<{ type: string; previewUrl: string | null }> = [];
  const pushMedia = (type: string, previewUrl: string | null) => {
    if (!previewUrl) return;
    if (mediaItems.some(item => item.previewUrl === previewUrl)) return;
    mediaItems.push({ type, previewUrl });
  };

  const entityMedia = rawJson?.legacy?.extended_entities?.media ?? rawJson?.legacy?.entities?.media ?? [];
  if (Array.isArray(entityMedia)) {
    entityMedia.forEach((item: any) => {
      pushMedia(
        typeof item?.type === "string" ? item.type : "media",
        typeof item?.media_url_https === "string"
          ? item.media_url_https
          : typeof item?.media_url === "string"
            ? item.media_url
            : typeof item?.url === "string"
              ? item.url
              : null
      );
    });
  }

  const cardBindings = rawJson?.card?.legacy?.binding_values;
  if (Array.isArray(cardBindings)) {
    cardBindings.forEach((binding: any) => {
      const imageUrl = binding?.value?.image_value?.url;
      if (typeof imageUrl === "string") {
        pushMedia("image", imageUrl);
      }
    });
  }

  return mediaItems;
}

function buildSocialSummaryText(input: {
  symbol: string;
  mentionCount24h: number;
  mentionCount7d: number;
  uniqueAuthors7d: number;
  totalEngagement7d: number;
  totalViews7d: number;
}) {
  if (input.mentionCount7d === 0) {
    return `近7天暂未收录到与 ${input.symbol} 相关的 KOL 推文。`;
  }

  return `近24小时收录 ${input.mentionCount24h.toLocaleString()} 条提及，近7天共 ${
    input.mentionCount7d.toLocaleString()
  } 条，覆盖 ${input.uniqueAuthors7d.toLocaleString()} 位 KOL，累计互动 ${
    input.totalEngagement7d.toLocaleString()
  }，累计曝光 ${input.totalViews7d.toLocaleString()}。`;
}

function buildLeveragedTokenExclusionSql() {
  return `
    COALESCE(tp.coin_tags, '') NOT LIKE '%LEVSP%'
  `;
}

function buildAlphaOnlyVenueExclusionSql() {
  return `
    EXISTS (
      SELECT 1
      FROM exchange_listings el_visible
      JOIN exchange_platforms ep_visible ON ep_visible.id = el_visible.exchange_id
      WHERE el_visible.token_id = tp.id
        AND ep_visible.market_type NOT IN ('tradfi', 'onchain')
        AND ep_visible.name NOT IN ('Gate Alpha', 'KuCoin Alpha')
    )
  `;
}

function buildMarketFilters(input: MarketListInput) {
  const conditions: string[] = [
    "COALESCE(tp.coin_tags, '') NOT LIKE '%STOCK%'",
    buildLeveragedTokenExclusionSql(),
    buildAlphaOnlyVenueExclusionSql(),
  ];
  const params: Array<string | number> = [];

  const query = input.query?.trim();
  const marketTypeValues = getMarketTypeFilterValues(input.marketType);

  if (input.symbols?.length) {
    const normalizedSymbols = input.symbols
      .map(symbol => symbol.trim().toUpperCase())
      .filter(Boolean);

    if (normalizedSymbols.length > 0) {
      conditions.push(`UPPER(tp.symbol) IN (${normalizedSymbols.map(() => "?").join(", ")})`);
      params.push(...normalizedSymbols);
    }
  }

  if (query) {
    conditions.push("(tp.symbol LIKE ? OR tp.name LIKE ? OR tp.slug LIKE ?)");
    const keyword = `%${query}%`;
    params.push(keyword, keyword, keyword);
  }

  if (input.exchangeIds?.length && marketTypeValues.length > 0) {
    const placeholders = input.exchangeIds.map(() => "?").join(", ");
    const marketTypePlaceholders = marketTypeValues.map(() => "?").join(", ");
    conditions.push(`
      (
        SELECT COUNT(DISTINCT el_filter.exchange_id)
        FROM exchange_listings el_filter
        JOIN exchange_platforms ep_filter ON ep_filter.id = el_filter.exchange_id
        WHERE el_filter.token_id = tp.id
          AND el_filter.exchange_id IN (${placeholders})
          AND ep_filter.market_type IN (${marketTypePlaceholders})
      ) = ?
    `);
    params.push(...input.exchangeIds, ...marketTypeValues, input.exchangeIds.length);
  } else if (input.exchangeIds?.length) {
    const placeholders = input.exchangeIds.map(() => "?").join(", ");
    conditions.push(`
      (
        SELECT COUNT(DISTINCT el_filter.exchange_id)
        FROM exchange_listings el_filter
        WHERE el_filter.token_id = tp.id
          AND el_filter.exchange_id IN (${placeholders})
      ) = ?
    `);
    params.push(...input.exchangeIds, input.exchangeIds.length);
  }

  return {
    whereClause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "",
    params,
  };
}

export async function listMarketTokens(input: MarketListInput) {
  const currentPool = getPool();
  const page = input.page ?? 1;
  const pageSize = Math.min(input.pageSize ?? 25, 100);
  const offset = (page - 1) * pageSize;
  const { whereClause, params } = buildMarketFilters(input);
  const marketTypeValues = getMarketTypeFilterValues(input.marketType);
  const listingAggMarketTypeClause = marketTypeValues.length
    ? `AND ep.market_type IN (${marketTypeValues.map(() => "?").join(", ")})`
    : `AND ep.market_type NOT IN ('tradfi', 'onchain')`;

  const sortableColumns = {
    listedAt: "listingAgg.listedAt",
    marketCap: "tp.market_cap",
    volume24h: "COALESCE(pairAgg.volume24h, tp.volume_24h)",
  } as const;
  const sortBy = sortableColumns[input.sortBy ?? "listedAt"];
  const sortOrder = input.sortOrder === "asc" ? "ASC" : "DESC";

  const listSql = `
    SELECT
      tp.id AS tokenId,
      tp.symbol AS symbol,
      tp.name AS name,
      tp.logo_url AS logoUrl,
      tp.current_price AS price,
      tp.total_supply AS totalSupply,
      tp.circulating_supply AS circulatingSupply,
      tp.fdv AS fdv,
      tp.market_cap AS marketCap,
      COALESCE(pairAgg.volume24h, tp.volume_24h) AS volume24h,
      listingAgg.listedAt AS listedAt,
      listingAgg.recentVenue AS recentVenue
    FROM token_profiles tp
    LEFT JOIN (
      SELECT token_id, SUM(volume_24h) AS volume24h
      FROM exchange_pairs
      GROUP BY token_id
    ) pairAgg ON pairAgg.token_id = tp.id
    INNER JOIN (
      SELECT
        el.token_id AS token_id,
        MAX(el.listing_time) AS listedAt,
        SUBSTRING_INDEX(
          GROUP_CONCAT(ep.name ORDER BY el.listing_time DESC SEPARATOR '||'),
          '||',
          1
        ) AS recentVenue
      FROM exchange_listings el
      LEFT JOIN exchange_platforms ep ON ep.id = el.exchange_id
      WHERE 1 = 1
        ${listingAggMarketTypeClause}
      GROUP BY el.token_id
    ) listingAgg ON listingAgg.token_id = tp.id
    ${whereClause}
    ORDER BY ${sortBy} ${sortOrder}, tp.id DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await currentPool.query<(RowDataPacket & Omit<MarketTokenRow, "exchanges">)[]>(
    listSql,
    [...marketTypeValues, ...params, pageSize, offset]
  );

  const tokenIds = rows.map(row => row.tokenId);
  let exchangeMap = new Map<number, MarketTokenRow["exchanges"]>();

  if (tokenIds.length > 0) {
    const placeholders = tokenIds.map(() => "?").join(", ");
    const exchangeSql = `
      SELECT
        listing_rows.tokenId AS tokenId,
        listing_rows.exchangeId AS exchangeId,
        listing_rows.exchangeName AS exchangeName,
        listing_rows.exchangeLogoUrl AS exchangeLogoUrl,
        listing_rows.marketType AS marketType,
        listing_rows.listingTime AS listingTime
      FROM (
        SELECT
          el.token_id AS tokenId,
          ep.id AS exchangeId,
          ep.name AS exchangeName,
          ep.logo_url AS exchangeLogoUrl,
          ep.market_type AS marketType,
          MAX(el.listing_time) AS listingTime
        FROM exchange_listings el
        JOIN exchange_platforms ep ON ep.id = el.exchange_id
        WHERE el.token_id IN (${placeholders})
          AND ep.market_type NOT IN ('tradfi', 'onchain')
        GROUP BY el.token_id, ep.id, ep.name, ep.logo_url, ep.market_type
      ) listing_rows
      ORDER BY listing_rows.tokenId, listing_rows.listingTime DESC, listing_rows.exchangeId ASC
    `;

    const [exchangeRows] = await currentPool.query<
      (RowDataPacket & {
        tokenId: number;
        exchangeId: number;
        exchangeName: string;
        exchangeLogoUrl: string | null;
        marketType: string | null;
        listingTime: string | null;
      })[]
    >(exchangeSql, tokenIds);

    exchangeMap = exchangeRows.reduce((map, row) => {
      const current = map.get(row.tokenId) ?? [];
      current.push({
        exchangeId: row.exchangeId,
        exchangeName: row.exchangeName,
        exchangeLogoUrl: row.exchangeLogoUrl,
        marketType: row.marketType,
        listingTime: row.listingTime,
      });
      map.set(row.tokenId, current);
      return map;
    }, new Map<number, MarketTokenRow["exchanges"]>());
  }

  return {
    items: rows.map(row => ({
      ...row,
      exchanges: exchangeMap.get(row.tokenId) ?? [],
    })),
    total: rows.length,
    page,
    pageSize,
  };
}

export async function getBinanceAlphaListings(options?: {
  limit?: number;
}): Promise<{ items: BinanceAlphaListingItem[]; total: number; source: "internal_db" | "binance_api" }> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 50);

  let internalItems: BinanceAlphaListingItem[] = [];
  try {
    internalItems = await getBinanceAlphaListingsFromDb(limit);
  } catch {
    internalItems = [];
  }

  if (internalItems.length > 0) {
    return {
      items: internalItems,
      total: internalItems.length,
      source: "internal_db",
    };
  }

  const apiItems = await getBinanceAlphaListingsFromApi(limit);
  return {
    items: apiItems,
    total: apiItems.length,
    source: "binance_api",
  };
}

async function getBinanceAlphaListingsFromDb(limit: number): Promise<BinanceAlphaListingItem[]> {
  const currentPool = getPool();
  const [rows] = await currentPool.query<
    (RowDataPacket & {
      tokenId: number;
      symbol: string;
      name: string | null;
      pairName: string | null;
      listingTime: string | null;
      price: number | null;
      volume24h: number | null;
      marketCap: number | null;
      fdv: number | null;
      announcementUrl: string | null;
    })[]
  >(
    `
      SELECT
        tp.id AS tokenId,
        tp.symbol AS symbol,
        tp.name AS name,
        el.pair_name AS pairName,
        el.listing_time AS listingTime,
        COALESCE(p.price, tp.current_price) AS price,
        COALESCE(p.volume_24h, tp.volume_24h) AS volume24h,
        tp.market_cap AS marketCap,
        tp.fdv AS fdv,
        ea.url AS announcementUrl
      FROM exchange_listings el
      JOIN token_profiles tp ON tp.id = el.token_id
      JOIN exchange_platforms ep ON ep.id = el.exchange_id
      LEFT JOIN exchange_pairs p
        ON p.token_id = el.token_id
       AND p.exchange_id = el.exchange_id
       AND COALESCE(p.pair_name, '') = COALESCE(el.pair_name, '')
      LEFT JOIN exchange_announcements ea ON ea.id = el.announcement_id
      WHERE el.listing_time IS NOT NULL
        AND (
          LOWER(ep.slug) IN ('binance-alpha', 'binance_alpha', 'binancealpha')
          OR LOWER(ep.name) LIKE '%binance%alpha%'
          OR (LOWER(ep.name) LIKE '%binance%' AND ep.market_type = 'alpha')
        )
      ORDER BY el.listing_time DESC, el.id DESC
      LIMIT ?
    `,
    [limit]
  );

  return rows.map(row => ({
    symbol: row.symbol,
    name: row.name,
    tokenId: row.tokenId,
    pairName: row.pairName,
    listingTime: row.listingTime,
    price: row.price != null ? Number(row.price) : null,
    volume24h: row.volume24h != null ? Number(row.volume24h) : null,
    marketCap: row.marketCap != null ? Number(row.marketCap) : null,
    fdv: row.fdv != null ? Number(row.fdv) : null,
    source: "internal_db",
    url: row.announcementUrl,
  }));
}

async function getBinanceAlphaListingsFromApi(limit: number): Promise<BinanceAlphaListingItem[]> {
  try {
    const response = await axios.get(
      "https://www.binance.com/bapi/defi/v1/public/wallet-direct/buw/wallet/cex/alpha/all/token/list",
      {
        headers: {
          Accept: "application/json",
        },
        timeout: 20_000,
        httpsAgent: getOutboundHttpsProxyAgent() ?? undefined,
        proxy: false,
      }
    );

    return normalizeBinanceAlphaApiItems(response.data)
      .sort((left, right) => {
        const leftTs = left.listingTime ? new Date(left.listingTime).getTime() : 0;
        const rightTs = right.listingTime ? new Date(right.listingTime).getTime() : 0;
        return rightTs - leftTs;
      })
      .slice(0, limit);
  } catch {
    return [];
  }
}

function normalizeBinanceAlphaApiItems(payload: unknown): BinanceAlphaListingItem[] {
  const candidates = collectArrays(payload).sort((left, right) => right.length - left.length)[0] ?? [];

  return candidates
    .map((item): BinanceAlphaListingItem | null => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const symbol = pickFirstString(record, ["symbol", "tokenSymbol", "baseAsset", "asset", "ticker"]);
      if (!symbol) return null;

      const timestamp =
        pickFirstNumber(record, ["listingTime", "listedAt", "openTime", "releaseTime", "launchTime", "time"]) ??
        null;
      const listingTime = timestamp
        ? new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp).toISOString()
        : pickFirstString(record, ["listingDate", "listedDate", "createdAt"]);

      return {
        symbol: symbol.toUpperCase(),
        name: pickFirstString(record, ["name", "tokenName", "projectName"]),
        tokenId: null,
        pairName: pickFirstString(record, ["pair", "pairName", "symbolPair"]),
        listingTime,
        price: pickFirstNumber(record, ["price", "lastPrice", "currentPrice"]),
        volume24h: pickFirstNumber(record, ["volume24h", "volume", "quoteVolume"]),
        marketCap: pickFirstNumber(record, ["marketCap", "marketCapUsd"]),
        fdv: pickFirstNumber(record, ["fdv", "fullyDilutedValuation"]),
        source: "binance_api" as const,
        url: null,
      };
    })
    .filter((item): item is BinanceAlphaListingItem => Boolean(item));
}

function collectArrays(value: unknown): Array<Record<string, unknown>[]> {
  if (Array.isArray(value)) {
    return value.every(item => item && typeof item === "object")
      ? [value as Record<string, unknown>[]]
      : [];
  }

  if (!value || typeof value !== "object") return [];

  const arrays: Array<Record<string, unknown>[]> = [];
  for (const nested of Object.values(value as Record<string, unknown>)) {
    arrays.push(...collectArrays(nested));
  }
  return arrays;
}

function pickFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function pickFirstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

export async function getTokenProfileBySymbol(
  symbol: string,
  tokenId?: number | null
): Promise<TokenProfileResult | null> {
  if (tokenId != null) {
    const profile = await getTokenProfileByTokenId(tokenId);
    if (profile) return profile;
  }

  const normalizedSymbol = symbol.trim();
  if (/^\d+$/.test(normalizedSymbol)) {
    const profile = await getTokenProfileByTokenId(Number(normalizedSymbol));
    if (profile) return profile;
  }

  return await getTokenProfileByLookup("UPPER(tp.symbol) = UPPER(?)", [symbol]);
}

async function getTokenProfileByTokenId(tokenId: number): Promise<TokenProfileResult | null> {
  return await getTokenProfileByLookup("tp.id = ?", [tokenId]);
}

async function getTokenProfileByLookup(whereClause: string, params: unknown[]): Promise<TokenProfileResult | null> {
  const currentPool = getPool();
  const optionalColumns = await getTokenProfilesOptionalColumns();
  const hasAthColumns =
    optionalColumns.has("all_time_high_price") &&
    optionalColumns.has("all_time_high_at") &&
    optionalColumns.has("all_time_low_price") &&
    optionalColumns.has("all_time_low_at");

  const profileSql = `
    SELECT
      tp.id AS tokenId,
      tp.symbol AS symbol,
      tp.name AS name,
      tp.slug AS slug,
      tp.description AS description,
      tp.logo_url AS logoUrl,
      tp.coin_market_cap_id AS coinMarketCapId,
      tp.coingecko_id AS coinGeckoId,
      tp.website AS website,
      tp.whitepaper_url AS whitepaperUrl,
      tp.current_price AS currentPrice,
      tp.market_cap AS marketCap,
      tp.fdv AS fdv,
      tp.total_supply AS totalSupply,
      tp.circulating_supply AS circulatingSupply,
      tp.volume_24h AS volume24h,
      tp.price_change_24h AS priceChange24h,
      tp.price_change_7d AS priceChange7d,
      tp.token_holder_count AS tokenHolderCount,
      ${
        hasAthColumns
          ? `tp.all_time_high_price AS allTimeHighPrice,
      tp.all_time_high_at AS allTimeHighAt,
      tp.all_time_low_price AS allTimeLowPrice,
      tp.all_time_low_at AS allTimeLowAt,`
          : `NULL AS allTimeHighPrice,
      NULL AS allTimeHighAt,
      NULL AS allTimeLowPrice,
      NULL AS allTimeLowAt,`
      }
      tp.coin_tags AS coinTagsRaw
    FROM token_profiles tp
    WHERE ${whereClause}
    ORDER BY tp.id DESC
    LIMIT 1
  `;

  const [profileRows] = await currentPool.query<ProfileRow[]>(profileSql, params);
  const profile = profileRows[0];

  if (!profile) return null;

  const [addressRows] = await currentPool.query<
    (RowDataPacket & {
      chainName: string;
      address: string;
    })[]
  >(
    `
      SELECT
        chain_name AS chainName,
        address AS address
      FROM token_address
      WHERE token_id = ?
      ORDER BY chain_name, id
    `,
    [profile.tokenId]
  );

  const [announcementRows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      title: string;
      publishedAt: string | null;
      url: string | null;
      isListing: number | null;
      isDelistingRisk: number | null;
      isActivity: number | null;
    })[]
  >(
    `
      SELECT DISTINCT
        ea.id AS id,
        ea.title AS title,
        ea.published_at AS publishedAt,
        ea.url AS url,
        ea.is_listing AS isListing,
        ea.is_delisting_risk AS isDelistingRisk,
        ea.is_activity AS isActivity
      FROM exchange_listings el
      LEFT JOIN exchange_announcements ea ON ea.id = el.announcement_id
      WHERE el.token_id = ?
        AND ea.id IS NOT NULL
      ORDER BY ea.published_at DESC, ea.id DESC
      LIMIT 5
    `,
    [profile.tokenId]
  );

  return {
    tokenId: profile.tokenId,
    symbol: profile.symbol,
    name: profile.name,
    slug: profile.slug,
    description: profile.description,
    logoUrl: profile.logoUrl,
    coinMarketCapId: profile.coinMarketCapId,
    coinGeckoId: profile.coinGeckoId,
    website: profile.website,
    whitepaperUrl: profile.whitepaperUrl,
    currentPrice: profile.currentPrice,
    marketCap: profile.marketCap,
    fdv: profile.fdv,
    totalSupply: profile.totalSupply,
    circulatingSupply: profile.circulatingSupply,
    volume24h: profile.volume24h,
    priceChange24h: profile.priceChange24h,
    priceChange7d: profile.priceChange7d,
    tokenHolderCount: profile.tokenHolderCount,
    allTimeHighPrice: toNullableNumber(profile.allTimeHighPrice),
    allTimeHighAt: profile.allTimeHighAt,
    allTimeLowPrice: toNullableNumber(profile.allTimeLowPrice),
    allTimeLowAt: profile.allTimeLowAt,
    coinTags: parseCoinTags(profile.coinTagsRaw),
    addresses: addressRows,
    latestAnnouncements: announcementRows.map(row => ({
      id: row.id,
      title: row.title,
      publishedAt: row.publishedAt,
      url: row.url,
      type: mapAnnouncementType(row),
    })),
  };
}

function matchesOnchainChainName(chainName: string, chainId?: number | null) {
  if (!chainId) return true;
  const keywords = ONCHAIN_CHAIN_NAME_HINTS[chainId] ?? [];
  if (keywords.length === 0) return true;
  const normalized = chainName.trim().toLowerCase();
  return keywords.some(keyword => normalized.includes(keyword));
}

function filterAddressesByChain<T extends { chainName: string }>(addresses: T[], chainId?: number | null) {
  if (!chainId) return addresses;
  const filtered = addresses.filter(item => matchesOnchainChainName(item.chainName, chainId));
  return filtered.length > 0 ? filtered : addresses;
}

async function resolveOnchainTokenContext(params: {
  symbol: string;
  tokenId?: number | null;
  chainId?: number | null;
}) {
  const currentPool = getPool();
  const normalizedSymbol = params.symbol.trim().toUpperCase();
  const fallbackToken = fallbackOnchainTokens[normalizedSymbol] ?? null;
  let profile: TokenProfileResult | null = null;

  try {
    profile =
      params.tokenId != null && Number.isFinite(params.tokenId)
        ? await getTokenProfileByTokenId(params.tokenId)
        : await getTokenProfileBySymbol(params.symbol);
  } catch {
    profile = null;
  }

  if (!profile && !fallbackToken) return null;

  let tokenAddressRows: Array<{
    tokenAddressId: number | null;
    address: string;
    chainName: string;
  }> = [];

  if (profile) {
    try {
      const [rows] = await currentPool.query<
        (RowDataPacket & {
          tokenAddressId: number;
          address: string;
          chainName: string | null;
        })[]
      >(
        `
          SELECT
            ta.id AS tokenAddressId,
            ta.address AS address,
            ta.chain_name AS chainName
          FROM token_address ta
          WHERE ta.token_id = ?
          ORDER BY ta.id DESC
        `,
        [profile.tokenId]
      );

      tokenAddressRows = rows.map(row => ({
        tokenAddressId: row.tokenAddressId,
        address: String(row.address).toLowerCase(),
        chainName: String(row.chainName ?? "").trim(),
      }));
    } catch {
      tokenAddressRows = [];
    }
  }

  if (tokenAddressRows.length === 0 && profile) {
    tokenAddressRows = profile.addresses.map(item => ({
      tokenAddressId: null,
      address: item.address.toLowerCase(),
      chainName: item.chainName,
    }));
  }

  const filteredProfileRows = filterAddressesByChain(tokenAddressRows, params.chainId);
  const fallbackRows =
    fallbackToken && (!params.chainId || params.chainId === 56)
      ? fallbackToken.addresses.map(address => ({
          tokenAddressId: null,
          address: address.toLowerCase(),
          chainName: "BSC",
        }))
      : [];

  const candidateRows = filteredProfileRows.length > 0 ? filteredProfileRows : fallbackRows;
  const dedupedTokenAddresses = Array.from(
    new Map(candidateRows.map(row => [row.address, row])).values()
  );

  return {
    profile,
    fallbackToken,
    resolvedTokenId: profile?.tokenId ?? params.tokenId ?? fallbackToken?.tokenId ?? 0,
    dedupedTokenAddresses,
  };
}

export async function getOnchainOverviewBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
  }
): Promise<OnchainOverviewResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!context?.profile) {
    return null;
  }

  const { profile, resolvedTokenId, dedupedTokenAddresses } = context;
  const preferredAddress = dedupedTokenAddresses[0]?.address ?? null;

  if (!dataset || !preferredAddress) {
    return {
      tokenId: resolvedTokenId,
      symbol: profile.symbol,
      name: profile.name,
      logoUrl: profile.logoUrl,
      currentPrice: profile.currentPrice,
      priceChange24h: profile.priceChange24h,
      totalSupply: profile.totalSupply,
      circulatingSupply: profile.circulatingSupply,
      marketCap: profile.marketCap,
      fdv: profile.fdv,
      tokenHolderCount: profile.tokenHolderCount,
      holderCountChange24h: null,
      tokenAddress: preferredAddress?.toLowerCase() ?? null,
      holderSnapshotDate: null,
      top10Balance: null,
      top10Ratio: null,
      top50Balance: null,
      top50Ratio: null,
      top100Balance: null,
      top100Ratio: null,
      holderHistory: [],
      increaseRows: [],
      decreaseRows: [],
    };
  }

  try {
    const holderCountsQuery = `
      SELECT
        CAST(snapshot_date AS STRING) AS snapshotDate,
        COUNT(*) AS holderCount
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
      WHERE LOWER(token_address) = @tokenAddress
      ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
      GROUP BY snapshotDate
      ORDER BY snapshotDate DESC
      LIMIT 30
    `;

    const [holderCountRows] = await bigQuery.query({
      query: holderCountsQuery,
      params: {
        tokenAddress: preferredAddress.toLowerCase(),
        ...(options?.chainId ? { chainId: options.chainId } : {}),
      },
      useLegacySql: false,
    });

    const latestHolderCount = Number((holderCountRows[0] as { holderCount?: string | number } | undefined)?.holderCount ?? NaN);
    const previousHolderCount = Number((holderCountRows[1] as { holderCount?: string | number } | undefined)?.holderCount ?? NaN);
    const resolvedHolderCount =
      Number.isFinite(latestHolderCount) && latestHolderCount > 0 ? latestHolderCount : profile.tokenHolderCount;
    const holderCountChange24h =
      Number.isFinite(latestHolderCount) &&
      Number.isFinite(previousHolderCount) &&
      previousHolderCount > 0
        ? ((latestHolderCount - previousHolderCount) / previousHolderCount) * 100
        : null;
    const holderHistory = holderCountRows
      .map(row => ({
        snapshotDate: String((row as { snapshotDate?: string }).snapshotDate ?? "").trim(),
        holderCount: Number((row as { holderCount?: string | number }).holderCount ?? 0),
      }))
      .filter(item => item.snapshotDate && Number.isFinite(item.holderCount))
      .reverse();

    const topBalanceQuery = `
      SELECT
        SUM(IF(balance_rank <= 10, SAFE_CAST(balance AS NUMERIC), 0)) AS top10Balance,
        SUM(IF(balance_rank <= 50, SAFE_CAST(balance AS NUMERIC), 0)) AS top50Balance,
        SUM(IF(balance_rank <= 100, SAFE_CAST(balance AS NUMERIC), 0)) AS top100Balance
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
      WHERE LOWER(token_address) = @tokenAddress
        ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
        AND snapshot_date = DATE(@snapshotDate)
    `;
    const [topBalanceRows] = await bigQuery.query({
      query: topBalanceQuery,
      params: {
        tokenAddress: preferredAddress.toLowerCase(),
        snapshotDate: holderHistory.at(-1)?.snapshotDate ?? String((holderCountRows[0] as { snapshotDate?: string } | undefined)?.snapshotDate ?? ""),
        ...(options?.chainId ? { chainId: options.chainId } : {}),
      },
      useLegacySql: false,
    });
    const top10Balance = toNullableNumber((topBalanceRows[0] as { top10Balance?: string | number | null } | undefined)?.top10Balance);
    const top50Balance = toNullableNumber((topBalanceRows[0] as { top50Balance?: string | number | null } | undefined)?.top50Balance);
    const top100Balance = toNullableNumber((topBalanceRows[0] as { top100Balance?: string | number | null } | undefined)?.top100Balance);
    const totalSupply = profile.totalSupply ?? 0;
    const latestSnapshotDate =
      holderHistory.at(-1)?.snapshotDate ??
      String((holderCountRows[0] as { snapshotDate?: string } | undefined)?.snapshotDate ?? "");

    const topChangesQuery = `
      SELECT
        LOWER(holder_address) AS holderAddress,
        balance,
        balance_delta24h AS balanceChange24h,
        is_new AS isNew
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
      WHERE LOWER(token_address) = @tokenAddress
        ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
        AND snapshot_date = DATE(@snapshotDate)
      ORDER BY SAFE_CAST(balance AS NUMERIC) DESC
      LIMIT 200
    `;
    const [topChangeRows] = await bigQuery.query({
      query: topChangesQuery,
      params: {
        tokenAddress: preferredAddress.toLowerCase(),
        snapshotDate: latestSnapshotDate,
        ...(options?.chainId ? { chainId: options.chainId } : {}),
      },
      useLegacySql: false,
    });
    const topChangeAddresses = topChangeRows
      .map(row => String((row as { holderAddress?: string }).holderAddress ?? "").toLowerCase())
      .filter(Boolean);
    const [topWalletRows] = topChangeAddresses.length
      ? await bigQuery.query({
          query: `
            SELECT
              LOWER(address) AS address,
              tag_label,
              tags_base,
              is_contract,
              CAST(last_tx_time AS STRING) AS lastTxTime
            FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
            WHERE LOWER(address) IN UNNEST(@addresses)
          `,
          params: { addresses: topChangeAddresses },
          useLegacySql: false,
        })
      : [[]];
    const topWalletMeta = new Map<
      string,
      {
        label: string;
        kind: string;
        isContract: boolean;
        lastTxTime: string | null;
      }
    >();
    topWalletRows.forEach(row => {
      const address = String((row as { address?: string }).address ?? "").toLowerCase();
      if (!address) return;
      const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
      const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
      const isContract = Boolean((row as { is_contract?: boolean | null }).is_contract);
      topWalletMeta.set(address, {
        label: formatAddressTagLabel(tagLabel ?? tagsBase),
        kind: tagsBase ?? (isContract ? "合约地址" : "普通地址"),
        isContract,
        lastTxTime: String((row as { lastTxTime?: string | null }).lastTxTime ?? "").trim() || null,
      });
    });

    const topChangeEntries = topChangeRows.map(row => {
      const address = String((row as { holderAddress?: string }).holderAddress ?? "").toLowerCase();
      const rawChangeBalance = toNullableNumber((row as { balanceChange24h?: string | number | null }).balanceChange24h) ?? 0;
      const currentBalance = toNullableNumber((row as { balance?: string | number | null }).balance);
      const meta = topWalletMeta.get(address);
      return {
        address,
        label: meta?.label ?? "普通地址",
        kind: meta?.kind ?? "普通地址",
        rawChangeBalance,
        currentBalance,
        firstSeen: Boolean((row as { isNew?: boolean | null }).isNew) ? latestSnapshotDate : meta?.lastTxTime ?? null,
      };
    });

    const increaseRows = topChangeEntries
      .filter(item => item.rawChangeBalance > 0)
      .map(item => ({
        address: item.address,
        label: item.label,
        kind: item.kind,
        changeBalance: item.rawChangeBalance,
        currentBalance: item.currentBalance,
        firstSeen: item.firstSeen,
      }))
      .sort((left, right) => right.changeBalance - left.changeBalance)
      .slice(0, 10);

    const decreaseRows = topChangeEntries
      .filter(item => item.rawChangeBalance < 0)
      .map(item => ({
        address: item.address,
        label: item.label,
        kind: item.kind,
        changeBalance: Math.abs(item.rawChangeBalance),
        currentBalance: item.currentBalance,
      }))
      .sort((left, right) => right.changeBalance - left.changeBalance)
      .slice(0, 10);

    return {
      tokenId: resolvedTokenId,
      symbol: profile.symbol,
      name: profile.name,
      logoUrl: profile.logoUrl,
      currentPrice: profile.currentPrice,
      priceChange24h: profile.priceChange24h,
      totalSupply: profile.totalSupply,
      circulatingSupply: profile.circulatingSupply,
      marketCap: profile.marketCap,
      fdv: profile.fdv,
      tokenHolderCount: resolvedHolderCount,
      holderCountChange24h,
      tokenAddress: preferredAddress.toLowerCase(),
      holderSnapshotDate: String((holderCountRows[0] as { snapshotDate?: string } | undefined)?.snapshotDate ?? "").trim() || null,
      top10Balance,
      top10Ratio: totalSupply > 0 && top10Balance != null ? (top10Balance / totalSupply) * 100 : null,
      top50Balance,
      top50Ratio: totalSupply > 0 && top50Balance != null ? (top50Balance / totalSupply) * 100 : null,
      top100Balance,
      top100Ratio: totalSupply > 0 && top100Balance != null ? (top100Balance / totalSupply) * 100 : null,
      holderHistory,
      increaseRows,
      decreaseRows,
    };
  } catch {
    return {
      tokenId: resolvedTokenId,
      symbol: profile.symbol,
      name: profile.name,
      logoUrl: profile.logoUrl,
      currentPrice: profile.currentPrice,
      priceChange24h: profile.priceChange24h,
      totalSupply: profile.totalSupply,
      circulatingSupply: profile.circulatingSupply,
      marketCap: profile.marketCap,
      fdv: profile.fdv,
      tokenHolderCount: profile.tokenHolderCount,
      holderCountChange24h: null,
      tokenAddress: preferredAddress.toLowerCase(),
      holderSnapshotDate: null,
      top10Balance: null,
      top10Ratio: null,
      top50Balance: null,
      top50Ratio: null,
      top100Balance: null,
      top100Ratio: null,
      holderHistory: [],
      increaseRows: [],
      decreaseRows: [],
    };
  }
}

export async function getTokenUnlockViewBySymbol(
  symbol: string,
  tokenId?: number | null
): Promise<TokenUnlockViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const [rows] = await currentPool.query<
    (RowDataPacket & {
      unlockDate: string;
      recipientCategory: string | null;
      unlockAmount: number | null;
      percentageOfTotalSupply: number | null;
    })[]
  >(
    `
      SELECT
        unlock_date AS unlockDate,
        recipient_category AS recipientCategory,
        unlock_amount AS unlockAmount,
        percentage_of_total_supply AS percentageOfTotalSupply
      FROM token_unlocks
      WHERE token_id = ?
      ORDER BY unlock_date ASC, id ASC
    `,
    [profile.tokenId]
  );

  const [allocationRows] = await currentPool.query<
    (RowDataPacket & {
      category: string | null;
      percentage: number | null;
      amount: number | null;
    })[]
  >(
    `
      SELECT
        category AS category,
        percentage AS percentage,
        amount AS amount
      FROM token_allocation
      WHERE token_id = ?
      ORDER BY id ASC
    `,
    [profile.tokenId]
  );

  const preferredCategoryOrder = ["Community", "Ecosystem", "Investors", "Team"];
  const categoryTotals = new Map<string, number>();
  const allocationPercentages = new Map<string, number>();
  const groupedRows = new Map<
    string,
    {
      unlockDate: string;
      categoryValues: Record<string, number | null>;
      monthlyTotalRelease: number;
    }
  >();

  allocationRows.forEach(row => {
    const normalizedCategory = normalizeUnlockCategory(row.category);
    const percentage = row.percentage ?? 0;
    allocationPercentages.set(normalizedCategory, percentage);
    if (!categoryTotals.has(normalizedCategory) && row.amount != null) {
      categoryTotals.set(normalizedCategory, row.amount);
    }
  });

  rows.forEach(row => {
    const normalizedCategory = normalizeUnlockCategory(row.recipientCategory);
    const amount = row.unlockAmount ?? 0;
    const dateKey = row.unlockDate;

    categoryTotals.set(normalizedCategory, (categoryTotals.get(normalizedCategory) ?? 0) + amount);

    const current =
      groupedRows.get(dateKey) ?? {
        unlockDate: dateKey,
        categoryValues: {},
        monthlyTotalRelease: 0,
      };

    current.categoryValues[normalizedCategory] = (current.categoryValues[normalizedCategory] ?? 0) + amount;
    current.monthlyTotalRelease += amount;
    groupedRows.set(dateKey, current);
  });

  const categoryKeySet = new Set<string>([
    ...Array.from(categoryTotals.keys()),
    ...Array.from(allocationPercentages.keys()),
  ]);
  const categoryKeys = Array.from(categoryKeySet).sort((left, right) => {
    const leftIndex = preferredCategoryOrder.indexOf(left);
    const rightIndex = preferredCategoryOrder.indexOf(right);

    if (leftIndex !== -1 || rightIndex !== -1) {
      if (leftIndex === -1) return 1;
      if (rightIndex === -1) return -1;
      return leftIndex - rightIndex;
    }

    return left.localeCompare(right);
  });

  let cumulativeUnlockAmount = 0;

  return {
    tokenId: profile.tokenId,
    categories: categoryKeys.map(key => ({
      key,
      label: key,
      ratio:
        allocationPercentages.get(key) ??
        (profile.totalSupply && profile.totalSupply > 0
          ? ((categoryTotals.get(key) ?? 0) / profile.totalSupply) * 100
          : 0),
    })),
    rows: Array.from(groupedRows.values())
      .sort(
        (left, right) =>
          (parseDbUtcDate(left.unlockDate)?.getTime() ?? 0) -
          (parseDbUtcDate(right.unlockDate)?.getTime() ?? 0)
      )
      .map(row => {
        cumulativeUnlockAmount += row.monthlyTotalRelease;
        const monthlyReleaseRatio =
          profile.totalSupply && profile.totalSupply > 0
            ? (row.monthlyTotalRelease / profile.totalSupply) * 100
            : 0;
        const cumulativeReleaseRatio =
          profile.totalSupply && profile.totalSupply > 0
            ? (cumulativeUnlockAmount / profile.totalSupply) * 100
            : 0;

        return {
          unlockDate: row.unlockDate,
          categoryValues: Object.fromEntries(
            categoryKeys.map(key => [key, row.categoryValues[key] ?? null])
          ),
          monthlyTotalRelease: row.monthlyTotalRelease,
          monthlyReleaseRatio,
          cumulativeRelease: cumulativeUnlockAmount,
          cumulativeReleaseRatio,
        };
      }),
  };
}

export async function getTokenListingViewBySymbol(
  symbol: string,
  tokenId?: number | null
): Promise<TokenListingViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const [listingRows] = await currentPool.query<
    (RowDataPacket & {
      exchangeId: number | null;
      exchangeName: string | null;
      exchangeLogoUrl: string | null;
      marketType: string | null;
      listingTime: string | null;
      depositTime: string | null;
      priceAtList: number | null;
      fdvAtList: number | null;
      marketCapAtList: number | null;
      pairName: string | null;
      pricePost5m: number | null;
      pricePost15m: number | null;
      changePost15m: number | null;
      title: string | null;
      publishedAt: string | null;
      url: string | null;
    })[]
  >(
    `
      SELECT
        el.exchange_id AS exchangeId,
        ep.name AS exchangeName,
        ep.logo_url AS exchangeLogoUrl,
        ep.market_type AS marketType,
        el.listing_time AS listingTime,
        el.deposit_time AS depositTime,
        el.price_at_list AS priceAtList,
        el.fdv_at_list AS fdvAtList,
        el.market_cap_at_list AS marketCapAtList,
        el.pair_name AS pairName,
        el.price_post_5m AS pricePost5m,
        el.price_post_15m AS pricePost15m,
        el.change_post_15m AS changePost15m,
        ea.title AS title,
        ea.published_at AS publishedAt,
        ea.url AS url
      FROM exchange_listings el
      LEFT JOIN exchange_platforms ep ON ep.id = el.exchange_id
      LEFT JOIN exchange_announcements ea ON ea.id = el.announcement_id
      WHERE el.token_id = ?
      ORDER BY el.listing_time DESC, el.id DESC
    `,
    [profile.tokenId]
  );

  const [activityRows] = await currentPool.query<
    (RowDataPacket & {
      exchangeId: number | null;
      exchangeName: string | null;
      exchangeLogoUrl: string | null;
      marketType: string | null;
      activityType: string | null;
      title: string;
      publisher: string | null;
      rewardToken: string | null;
      rewardAmount: number | null;
      estimatedValue: number | null;
      dilutionRatio: string | null;
      description: string | null;
      participationThreshold: string | null;
      operationSteps: string | null;
      startTime: string | null;
      endTime: string | null;
      rewardDistributionTime: string | null;
      publishedAt: string | null;
      url: string | null;
    })[]
  >(
    `
      SELECT
        ea.exchange_id AS exchangeId,
        ep.name AS exchangeName,
        ep.logo_url AS exchangeLogoUrl,
        ep.market_type AS marketType,
        ea.activity_type AS activityType,
        ea.title AS title,
        ea.publisher AS publisher,
        ea.reward_token AS rewardToken,
        ea.reward_amount AS rewardAmount,
        ea.estimated_value AS estimatedValue,
        ea.dilution_ratio AS dilutionRatio,
        ea.description AS description,
        ea.participation_threshold AS participationThreshold,
        ea.operation_steps AS operationSteps,
        ea.start_time AS startTime,
        ea.end_time AS endTime,
        ea.reward_distribution_time AS rewardDistributionTime,
        ann.published_at AS publishedAt,
        ann.url AS url
      FROM exchange_activities ea
      LEFT JOIN exchange_platforms ep ON ep.id = ea.exchange_id
      LEFT JOIN exchange_announcements ann ON ann.id = ea.announcement_id
      WHERE ea.token_id = ?
      ORDER BY ea.start_time DESC, ea.id DESC
    `,
    [profile.tokenId]
  );

  const items = [
    ...listingRows.map((row, index) => ({
      id: `listing-${row.exchangeId ?? "unknown"}-${index}`,
      exchangeId: row.exchangeId,
      exchangeName: row.exchangeName ?? "Unknown Exchange",
      exchangeLogoUrl: row.exchangeLogoUrl,
      marketType: row.marketType,
      eventType: "listing" as const,
      title: row.title ?? `${profile.symbol} 上线 ${row.exchangeName ?? "交易所"}`,
      date: row.listingTime,
      depositTime: row.depositTime,
      priceAtList: row.priceAtList,
      fdvAtList: row.fdvAtList,
      marketCapAtList: row.marketCapAtList,
      pairName: row.pairName,
      pricePost5m: row.pricePost5m,
      pricePost15m: row.pricePost15m,
      changePost15m: row.changePost15m,
      publisher: null,
      activityType: null,
      rewardToken: null,
      rewardAmount: null,
      estimatedValue: null,
      dilutionRatio: null,
      description: null,
      participationThreshold: null,
      operationSteps: null,
      endTime: null,
      rewardDistributionTime: null,
      publishedAt: row.publishedAt,
      url: row.url,
    })),
    ...activityRows.map((row, index) => ({
      id: `activity-${row.exchangeId ?? "unknown"}-${index}`,
      exchangeId: row.exchangeId,
      exchangeName: row.exchangeName ?? row.publisher ?? "Activity",
      exchangeLogoUrl: row.exchangeLogoUrl,
      marketType: row.marketType,
      eventType: "activity" as const,
      title: row.title,
      date: row.startTime,
      depositTime: null,
      priceAtList: null,
      fdvAtList: null,
      marketCapAtList: null,
      pairName: null,
      pricePost5m: null,
      pricePost15m: null,
      changePost15m: null,
      publisher: row.publisher,
      activityType: row.activityType,
      rewardToken: row.rewardToken,
      rewardAmount: row.rewardAmount,
      estimatedValue: row.estimatedValue,
      dilutionRatio: row.dilutionRatio,
      description: row.description,
      participationThreshold: row.participationThreshold,
      operationSteps: row.operationSteps,
      endTime: row.endTime,
      rewardDistributionTime: row.rewardDistributionTime,
      publishedAt: row.publishedAt,
      url: row.url,
    })),
  ].sort((left, right) => {
    const leftTime = left.date ? (parseDbUtcDate(left.date)?.getTime() ?? 0) : 0;
    const rightTime = right.date ? (parseDbUtcDate(right.date)?.getTime() ?? 0) : 0;
    return rightTime - leftTime;
  });

  return {
    tokenId: profile.tokenId,
    items,
  };
}

export async function getTokenKlineBySymbol(
  symbol: string,
  range: TokenKlineRange = "3m",
  tokenId?: number | null
): Promise<TokenKlineResult | null> {
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const cmcIdentifier = String(profile.coinMarketCapId ?? "").trim();
  const cgIdentifier = String(profile.coinGeckoId ?? "").trim();
  const { bucketHours } = getKlineRangeConfig(range);

  const errors: string[] = [];

  if (cmcIdentifier && canUseCoinMarketCapForKline(range)) {
    try {
      const points = await fetchCoinMarketCapKline(cmcIdentifier, range);
      const normalizedPoints = bucketKlinePoints(points, bucketHours);
      if (normalizedPoints.length > 0 && isKlineSeriesConsistentWithCurrentPrice(normalizedPoints, profile.currentPrice)) {
        return {
          tokenId: profile.tokenId,
          source: "coinmarketcap",
          range,
          points: normalizedPoints,
        };
      }
      errors.push(normalizedPoints.length > 0 ? "CMC kline mismatched current price" : "CMC returned no points");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "CMC request failed");
    }
  } else if (cmcIdentifier) {
    errors.push(`CMC skipped for ${range} because current plan only supports recent 3-month history`);
  }

  if (cgIdentifier) {
    try {
      const points = await fetchCoinGeckoKline(cgIdentifier, range);
      const normalizedPoints = bucketKlinePoints(points, bucketHours);
      if (normalizedPoints.length > 0 && isKlineSeriesConsistentWithCurrentPrice(normalizedPoints, profile.currentPrice)) {
        return {
          tokenId: profile.tokenId,
          source: "coingecko",
          range,
          points: normalizedPoints,
        };
      }
      errors.push(normalizedPoints.length > 0 ? "CoinGecko kline mismatched current price" : "CoinGecko returned no points");
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "CoinGecko request failed");
    }
  }

  if (!cmcIdentifier && !cgIdentifier) {
    throw new Error("Missing CoinMarketCap and CoinGecko identifiers for this token");
  }

  throw new Error(errors.join(" | ") || "No kline data source available");
}

export async function screenTokensByDailyBullishStreak(options?: {
  streakDays?: number;
  marketType?: "spot" | "perps";
  maxTokens?: number;
}) {
  const streakDays = Math.min(Math.max(options?.streakDays ?? 4, 2), 10);
  const pageSize = 50;
  const maxTokens = Math.min(Math.max(options?.maxTokens ?? 16, 8), 50);
  const concurrency = 4;
  const perTokenTimeoutMs = 8_000;
  const candidates: Array<Awaited<ReturnType<typeof listMarketTokens>>["items"][number]> = [];

  let page = 1;
  while (candidates.length < maxTokens) {
    const batch = await listMarketTokens({
      marketType: options?.marketType ?? "spot",
      sortBy: "listedAt",
      sortOrder: "desc",
      page,
      pageSize,
    });

    if (batch.items.length === 0) {
      break;
    }

    candidates.push(...batch.items);
    if (batch.items.length < pageSize) {
      break;
    }
    page += 1;
  }

  const uniqueCandidates = Array.from(
    new Map(candidates.slice(0, maxTokens).map(item => [item.symbol.toUpperCase(), item])).values()
  );

  const matches: Array<{
    symbol: string;
    name: string;
    source: "coinmarketcap" | "coingecko";
    latestDate: string | null;
    streakDays: number;
    latestClose: number | null;
    candles: Array<{
      time: string;
      open: number | null;
      close: number | null;
    }>;
  }> = [];
  const skipped: Array<{ symbol: string; reason: string }> = [];

  for (let index = 0; index < uniqueCandidates.length; index += concurrency) {
    const chunk = uniqueCandidates.slice(index, index + concurrency);
    const results = await Promise.all(
      chunk.map(async token => {
        try {
          const kline = await withTimeout(
            getTokenKlineBySymbol(token.symbol, "6m"),
            perTokenTimeoutMs,
            `${token.symbol} kline timeout`
          );
          if (!kline) {
            return { type: "skip" as const, symbol: token.symbol, reason: "missing_kline" };
          }

          const dailyPoints = kline.points
            .filter(point => point.open != null && point.close != null)
            .slice(-streakDays);

          if (dailyPoints.length < streakDays) {
            return { type: "skip" as const, symbol: token.symbol, reason: "insufficient_daily_points" };
          }

          const isBullishStreak = dailyPoints.every(point => (point.close ?? 0) > (point.open ?? 0));
          if (!isBullishStreak) {
            return null;
          }

          const latestPoint = dailyPoints.at(-1) ?? null;
          return {
            type: "match" as const,
            payload: {
              symbol: token.symbol,
              name: token.name,
              source: kline.source,
              latestDate: latestPoint?.time ?? null,
              streakDays,
              latestClose: latestPoint?.close ?? null,
              candles: dailyPoints.map(point => ({
                time: point.time,
                open: point.open,
                close: point.close,
              })),
            },
          };
        } catch (error) {
          return {
            type: "skip" as const,
            symbol: token.symbol,
            reason: error instanceof Error ? error.message : "kline_fetch_failed",
          };
        }
      })
    );

    results.forEach(result => {
      if (!result) return;
      if (result.type === "match") {
        matches.push(result.payload);
        return;
      }
      skipped.push({ symbol: result.symbol, reason: result.reason });
    });
  }

  matches.sort((left, right) => {
    const leftTs = left.latestDate ? new Date(left.latestDate).getTime() : 0;
    const rightTs = right.latestDate ? new Date(right.latestDate).getTime() : 0;
    return rightTs - leftTs;
  });

  return {
    streakDays,
    scannedTokens: uniqueCandidates.length,
    matchedTokens: matches.length,
    matches,
    skipped: skipped.slice(0, 30),
    marketType: options?.marketType ?? "spot",
  };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(label)), timeoutMs);
    }),
  ]);
}

export async function searchAnnouncements(options: {
  query?: string;
  symbol?: string;
  exchangeSlug?: string;
  type?: "listing" | "delisting" | "event" | "other";
  limit?: number;
}): Promise<AnnouncementSearchResult> {
  const currentPool = getPool();
  const params: Array<string | number> = [];
  const where: string[] = [];
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  if (options.exchangeSlug?.trim()) {
    where.push("LOWER(ea.exchange_slug) = LOWER(?)");
    params.push(options.exchangeSlug.trim());
  }

  if (options.query?.trim()) {
    const query = `%${options.query.trim()}%`;
    where.push(
      "(ea.title LIKE ? OR ea.content_summary LIKE ? OR ea.content LIKE ?)"
    );
    params.push(query, query, query);
  }

  if (options.type) {
    if (options.type === "listing") {
      where.push("COALESCE(ea.is_listing, 0) <> 0");
    } else if (options.type === "delisting") {
      where.push("COALESCE(ea.is_delisting_risk, 0) <> 0");
    } else if (options.type === "event") {
      where.push("COALESCE(ea.is_activity, 0) <> 0");
    } else {
      where.push("COALESCE(ea.is_listing, 0) = 0 AND COALESCE(ea.is_delisting_risk, 0) = 0 AND COALESCE(ea.is_activity, 0) = 0");
    }
  }

  if (options.symbol?.trim()) {
    where.push(`
      (
        EXISTS (
          SELECT 1
          FROM exchange_listings el
          JOIN token_profiles tp ON tp.id = el.token_id
          WHERE el.announcement_id = ea.id
            AND UPPER(tp.symbol) = UPPER(?)
        )
        OR EXISTS (
          SELECT 1
          FROM exchange_activities act
          JOIN token_profiles tp ON tp.id = act.token_id
          WHERE act.announcement_id = ea.id
            AND UPPER(tp.symbol) = UPPER(?)
        )
        OR UPPER(ea.title) LIKE UPPER(?)
        OR UPPER(COALESCE(ea.content_summary, '')) LIKE UPPER(?)
      )
    `);
    params.push(options.symbol.trim(), options.symbol.trim(), `%${options.symbol.trim()}%`, `%${options.symbol.trim()}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      ea.id AS id,
      ea.title AS title,
      ea.exchange_slug AS exchangeSlug,
      ea.published_at AS publishedAt,
      ea.content_summary AS summary,
      ea.url AS url,
      ea.is_listing AS isListing,
      ea.is_delisting_risk AS isDelistingRisk,
      ea.is_activity AS isActivity
    FROM exchange_announcements ea
    ${whereClause}
    ORDER BY ea.published_at DESC, ea.id DESC
    LIMIT ?
  `;

  const [rows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      title: string;
      exchangeSlug: string | null;
      publishedAt: string | null;
      summary: string | null;
      url: string | null;
      isListing: number | null;
      isDelistingRisk: number | null;
      isActivity: number | null;
    })[]
  >(sql, [...params, limit]);

  return {
    items: rows.map(row => ({
      id: row.id,
      title: row.title,
      exchangeSlug: row.exchangeSlug,
      publishedAt: row.publishedAt,
      summary: row.summary,
      url: row.url,
      type: row.isListing ? "listing" : row.isDelistingRisk ? "delisting" : row.isActivity ? "event" : "other",
    })),
    total: rows.length,
  };
}

export async function getRecentListingsByExchanges(options: {
  exchangeSlugs: string[];
  days?: number;
  limit?: number;
}): Promise<ExchangeListingAnnouncementResult> {
  const currentPool = getPool();
  const exchangeSlugs = Array.from(
    new Set(
      options.exchangeSlugs
        .map(item => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const days = Math.min(Math.max(options.days ?? 60, 1), 365);
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  if (exchangeSlugs.length === 0) {
    return { items: [], total: 0 };
  }

  const placeholders = exchangeSlugs.map(() => "?").join(", ");
  const [rows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      exchangeSlug: string | null;
      exchangeName: string | null;
      title: string;
      publishedAt: string | null;
      url: string | null;
      summary: string | null;
    })[]
  >(
    `
      SELECT
        ea.id AS id,
        ea.exchange_slug AS exchangeSlug,
        ep.name AS exchangeName,
        ea.title AS title,
        ea.published_at AS publishedAt,
        ea.url AS url,
        ea.content_summary AS summary
      FROM exchange_announcements ea
      LEFT JOIN exchange_platforms ep
        ON LOWER(REPLACE(ep.name, ' spot', '')) = LOWER(ea.exchange_slug)
      WHERE LOWER(ea.exchange_slug) IN (${placeholders})
        AND COALESCE(ea.is_listing, 0) <> 0
        AND ea.published_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
      ORDER BY ea.published_at DESC, ea.id DESC
      LIMIT ?
    `,
    [...exchangeSlugs, days, limit]
  );

  return {
    items: rows.map(row => ({
      id: row.id,
      exchangeSlug: row.exchangeSlug,
      exchangeName: row.exchangeName ?? row.exchangeSlug ?? "Unknown Exchange",
      title: row.title,
      publishedAt: row.publishedAt,
      url: row.url,
      summary: row.summary,
    })),
    total: rows.length,
  };
}

export async function searchListingAnnouncements(options: {
  query?: string;
  exchangeSlug?: string;
  limit?: number;
}): Promise<ListingAnnouncementSearchResult> {
  const currentPool = getPool();
  const params: Array<string | number> = [];
  const where = [
    "ep.market_type NOT IN ('tradfi', 'onchain')",
    "el.listing_time IS NOT NULL",
  ];
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);

  if (options.exchangeSlug?.trim()) {
    where.push("LOWER(ep.slug) = LOWER(?)");
    params.push(options.exchangeSlug.trim());
  }

  if (options.query?.trim()) {
    const keyword = `%${options.query.trim()}%`;
    where.push(`
      (
        tp.symbol LIKE ?
        OR tp.name LIKE ?
        OR el.pair_name LIKE ?
        OR COALESCE(ea.title, '') LIKE ?
        OR ep.name LIKE ?
      )
    `);
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  const sql = `
    SELECT
      el.id AS listingId,
      el.token_id AS tokenId,
      tp.symbol AS symbol,
      tp.name AS tokenName,
      ep.id AS exchangeId,
      ep.name AS exchangeName,
      ep.slug AS exchangeSlug,
      ep.market_type AS marketType,
      el.pair_name AS pairName,
      el.deposit_time AS depositTime,
      el.listing_time AS listingTime,
      ea.title AS announcementTitle,
      ea.url AS announcementUrl,
      ea.published_at AS publishedAt
    FROM exchange_listings el
    JOIN token_profiles tp ON tp.id = el.token_id
    JOIN exchange_platforms ep ON ep.id = el.exchange_id
    LEFT JOIN exchange_announcements ea ON ea.id = el.announcement_id
    WHERE ${where.join(" AND ")}
    ORDER BY el.listing_time DESC, el.id DESC
    LIMIT ?
  `;

  const [rows] = await currentPool.query<
    (RowDataPacket & {
      listingId: number;
      tokenId: number;
      symbol: string;
      tokenName: string;
      exchangeId: number;
      exchangeName: string;
      exchangeSlug: string | null;
      marketType: string | null;
      pairName: string | null;
      depositTime: string | null;
      listingTime: string | null;
      announcementTitle: string | null;
      announcementUrl: string | null;
      publishedAt: string | null;
    })[]
  >(sql, [...params, limit]);

  return {
    items: rows.map(row => ({
      id: `listing-${row.listingId}`,
      tokenId: row.tokenId,
      symbol: row.symbol,
      tokenName: row.tokenName,
      exchangeId: row.exchangeId,
      exchangeName: row.exchangeName,
      exchangeSlug: row.exchangeSlug,
      marketType: row.marketType,
      pairName: row.pairName,
      depositTime: row.depositTime,
      listingTime: row.listingTime,
      announcementTitle: row.announcementTitle,
      announcementUrl: row.announcementUrl,
      publishedAt: row.publishedAt,
    })),
    total: rows.length,
  };
}

export async function getTokenDepthViewBySymbol(
  symbol: string,
  marketType?: "spot" | "perps",
  tokenId?: number | null
): Promise<TokenDepthViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const marketCondition =
    marketType === "perps"
      ? "AND ep.market_type = 'perps'"
      : marketType === "spot"
        ? "AND ep.market_type <> 'perps'"
        : "";

  const [rows] = await currentPool.query<
    (RowDataPacket & TokenDepthViewResult["items"][number])[]
  >(
    `
      SELECT
        ep.id AS exchangeId,
        ep.name AS exchangeName,
        ep.logo_url AS exchangeLogoUrl,
        ep.market_type AS marketType,
        p.pair_name AS pairName,
        p.quote_currency AS quoteCurrency,
        p.price AS price,
        p.volume_24h AS volume24h,
        p.depth_buy_2 AS depthBuy2,
        p.depth_sell_2 AS depthSell2,
        p.funding_rate AS fundingRate,
        p.open_interest AS openInterest,
        p.listing_time AS listingTime
      FROM exchange_pairs p
      JOIN exchange_platforms ep ON ep.id = p.exchange_id
      WHERE p.token_id = ?
        AND ep.market_type NOT IN ('tradfi', 'onchain')
        ${marketCondition}
      ORDER BY COALESCE(p.volume_24h, 0) DESC, ep.name ASC, p.id DESC
    `,
    [profile.tokenId]
  );

  return {
    tokenId: profile.tokenId,
    items: rows.map(row => ({
      exchangeId: row.exchangeId,
      exchangeName: row.exchangeName,
      exchangeLogoUrl: row.exchangeLogoUrl,
      marketType: row.marketType,
      pairName: row.pairName,
      quoteCurrency: row.quoteCurrency,
      price: row.price,
      volume24h: row.volume24h,
      depthBuy2: row.depthBuy2,
      depthSell2: row.depthSell2,
      fundingRate: row.fundingRate,
      openInterest: row.openInterest,
      listingTime: row.listingTime,
    })),
  };
}

export async function getTokenDepthTrendBySymbol(
  symbol: string,
  days = 14,
  marketType?: "spot" | "perps",
  tokenId?: number | null
): Promise<TokenDepthTrendResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const safeDays = Math.min(Math.max(days, 7), 365);
  const depthDailyBucketExpression = `DATE_FORMAT(
    DATE_SUB(DATE(snapshot_ts), INTERVAL 8 HOUR),
    '%Y-%m-%d %H:%i:%s'
  )`;

  const marketCondition =
    marketType === "perps"
      ? "AND ep.market_type = 'perps'"
      : marketType === "spot"
        ? "AND ep.market_type <> 'perps'"
        : "";

  const [summaryRows] = await currentPool.query<
    (RowDataPacket & TokenDepthTrendResult["summary"])[]
  >(
    `
      SELECT
        AVG(p.price) AS latestPrice,
        SUM(p.volume_24h) AS totalVolume24h,
        SUM(p.depth_buy_2) AS totalDepthBuy2,
        SUM(p.depth_sell_2) AS totalDepthSell2,
        DATE_FORMAT(
          DATE_SUB(MAX(p.updated_at), INTERVAL 8 HOUR),
          '%Y-%m-%d %H:%i:%s'
        ) AS latestSnapshotTs
      FROM exchange_pairs p
      JOIN exchange_platforms ep ON ep.id = p.exchange_id
      WHERE p.token_id = ?
        AND ep.market_type NOT IN ('tradfi', 'onchain')
        ${marketCondition}
    `,
    [profile.tokenId]
  );

  const [pointRows] = await currentPool.query<
    (RowDataPacket & TokenDepthTrendResult["points"][number])[]
  >(
    `
      SELECT
        daily_points.snapshotDate AS snapshotDate,
        snapshot_volume.totalVolume AS totalVolume,
        daily_points.totalDepthBuy2 AS totalDepthBuy2,
        daily_points.totalDepthSell2 AS totalDepthSell2
      FROM (
        SELECT *
        FROM (
          SELECT
            ${depthDailyBucketExpression} AS snapshotDate,
            SUM(bid_amt) AS totalDepthBuy2,
            SUM(ask_amt) AS totalDepthSell2
          FROM token_trade_depth_daily
          JOIN exchange_platforms ep ON ep.id = token_trade_depth_daily.exchange_id
          WHERE token_id = ?
            AND ep.market_type NOT IN ('tradfi', 'onchain')
            ${marketCondition}
          GROUP BY ${depthDailyBucketExpression}
          ORDER BY ${depthDailyBucketExpression} DESC
          LIMIT ?
        ) recent_daily
        ORDER BY snapshotDate ASC
      ) daily_points
      LEFT JOIN (
        SELECT
          ${depthDailyBucketExpression} AS snapshotDate,
          SUM(volume_24h) AS totalVolume
        FROM token_trade_depth_snapshot
        JOIN exchange_platforms ep ON ep.id = token_trade_depth_snapshot.exchange_id
        WHERE token_id = ?
          AND ep.market_type NOT IN ('tradfi', 'onchain')
          ${marketCondition}
        GROUP BY ${depthDailyBucketExpression}
      ) snapshot_volume ON snapshot_volume.snapshotDate = daily_points.snapshotDate
    `,
    [profile.tokenId, safeDays, profile.tokenId]
  );

  return {
    tokenId: profile.tokenId,
    summary: {
      latestPrice: toNullableNumber(summaryRows[0]?.latestPrice) ?? profile.currentPrice,
      totalVolume24h: toNullableNumber(summaryRows[0]?.totalVolume24h) ?? profile.volume24h,
      totalDepthBuy2: toNullableNumber(summaryRows[0]?.totalDepthBuy2),
      totalDepthSell2: toNullableNumber(summaryRows[0]?.totalDepthSell2),
      latestSnapshotTs: summaryRows[0]?.latestSnapshotTs ?? null,
    },
    points: pointRows.map(row => ({
      snapshotDate: row.snapshotDate,
      totalVolume: toNullableNumber(row.totalVolume),
      totalDepthBuy2: toNullableNumber(row.totalDepthBuy2),
      totalDepthSell2: toNullableNumber(row.totalDepthSell2),
    })),
  };
}

export async function getExchangeDepthViewBySymbol(
  symbol: string,
  exchangeSlug: string,
  timeframe: "1h" | "4h" | "12h" | "1d" = "1h"
): Promise<ExchangeDepthViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol);

  if (!profile) return null;

  const normalizedExchangeSlug = exchangeSlug.trim().toLowerCase();
  if (!normalizedExchangeSlug) return null;
  const shouldLookupExchangeById = /^\d+$/.test(normalizedExchangeSlug);
  const exchangeLookupCondition = shouldLookupExchangeById
    ? "ep.id = ?"
    : "LOWER(REPLACE(ep.name, ' ', '-')) = ?";
  const exchangeLookupParam = shouldLookupExchangeById
    ? Number(normalizedExchangeSlug)
    : normalizedExchangeSlug;

  const [exchangeRows] = await currentPool.query<
    (RowDataPacket & {
      exchangeId: number;
      exchangeName: string;
      marketType: string | null;
    })[]
  >(
    `
      SELECT
        ep.id AS exchangeId,
        ep.name AS exchangeName,
        ep.market_type AS marketType
      FROM exchange_platforms ep
      WHERE ${exchangeLookupCondition}
      LIMIT 1
    `,
    [exchangeLookupParam]
  );

  const exchange = exchangeRows[0];
  if (!exchange) return null;

  const bucketExpression = buildUtcBucketExpressionFromShanghaiStored("s.snapshot_ts", timeframe);

  const lookbackExpression =
    timeframe === "1h"
      ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)"
      : timeframe === "4h"
        ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 90 DAY)"
        : timeframe === "12h"
          ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)"
          : "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 365 DAY)";

  const [pointRows] = await currentPool.query<
    (RowDataPacket & {
      snapshotDate: string;
      buyDepth: number | null;
      sellDepth: number | null;
    })[]
  >(
    `
      SELECT
        ${bucketExpression} AS snapshotDate,
        AVG(s.depth_buy_2) AS buyDepth,
        AVG(s.depth_sell_2) AS sellDepth
      FROM token_trade_depth_snapshot s
      WHERE s.token_id = ?
        AND s.exchange_id = ?
        AND s.snapshot_ts >= ${lookbackExpression}
      GROUP BY ${bucketExpression}
      ORDER BY snapshotDate ASC
    `,
    [profile.tokenId, exchange.exchangeId]
  );

  return {
    tokenId: profile.tokenId,
    exchangeId: exchange.exchangeId,
    exchangeName: exchange.exchangeName,
    marketType: exchange.marketType,
    timeframe,
    points: pointRows.map(row => {
      const buyDepth = toNullableNumber(row.buyDepth);
      const sellDepth = toNullableNumber(row.sellDepth);
      const totalDepth = buyDepth != null || sellDepth != null ? (buyDepth ?? 0) + (sellDepth ?? 0) : null;
      const spread =
        buyDepth != null && sellDepth != null && buyDepth + sellDepth > 0
          ? (Math.abs(buyDepth - sellDepth) / ((buyDepth + sellDepth) / 2)) * 100
          : null;

      return {
        snapshotDate: row.snapshotDate,
        buyDepth,
        sellDepth,
        totalDepth,
        spread,
      };
    }),
  };
}

export async function getTokenHoldersViewBySymbol(
  symbol: string,
  timeframe: "1h" | "4h" | "12h" | "1d" = "4h",
  tokenId?: number | null
): Promise<TokenHoldersViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const bucketExpression = buildUtcBucketExpression("f.snapshot_ts", timeframe);

  const lookbackExpression =
    timeframe === "1h"
      ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)"
      : timeframe === "4h"
        ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)"
        : timeframe === "12h"
          ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)"
          : "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)";

  const [seriesRows] = await currentPool.query<
    (RowDataPacket & TokenHoldersViewResult["series"][number])[]
  >(
    `
      SELECT
        ${bucketExpression} AS snapshotDate,
        SUM(f.open_interest) AS totalOpenInterest,
        AVG(f.funding_rate) AS fundingRate
      FROM funding_rate_daily f
      JOIN exchange_platforms ep ON ep.id = f.exchange_id
      WHERE f.token_id = ?
        AND ep.market_type = 'perps'
        AND f.snapshot_ts >= ${lookbackExpression}
      GROUP BY ${bucketExpression}
      ORDER BY snapshotDate ASC
    `,
    [profile.tokenId]
  );

  const [itemRows] = await currentPool.query<
    (RowDataPacket & TokenHoldersViewResult["items"][number])[]
  >(
    `
      SELECT
        ep.id AS exchangeId,
        ep.name AS exchangeName,
        ep.logo_url AS exchangeLogoUrl,
        ep.market_type AS marketType,
        p.pair_name AS pairName,
        p.price AS price,
        p.volume_24h AS volume24h,
        p.funding_rate AS fundingRate,
        p.open_interest AS openInterest
      FROM exchange_pairs p
      JOIN exchange_platforms ep ON ep.id = p.exchange_id
      WHERE p.token_id = ?
        AND ep.market_type = 'perps'
      ORDER BY COALESCE(p.open_interest, 0) DESC, COALESCE(p.volume_24h, 0) DESC, ep.name ASC
    `,
    [profile.tokenId]
  );

  const totalVolume = itemRows.reduce((sum, row) => sum + (toNullableNumber(row.volume24h) ?? 0), 0);
  const latestSeriesDate = [...seriesRows]
    .map(row => row.snapshotDate)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    tokenId: profile.tokenId,
    updatedAt: latestSeriesDate,
    series: seriesRows.map(row => ({
      snapshotDate: row.snapshotDate,
      totalOpenInterest: toNullableNumber(row.totalOpenInterest),
      fundingRate: toNullableNumber(row.fundingRate),
    })),
    items: itemRows.map(row => {
      const volume24h = toNullableNumber(row.volume24h);

      return {
        exchangeId: row.exchangeId,
        exchangeName: row.exchangeName,
        exchangeLogoUrl: row.exchangeLogoUrl,
        marketType: row.marketType,
        pairName: row.pairName,
        price: toNullableNumber(row.price),
        volume24h,
        marketShare: totalVolume > 0 && volume24h != null ? (volume24h / totalVolume) * 100 : null,
        fundingRate: toNullableNumber(row.fundingRate),
        openInterest: toNullableNumber(row.openInterest),
      };
    }),
  };
}

export async function getExchangeHoldersViewBySymbol(
  symbol: string,
  exchangeSlug: string,
  timeframe: "1h" | "4h" | "12h" | "1d" = "1d",
  page = 1,
  pageSize = 20
): Promise<ExchangeHoldersViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol);

  if (!profile) return null;

  const normalizedExchangeSlug = exchangeSlug.trim().toLowerCase();
  if (!normalizedExchangeSlug) return null;
  const shouldLookupExchangeById = /^\d+$/.test(normalizedExchangeSlug);
  const exchangeLookupCondition = shouldLookupExchangeById
    ? "ep.id = ?"
    : "LOWER(REPLACE(ep.name, ' ', '-')) = ?";
  const exchangeLookupParam = shouldLookupExchangeById
    ? Number(normalizedExchangeSlug)
    : normalizedExchangeSlug;

  const [exchangeRows] = await currentPool.query<
    (RowDataPacket & {
      exchangeId: number;
      exchangeName: string;
      marketType: string | null;
      latestPrice: number | null;
      latestVolume24h: number | null;
      latestOpenInterest: number | null;
      latestFundingRate: number | null;
    })[]
  >(
    `
      SELECT
        ep.id AS exchangeId,
        ep.name AS exchangeName,
        ep.market_type AS marketType,
        p.price AS latestPrice,
        p.volume_24h AS latestVolume24h,
        p.open_interest AS latestOpenInterest,
        p.funding_rate AS latestFundingRate
      FROM exchange_pairs p
      JOIN exchange_platforms ep ON ep.id = p.exchange_id
      WHERE p.token_id = ?
        AND ${exchangeLookupCondition}
        AND ep.market_type = 'perps'
      ORDER BY COALESCE(p.open_interest, 0) DESC, COALESCE(p.volume_24h, 0) DESC, p.id DESC
      LIMIT 1
    `,
    [profile.tokenId, exchangeLookupParam]
  );

  const exchange = exchangeRows[0];
  if (!exchange) return null;

  const bucketExpression = buildUtcBucketExpression("f.snapshot_ts", timeframe);

  const lookbackExpression =
    timeframe === "1h"
      ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR)"
      : timeframe === "4h"
        ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)"
        : timeframe === "12h"
          ? "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)"
          : "DATE_SUB(UTC_TIMESTAMP(), INTERVAL 180 DAY)";

  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(Math.max(pageSize, 10), 100);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const recentAggregateSubquery = `
    SELECT
      ${bucketExpression} AS snapshotDate,
      AVG(f.open_interest) AS openInterest,
      AVG(f.funding_rate) AS fundingRate
    FROM funding_rate_daily f
    WHERE f.token_id = ?
      AND f.exchange_id = ?
      AND f.snapshot_ts >= ${lookbackExpression}
    GROUP BY ${bucketExpression}
  `;
  const fullAggregateSubquery = `
    SELECT
      ${bucketExpression} AS snapshotDate,
      AVG(f.open_interest) AS openInterest,
      AVG(f.funding_rate) AS fundingRate
    FROM funding_rate_daily f
    WHERE f.token_id = ?
      AND f.exchange_id = ?
    GROUP BY ${bucketExpression}
  `;

  const [seriesRows] = await currentPool.query<
    (RowDataPacket & {
      snapshotDate: string;
      openInterest: number | null;
      fundingRate: number | null;
    })[]
  >(
    `
      SELECT
        snapshotDate,
        openInterest,
        fundingRate
      FROM (${recentAggregateSubquery}) history
      ORDER BY snapshotDate DESC
      LIMIT 60
    `,
    [profile.tokenId, exchange.exchangeId]
  );

  const [countRows] = await currentPool.query<(RowDataPacket & { total: number })[]>(
    `
      SELECT COUNT(*) AS total
      FROM (${fullAggregateSubquery}) history
    `,
    [profile.tokenId, exchange.exchangeId]
  );

  const total = Number(countRows[0]?.total ?? 0);

  const [pageRows] = await currentPool.query<
    (RowDataPacket & {
      snapshotDate: string;
      openInterest: number | null;
      fundingRate: number | null;
    })[]
  >(
    `
      SELECT
        snapshotDate,
        openInterest,
        fundingRate
      FROM (${fullAggregateSubquery}) history
      ORDER BY snapshotDate DESC
      LIMIT ? OFFSET ?
    `,
    [profile.tokenId, exchange.exchangeId, normalizedPageSize, offset]
  );

  const latestSeriesDate = seriesRows
    .map(row => row.snapshotDate)
    .filter(Boolean)
    .sort()
    .at(-1) ?? null;

  return {
    tokenId: profile.tokenId,
    exchangeId: exchange.exchangeId,
    exchangeName: exchange.exchangeName,
    marketType: exchange.marketType,
    updatedAt: latestSeriesDate,
    latestPrice: toNullableNumber(exchange.latestPrice),
    latestVolume24h: toNullableNumber(exchange.latestVolume24h),
    latestOpenInterest: toNullableNumber(exchange.latestOpenInterest),
    latestFundingRate: toNullableNumber(exchange.latestFundingRate),
    series: seriesRows
      .map(row => ({
        snapshotDate: row.snapshotDate,
        openInterest: toNullableNumber(row.openInterest),
        fundingRate: toNullableNumber(row.fundingRate),
      }))
      .sort(
        (left, right) =>
          (parseDbUtcDate(left.snapshotDate)?.getTime() ?? 0) -
          (parseDbUtcDate(right.snapshotDate)?.getTime() ?? 0)
      ),
    rows: pageRows.map(row => ({
      snapshotDate: row.snapshotDate,
      openInterest: toNullableNumber(row.openInterest),
      fundingRate: toNullableNumber(row.fundingRate),
    })),
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}

export async function getTokenFundingViewBySymbol(
  symbol: string,
  tokenId?: number | null
): Promise<TokenFundingViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const [roundRows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      kind: string | null;
      roundType: string | null;
      roundDate: string | null;
      raise: number | null;
      valuation: number | null;
      announcementUrl: string | null;
      showOnlyYear: number | boolean | null;
      tokensForSale: number | null;
      priceUsd: number | null;
      lockupPeriod: string | null;
      roi: number | null;
      athRoi: number | null;
      isHidden: number | boolean | null;
      investorsJson: string | null;
      rawJson: string | null;
    })[]
  >(
    `
      SELECT
        id AS id,
        kind AS kind,
        round_type AS roundType,
        round_date AS roundDate,
        raise AS raise,
        valuation AS valuation,
        announcement_url AS announcementUrl,
        show_only_year AS showOnlyYear,
        tokens_for_sale AS tokensForSale,
        price_usd AS priceUsd,
        lockup_period AS lockupPeriod,
        roi AS roi,
        ath_roi AS athRoi,
        is_hidden AS isHidden,
        investors_json AS investorsJson,
        raw_json AS rawJson
      FROM token_funding_rounds
      WHERE token_id = ?
      ORDER BY round_date DESC, id DESC
    `,
    [profile.tokenId]
  );

  const [teamRows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      name: string;
      logoUrl: string | null;
      jobsJson: string | null;
      isFormer: number | boolean | null;
      linksJson: string | null;
      sortOrder: number | null;
    })[]
  >(
    `
      SELECT
        id AS id,
        name AS name,
        logo_url AS logoUrl,
        jobs_json AS jobsJson,
        is_former AS isFormer,
        links_json AS linksJson,
        sort_order AS sortOrder
      FROM token_team_members
      WHERE token_id = ?
      ORDER BY sort_order ASC, id ASC
    `,
    [profile.tokenId]
  );

  const rounds = roundRows
    .map(row => ({
      ...extractFundingRawMeta(row.rawJson),
      id: row.id,
      kind: row.kind,
      roundType: row.roundType,
      roundDate: row.roundDate,
      raise: toNullableNumber(row.raise),
      valuation: toNullableNumber(row.valuation),
      announcementUrl: row.announcementUrl,
      showOnlyYear: Boolean(row.showOnlyYear),
      tokensForSale: toNullableNumber(row.tokensForSale),
      priceUsd: toNullableNumber(row.priceUsd),
      lockupPeriod: row.lockupPeriod,
      roi: toNullableNumber(row.roi),
      athRoi: toNullableNumber(row.athRoi),
      isHidden: Boolean(row.isHidden),
      investors: extractInvestorNames(row.investorsJson),
    }))
    .filter(row => !row.isHidden);

  const uniqueInvestors = new Set<string>();
  rounds.forEach(round => {
    round.investors.forEach(investor => uniqueInvestors.add(investor));
  });

  const latestRound = rounds[0] ?? null;

  return {
    tokenId: profile.tokenId,
    summary: {
      totalRaised: rounds.reduce((sum, row) => sum + (row.raise ?? 0), 0) || null,
      latestRound: latestRound?.roundType ?? latestRound?.kind ?? null,
      latestRoundDate: latestRound?.roundDate ?? null,
      investorCount: uniqueInvestors.size,
    },
    rounds,
    teamMembers: teamRows.map(row => ({
      id: row.id,
      name: row.name,
      logoUrl: row.logoUrl,
      jobs: extractJobs(row.jobsJson),
      isFormer: Boolean(row.isFormer),
      links: extractLinks(row.linksJson),
      sortOrder: Number(row.sortOrder ?? 0),
    })),
  };
}

export async function getTokenSocialHeatViewBySymbol(
  symbol: string,
  tokenId?: number | null
): Promise<TokenSocialHeatViewResult | null> {
  const currentPool = getPool();
  const profile = await getTokenProfileBySymbol(symbol, tokenId);

  if (!profile) return null;

  const tweetMatch = buildTwitterTokenMatch({
    symbol: profile.symbol,
    name: profile.name,
  });

  const [summaryRows] = await currentPool.query<
    (RowDataPacket & {
      mentionCount24h: number | null;
      mentionCount7d: number | null;
      uniqueAuthors7d: number | null;
      totalEngagement7d: number | null;
      totalViews7d: number | null;
      latestPublishedAt: string | null;
    })[]
  >(
    `
      SELECT
        SUM(CASE WHEN published_at >= UTC_TIMESTAMP() - INTERVAL 1 DAY THEN 1 ELSE 0 END) AS mentionCount24h,
        SUM(CASE WHEN published_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN 1 ELSE 0 END) AS mentionCount7d,
        COUNT(
          DISTINCT CASE
            WHEN published_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
            THEN COALESCE(NULLIF(author_user_id, ''), NULLIF(author_username, ''))
            ELSE NULL
          END
        ) AS uniqueAuthors7d,
        SUM(
          CASE
            WHEN published_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY
            THEN COALESCE(reply_count, 0) + COALESCE(retweet_count, 0) + COALESCE(like_count, 0) + COALESCE(quote_count, 0)
            ELSE 0
          END
        ) AS totalEngagement7d,
        SUM(CASE WHEN published_at >= UTC_TIMESTAMP() - INTERVAL 7 DAY THEN COALESCE(view_count, 0) ELSE 0 END) AS totalViews7d,
        MAX(published_at) AS latestPublishedAt
      FROM twitter_tweets
      WHERE category = 'kol'
        AND ${tweetMatch.sql}
    `,
    tweetMatch.params
  );

  const [tweetRows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      tweetId: string | null;
      tweetUrl: string | null;
      content: string | null;
      publishedAt: string | null;
      replyCount: number | null;
      retweetCount: number | null;
      likeCount: number | null;
      quoteCount: number | null;
      viewCount: number | null;
      bookmarkCount: number | null;
      isRetweet: number | boolean | null;
      isQuote: number | boolean | null;
      isReply: number | boolean | null;
      lang: string | null;
      authorUsername: string | null;
      authorUserId: string | null;
      authorName: string | null;
      rawJson: string | null;
    })[]
  >(
    `
      SELECT
        id AS id,
        tweet_id AS tweetId,
        tweet_url AS tweetUrl,
        content AS content,
        published_at AS publishedAt,
        reply_count AS replyCount,
        retweet_count AS retweetCount,
        like_count AS likeCount,
        quote_count AS quoteCount,
        view_count AS viewCount,
        bookmark_count AS bookmarkCount,
        is_retweet AS isRetweet,
        is_quote AS isQuote,
        is_reply AS isReply,
        lang AS lang,
        author_username AS authorUsername,
        author_user_id AS authorUserId,
        author_name AS authorName,
        raw_json AS rawJson
      FROM twitter_tweets
      WHERE category = 'kol'
        AND ${tweetMatch.sql}
      ORDER BY published_at DESC, id DESC
      LIMIT 30
    `,
    tweetMatch.params
  );

  const summaryRow = summaryRows[0];
  const summary = {
    mentionCount24h: Number(summaryRow?.mentionCount24h ?? 0),
    mentionCount7d: Number(summaryRow?.mentionCount7d ?? 0),
    uniqueAuthors7d: Number(summaryRow?.uniqueAuthors7d ?? 0),
    totalEngagement7d: Number(summaryRow?.totalEngagement7d ?? 0),
    totalViews7d: Number(summaryRow?.totalViews7d ?? 0),
    latestPublishedAt: summaryRow?.latestPublishedAt ?? null,
    summaryText: buildSocialSummaryText({
      symbol: profile.symbol,
      mentionCount24h: Number(summaryRow?.mentionCount24h ?? 0),
      mentionCount7d: Number(summaryRow?.mentionCount7d ?? 0),
      uniqueAuthors7d: Number(summaryRow?.uniqueAuthors7d ?? 0),
      totalEngagement7d: Number(summaryRow?.totalEngagement7d ?? 0),
      totalViews7d: Number(summaryRow?.totalViews7d ?? 0),
    }),
  };

  const tweets = tweetRows
    .filter(row => row.tweetId && row.publishedAt)
    .map(row => {
      const rawJson = safeParseJsonObject(row.rawJson);
      const authorMeta = extractTweetAuthorMeta(rawJson);
      const media = extractTweetMedia(rawJson);
      const username = row.authorUsername?.trim() || "unknown";
      const userId = row.authorUserId?.trim() || "";
      const tweetId = row.tweetId?.trim() || String(row.id);

      return {
        id: row.id,
        tweetId,
        tweetUrl: row.tweetUrl?.trim() || `https://x.com/${username}/status/${tweetId}`,
        content: row.content,
        publishedAt: row.publishedAt as string,
        replyCount: Number(row.replyCount ?? 0),
        retweetCount: Number(row.retweetCount ?? 0),
        likeCount: Number(row.likeCount ?? 0),
        quoteCount: Number(row.quoteCount ?? 0),
        viewCount: toNullableNumber(row.viewCount),
        bookmarkCount: toNullableNumber(row.bookmarkCount),
        isRetweet: Boolean(row.isRetweet),
        isQuote: Boolean(row.isQuote),
        isReply: Boolean(row.isReply),
        lang: row.lang,
        author: {
          username,
          userId,
          name: row.authorName?.trim() || null,
          avatarUrl: authorMeta.avatarUrl,
          followerCount: authorMeta.followerCount,
          isBlueVerified: authorMeta.isBlueVerified,
          isVerified: authorMeta.isVerified,
          description: authorMeta.description,
        },
        media,
      };
    });

  return {
    tokenId: profile.tokenId,
    summary,
    tweets,
  };
}

export async function getOnchainFundFlowBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
    date?: string;
    depth?: number;
    limitPerLayer?: number;
  }
): Promise<OnchainFundFlowResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!dataset || !context) return null;

  const depth = Math.min(Math.max(options?.depth ?? 3, 1), 4);
  const limitPerLayer = Math.min(Math.max(options?.limitPerLayer ?? 36, 5), 120);
  const date = options?.date?.trim();
  const { resolvedTokenId, dedupedTokenAddresses } = context;

  if (dedupedTokenAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: null,
      totalAmount: 0,
      nodes: [],
      links: [],
      summaries: [],
    };
  }

  const countsQuery = `
    SELECT
      LOWER(token_address) AS tokenAddress,
      COUNT(*) AS flowCount
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) IN UNNEST(@addresses)
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    ${date ? "AND DATE(block_time) <= @selectedDate" : ""}
    GROUP BY tokenAddress
    ORDER BY flowCount DESC
  `;
  const [countRows] = await bigQuery.query({
    query: countsQuery,
    params: {
      addresses: dedupedTokenAddresses.map(row => row.address),
      ...(options?.chainId ? { chainId: options.chainId } : {}),
      ...(date ? { selectedDate: date } : {}),
    },
    useLegacySql: false,
  });

  const chosenAddress =
    dedupedTokenAddresses.find(row =>
      countRows.some(
        countRow => String((countRow as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === row.address
      )
    ) ?? dedupedTokenAddresses[0];

  const chosenCountRow = countRows.find(
    row => String((row as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === chosenAddress.address
  ) as { flowCount?: string | number } | undefined;

  if (!chosenCountRow || Number(chosenCountRow.flowCount ?? 0) === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      totalAmount: 0,
      nodes: [],
      links: [],
      summaries: [],
    };
  }

  const transferQuery = `
    SELECT
      block_time,
      from_address,
      to_address,
      amount,
      txhash
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) = @tokenAddress
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    ${date ? "AND DATE(block_time) <= @selectedDate" : ""}
    ORDER BY block_time ASC, id ASC
    LIMIT 5000
  `;
  const [transferRows] = await bigQuery.query({
    query: transferQuery,
    params: {
      tokenAddress: chosenAddress.address,
      ...(options?.chainId ? { chainId: options.chainId } : {}),
      ...(date ? { selectedDate: date } : {}),
    },
    useLegacySql: false,
  });

  const uniqueAddresses = Array.from(
    new Set(
      transferRows.flatMap(row => [
        String((row as { from_address?: string }).from_address ?? "").toLowerCase(),
        String((row as { to_address?: string }).to_address ?? "").toLowerCase(),
      ]).filter(Boolean)
    )
  );

  const walletQuery = `
    SELECT
      LOWER(address) AS address,
      tag_label,
      tags_base,
      is_contract
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
    WHERE LOWER(address) IN UNNEST(@addresses)
  `;
  const [walletRows] = uniqueAddresses.length
    ? await bigQuery.query({
        query: walletQuery,
        params: { addresses: uniqueAddresses },
        useLegacySql: false,
      })
    : [[]];

  const walletMeta = new Map<
    string,
    {
      label: string;
      kind: string;
      isContract: boolean;
    }
  >();
  walletRows.forEach(row => {
    const address = String((row as { address?: string }).address ?? "").toLowerCase();
    if (!address) return;
    const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
    const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
    const isContract = Boolean((row as { is_contract?: boolean | null }).is_contract);
    walletMeta.set(address, {
      label: formatAddressTagLabel(tagLabel ?? tagsBase),
      kind: tagsBase ?? (isContract ? "合约地址" : "普通地址"),
      isContract,
    });
  });

  const holderBalanceQuery = `
    SELECT
      LOWER(holder_address) AS holderAddress,
      balance
    FROM (
      SELECT
        holder_address,
        balance,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(holder_address)
          ORDER BY snapshot_date DESC, created_at DESC
        ) AS rowNum
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
      WHERE LOWER(token_address) = @tokenAddress
      ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
      ${date ? "AND snapshot_date <= DATE(@selectedDate)" : ""}
      AND LOWER(holder_address) IN UNNEST(@addresses)
    )
    WHERE rowNum = 1
  `;
  const [holderBalanceRows] = uniqueAddresses.length
    ? await bigQuery.query({
        query: holderBalanceQuery,
        params: {
          tokenAddress: chosenAddress.address,
          addresses: uniqueAddresses,
          ...(options?.chainId ? { chainId: options.chainId } : {}),
          ...(date ? { selectedDate: date } : {}),
        },
        useLegacySql: false,
      })
    : [[]];

  const holderBalanceMap = new Map<string, number | null>();
  holderBalanceRows.forEach(row => {
    const address = String((row as { holderAddress?: string }).holderAddress ?? "").toLowerCase();
    if (!address) return;
    holderBalanceMap.set(address, toNullableNumber((row as { balance?: string | number | null }).balance));
  });

  const normalizedRows = transferRows
    .map(row => ({
      time:
        typeof (row as { block_time?: { value?: string } | string }).block_time === "object"
          ? ((row as { block_time?: { value?: string } }).block_time?.value ?? null)
          : String((row as { block_time?: string }).block_time ?? ""),
      fromAddress: String((row as { from_address?: string }).from_address ?? "").toLowerCase(),
      toAddress: String((row as { to_address?: string }).to_address ?? "").toLowerCase(),
      amount: toNullableNumber((row as { amount?: string | number }).amount) ?? 0,
      txhash: String((row as { txhash?: string }).txhash ?? ""),
    }))
    .filter(row => row.amount > 0 && row.fromAddress && row.toAddress);

  if (normalizedRows.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      totalAmount: 0,
      nodes: [],
      links: [],
      summaries: [],
    };
  }

  const rootAddress =
    normalizedRows.find(row => row.fromAddress === "0x0000000000000000000000000000000000000000")?.fromAddress ??
    normalizedRows[0]?.fromAddress ??
    chosenAddress.address;
  const nodeMap = new Map<
    string,
    {
      id: string;
      layer: number;
      address: string;
      label: string;
      amount: number;
      currentBalance: number | null;
      kind: string;
      outgoingCount: number;
    }
  >();
  const aggregatedLinks = new Map<
    string,
    {
      source: string;
      target: string;
      amount: number;
      time: string | null;
      txhash: string | null;
    }
  >();
  const childRowsMap = new Map<string, typeof normalizedRows>();

  normalizedRows.forEach(row => {
    const current = childRowsMap.get(row.fromAddress) ?? [];
    current.push(row);
    childRowsMap.set(row.fromAddress, current);
  });

  nodeMap.set(rootAddress, {
    id: `addr:${rootAddress}`,
    layer: 0,
    address: rootAddress,
    label: "0 地址",
    amount: 0,
    currentBalance: holderBalanceMap.get(rootAddress) ?? null,
    kind: "铸造源头",
    outgoingCount: 0,
  });

  let frontier = [rootAddress];
  const layerTitles = ["0 地址", "第一层", "第二层", "第三层", "第四层"];

  for (let layer = 1; layer <= depth; layer += 1) {
    const layerIncoming = new Map<string, number>();
    const layerLinks = new Map<
      string,
      {
        source: string;
        target: string;
        amount: number;
        time: string | null;
        txhash: string | null;
      }
    >();

    frontier.forEach(sourceAddress => {
      const sourceRows = childRowsMap.get(sourceAddress) ?? [];
      sourceRows.forEach(row => {
        if (row.toAddress === rootAddress) return;
        const key = `${row.fromAddress}->${row.toAddress}`;
        const existing = layerLinks.get(key);
        if (existing) {
          existing.amount += row.amount;
        } else {
          layerLinks.set(key, {
            source: row.fromAddress,
            target: row.toAddress,
            amount: row.amount,
            time: row.time,
            txhash: row.txhash,
          });
        }

        layerIncoming.set(row.toAddress, (layerIncoming.get(row.toAddress) ?? 0) + row.amount);
      });
    });

    const selectedAddresses = Array.from(layerIncoming.entries())
      .sort((left, right) => right[1] - left[1])
      .slice(0, limitPerLayer)
      .map(([address]) => address);
    const selectedSet = new Set(selectedAddresses);

    Array.from(layerIncoming.entries())
      .filter(([address]) => selectedSet.has(address))
      .forEach(([address, amount]) => {
        if (nodeMap.has(address)) return;
        const meta = walletMeta.get(address);
        const outgoingCount = new Set((childRowsMap.get(address) ?? []).map(row => row.toAddress)).size;
        nodeMap.set(address, {
          id: `addr:${address}`,
          layer,
          address,
          label: meta?.label ?? "普通地址",
          amount,
          currentBalance: holderBalanceMap.get(address) ?? null,
          kind:
            meta?.kind && meta.kind !== "普通地址"
              ? formatAddressTagLabel(meta.kind)
              : meta?.isContract
                ? "合约地址"
                : "普通地址",
          outgoingCount,
        });
      });

    Array.from(layerLinks.values())
      .filter(link => selectedSet.has(link.target))
      .forEach(link => {
        aggregatedLinks.set(`${link.source}->${link.target}`, {
          source: `addr:${link.source}`,
          target: `addr:${link.target}`,
          amount: link.amount,
          time: link.time,
          txhash: link.txhash,
        });
      });

    frontier = selectedAddresses;
    if (frontier.length === 0) break;
  }

  const rootOutgoingAmount = Array.from(aggregatedLinks.values())
    .filter(link => link.source === `addr:${rootAddress}`)
    .reduce((sum, link) => sum + link.amount, 0);
  const rootNode = nodeMap.get(rootAddress);
  if (rootNode) {
    rootNode.amount = rootOutgoingAmount;
    rootNode.outgoingCount = new Set((childRowsMap.get(rootAddress) ?? []).map(row => row.toAddress)).size;
  }

  const nodes = Array.from(nodeMap.values()).sort((left, right) => left.layer - right.layer || right.amount - left.amount);
  const summaries = Array.from({ length: depth + 1 }, (_, layer) => {
    const layerNodes = nodes.filter(node => node.layer === layer);
    return {
      layer,
      title: layerTitles[layer] ?? `第${layer}层`,
      count: layerNodes.length,
      totalAmount: layerNodes.reduce((sum, node) => sum + node.amount, 0),
    };
  });

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: chosenAddress.tokenAddressId,
    totalAmount: rootOutgoingAmount,
    nodes,
    links: Array.from(aggregatedLinks.values()),
    summaries,
  };
}

export async function getOnchainEarlyDistributionBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
    depth?: number;
    preWindowDays?: number;
    claimWindowDays?: number;
    limitPerLayer?: number;
  }
): Promise<OnchainEarlyDistributionResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!dataset || !context) return null;

  const depth = Math.min(Math.max(options?.depth ?? 4, 1), 4);
  const preWindowDays = Math.min(Math.max(options?.preWindowDays ?? 7, 1), 60);
  const claimWindowDays = Math.min(Math.max(options?.claimWindowDays ?? 14, preWindowDays), 90);
  const limitPerLayer = Math.min(Math.max(options?.limitPerLayer ?? 120, 20), 300);
  const { resolvedTokenId, dedupedTokenAddresses } = context;

  if (dedupedTokenAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: null,
      tokenAddress: null,
      firstTransferAt: null,
      graphWindowEnd: null,
      behaviorWindowEnd: null,
      rootAddress: null,
      totalMintedAmount: 0,
      nodes: [],
      links: [],
    };
  }

  const countsQuery = `
    SELECT
      LOWER(token_address) AS tokenAddress,
      COUNT(*) AS flowCount
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) IN UNNEST(@addresses)
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    GROUP BY tokenAddress
    ORDER BY flowCount DESC
  `;
  const [countRows] = await bigQuery.query({
    query: countsQuery,
    params: {
      addresses: dedupedTokenAddresses.map(row => row.address),
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });

  const chosenAddress =
    dedupedTokenAddresses.find(row =>
      countRows.some(
        countRow => String((countRow as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === row.address
      )
    ) ?? dedupedTokenAddresses[0];

  const firstTransferQuery = `
    SELECT MIN(block_time) AS firstTransferAt
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) = @tokenAddress
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
  `;
  const [firstTransferRows] = await bigQuery.query({
    query: firstTransferQuery,
    params: {
      tokenAddress: chosenAddress.address,
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });

  const firstTransferAt = String(
    (firstTransferRows[0] as { firstTransferAt?: { value?: string } | string | null })?.firstTransferAt instanceof
      Object
      ? ((firstTransferRows[0] as { firstTransferAt?: { value?: string } }).firstTransferAt?.value ?? "")
      : ((firstTransferRows[0] as { firstTransferAt?: string | null })?.firstTransferAt ?? "")
  ).trim();

  if (!firstTransferAt) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      tokenAddress: chosenAddress.address,
      firstTransferAt: null,
      graphWindowEnd: null,
      behaviorWindowEnd: null,
      rootAddress: null,
      totalMintedAmount: 0,
      nodes: [],
      links: [],
    };
  }

  const graphWindowEnd = new Date(new Date(firstTransferAt).getTime() + preWindowDays * 24 * 60 * 60 * 1000).toISOString();
  const behaviorWindowEnd = new Date(
    new Date(firstTransferAt).getTime() + claimWindowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const transferQuery = `
    SELECT
      block_time,
      from_address,
      to_address,
      amount,
      txhash
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) = @tokenAddress
      ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
      AND block_time >= TIMESTAMP(@windowStart)
      AND block_time <= TIMESTAMP(@behaviorWindowEnd)
    ORDER BY block_time ASC, id ASC
    LIMIT 30000
  `;
  const [transferRows] = await bigQuery.query({
    query: transferQuery,
    params: {
      tokenAddress: chosenAddress.address,
      windowStart: firstTransferAt,
      behaviorWindowEnd,
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });

  const normalizedRows = transferRows
    .map(row => ({
      time:
        typeof (row as { block_time?: { value?: string } | string }).block_time === "object"
          ? ((row as { block_time?: { value?: string } }).block_time?.value ?? null)
          : String((row as { block_time?: string }).block_time ?? ""),
      fromAddress: String((row as { from_address?: string }).from_address ?? "").toLowerCase(),
      toAddress: String((row as { to_address?: string }).to_address ?? "").toLowerCase(),
      amount: toNullableNumber((row as { amount?: string | number | null }).amount) ?? 0,
      txhash: String((row as { txhash?: string }).txhash ?? ""),
    }))
    .filter(row => row.amount > 0 && row.fromAddress && row.toAddress);

  if (normalizedRows.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      tokenAddress: chosenAddress.address,
      firstTransferAt,
      graphWindowEnd,
      behaviorWindowEnd,
      rootAddress: null,
      totalMintedAmount: 0,
      nodes: [],
      links: [],
    };
  }

  const graphRows = normalizedRows.filter(row => row.time && row.time <= graphWindowEnd);
  const rootAddress =
    graphRows.find(row => row.fromAddress === "0x0000000000000000000000000000000000000000")?.fromAddress ??
    graphRows[0]?.fromAddress ??
    normalizedRows[0]?.fromAddress ??
    null;

  if (!rootAddress) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      tokenAddress: chosenAddress.address,
      firstTransferAt,
      graphWindowEnd,
      behaviorWindowEnd,
      rootAddress: null,
      totalMintedAmount: 0,
      nodes: [],
      links: [],
    };
  }

  const allAddresses = Array.from(
    new Set(normalizedRows.flatMap(row => [row.fromAddress, row.toAddress]).filter(Boolean))
  );
  const walletQuery = `
    SELECT
      LOWER(address) AS address,
      tag_label,
      tags_base,
      is_contract
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
    WHERE LOWER(address) IN UNNEST(@addresses)
  `;
  const [walletRows] = allAddresses.length
    ? await bigQuery.query({
        query: walletQuery,
        params: { addresses: allAddresses },
        useLegacySql: false,
      })
    : [[]];

  const walletMeta = new Map<
    string,
    {
      label: string;
      kind: string;
      isContract: boolean;
    }
  >();
  walletRows.forEach(row => {
    const address = String((row as { address?: string }).address ?? "").toLowerCase();
    if (!address) return;
    const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
    const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
    const isContract = Boolean((row as { is_contract?: boolean | null }).is_contract);
    walletMeta.set(address, {
      label: formatAddressTagLabel(tagLabel ?? tagsBase),
      kind: tagsBase ?? (isContract ? "合约地址" : "普通地址"),
      isContract,
    });
  });

  const holderBalanceQuery = `
    SELECT
      LOWER(holder_address) AS holderAddress,
      balance
    FROM (
      SELECT
        holder_address,
        balance,
        ROW_NUMBER() OVER (
          PARTITION BY LOWER(holder_address)
          ORDER BY snapshot_date DESC, created_at DESC
        ) AS rowNum
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
      WHERE LOWER(token_address) = @tokenAddress
      ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
      AND LOWER(holder_address) IN UNNEST(@addresses)
    )
    WHERE rowNum = 1
  `;
  const [holderBalanceRows] = allAddresses.length
    ? await bigQuery.query({
        query: holderBalanceQuery,
        params: {
          tokenAddress: chosenAddress.address,
          addresses: allAddresses,
          ...(options?.chainId ? { chainId: options.chainId } : {}),
        },
        useLegacySql: false,
      })
    : [[]];

  const holderBalanceMap = new Map<string, number | null>();
  holderBalanceRows.forEach(row => {
    const address = String((row as { holderAddress?: string }).holderAddress ?? "").toLowerCase();
    if (!address) return;
    holderBalanceMap.set(address, toNullableNumber((row as { balance?: string | number | null }).balance));
  });

  const outgoingRowsByAddress = new Map<string, typeof normalizedRows>();
  graphRows.forEach(row => {
    const current = outgoingRowsByAddress.get(row.fromAddress) ?? [];
    current.push(row);
    outgoingRowsByAddress.set(row.fromAddress, current);
  });

  const nodeState = new Map<
    string,
    {
      layer: number;
      incomingAmount: number;
      incomingTxCount: number;
      firstReceivedAt: string | null;
      parentAddresses: Set<string>;
    }
  >();
  const selectedLinks = new Map<
    string,
    {
      source: string;
      target: string;
      amount: number;
      time: string | null;
      txhash: string | null;
      layer: number;
    }
  >();

  nodeState.set(rootAddress, {
    layer: 0,
    incomingAmount: 0,
    incomingTxCount: 0,
    firstReceivedAt: firstTransferAt,
    parentAddresses: new Set<string>(),
  });

  let frontier = [rootAddress];

  for (let layer = 1; layer <= depth; layer += 1) {
    const layerIncoming = new Map<
      string,
      {
        amount: number;
        txCount: number;
        firstReceivedAt: string | null;
        parents: Set<string>;
      }
    >();

    frontier.forEach(sourceAddress => {
      const sourceRows = outgoingRowsByAddress.get(sourceAddress) ?? [];
      sourceRows.forEach(row => {
        if (row.toAddress === rootAddress) return;
        const current = layerIncoming.get(row.toAddress) ?? {
          amount: 0,
          txCount: 0,
          firstReceivedAt: row.time ?? null,
          parents: new Set<string>(),
        };
        current.amount += row.amount;
        current.txCount += 1;
        current.parents.add(row.fromAddress);
        if (!current.firstReceivedAt || ((row.time ?? "") && (row.time ?? "") < current.firstReceivedAt)) {
          current.firstReceivedAt = row.time ?? current.firstReceivedAt;
        }
        layerIncoming.set(row.toAddress, current);

        const key = `${row.fromAddress}->${row.toAddress}`;
        const existing = selectedLinks.get(key);
        if (existing) {
          existing.amount += row.amount;
        } else {
          selectedLinks.set(key, {
            source: row.fromAddress,
            target: row.toAddress,
            amount: row.amount,
            time: row.time,
            txhash: row.txhash,
            layer,
          });
        }
      });
    });

    const selectedAddresses = Array.from(layerIncoming.entries())
      .sort((left, right) => right[1].amount - left[1].amount)
      .slice(0, limitPerLayer)
      .map(([address]) => address);

    selectedAddresses.forEach(address => {
      const current = layerIncoming.get(address);
      if (!current) return;
      const existing = nodeState.get(address);
      if (existing && existing.layer <= layer) {
        existing.incomingAmount += current.amount;
        existing.incomingTxCount += current.txCount;
        current.parents.forEach(parent => existing.parentAddresses.add(parent));
        if (
          current.firstReceivedAt &&
          (!existing.firstReceivedAt || current.firstReceivedAt < existing.firstReceivedAt)
        ) {
          existing.firstReceivedAt = current.firstReceivedAt;
        }
        return;
      }

      nodeState.set(address, {
        layer,
        incomingAmount: current.amount,
        incomingTxCount: current.txCount,
        firstReceivedAt: current.firstReceivedAt,
        parentAddresses: new Set(current.parents),
      });
    });

    frontier = selectedAddresses;
    if (frontier.length === 0) break;
  }

  const trackedAddresses = Array.from(nodeState.keys());
  const behaviorRows = normalizedRows.filter(row => row.time && row.time <= behaviorWindowEnd);
  const behaviorStats = new Map<
    string,
    {
      outgoingAmount: number;
      outgoingTxCount: number;
      recipients: Set<string>;
    }
  >();

  behaviorRows.forEach(row => {
    if (!trackedAddresses.includes(row.fromAddress)) return;
    const current = behaviorStats.get(row.fromAddress) ?? {
      outgoingAmount: 0,
      outgoingTxCount: 0,
      recipients: new Set<string>(),
    };
    current.outgoingAmount += row.amount;
    current.outgoingTxCount += 1;
    current.recipients.add(row.toAddress);
    behaviorStats.set(row.fromAddress, current);
  });

  const totalMintedAmount = Array.from(selectedLinks.values())
    .filter(link => link.source === rootAddress)
    .reduce((sum, link) => sum + link.amount, 0);

  const nodes = Array.from(nodeState.entries())
    .filter(([address]) => address !== rootAddress)
    .map(([address, state]) => {
      const meta = walletMeta.get(address);
      const behavior = behaviorStats.get(address);
      return {
        address,
        layer: state.layer,
        label: meta?.label ?? "普通地址",
        kind:
          meta?.kind && meta.kind !== "普通地址"
            ? formatAddressTagLabel(meta.kind)
            : meta?.isContract
              ? "合约地址"
              : "普通地址",
        isContract: Boolean(meta?.isContract),
        currentBalance: holderBalanceMap.get(address) ?? null,
        incomingAmount: state.incomingAmount,
        incomingTxCount: state.incomingTxCount,
        firstReceivedAt: state.firstReceivedAt,
        parentAddresses: Array.from(state.parentAddresses),
        outgoingAmountInBehaviorWindow: behavior?.outgoingAmount ?? 0,
        outgoingTxCountInBehaviorWindow: behavior?.outgoingTxCount ?? 0,
        uniqueRecipientsInBehaviorWindow: behavior?.recipients.size ?? 0,
      };
    })
    .sort((left, right) => left.layer - right.layer || right.incomingAmount - left.incomingAmount);

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: chosenAddress.tokenAddressId,
    tokenAddress: chosenAddress.address,
    firstTransferAt,
    graphWindowEnd,
    behaviorWindowEnd,
    rootAddress,
    totalMintedAmount,
    nodes,
    links: Array.from(selectedLinks.values()).sort(
      (left, right) => left.layer - right.layer || right.amount - left.amount
    ),
  };
}

export async function getOnchainHoldersBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
    date?: string;
    page?: number;
    pageSize?: number;
  }
): Promise<OnchainHolderListResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!dataset || !context) return null;

  const page = Math.max(options?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 10), 500);
  const offset = (page - 1) * pageSize;
  const date = options?.date?.trim();
  const { resolvedTokenId, dedupedTokenAddresses } = context;
  if (dedupedTokenAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: null,
      tokenAddress: null,
      snapshotDate: null,
      total: 0,
      page,
      pageSize,
      items: [],
    };
  }

  const countsQuery = `
    SELECT
      LOWER(token_address) AS tokenAddress,
      COUNT(*) AS holderCount
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
    WHERE LOWER(token_address) IN UNNEST(@addresses)
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    ${date ? "AND snapshot_date <= DATE(@selectedDate)" : ""}
    GROUP BY tokenAddress
    ORDER BY holderCount DESC
  `;
  const [countRows] = await bigQuery.query({
    query: countsQuery,
    params: {
      addresses: dedupedTokenAddresses.map(row => row.address),
      ...(options?.chainId ? { chainId: options.chainId } : {}),
      ...(date ? { selectedDate: date } : {}),
    },
    useLegacySql: false,
  });

  const chosenAddress =
    dedupedTokenAddresses.find(row =>
      countRows.some(
        countRow => String((countRow as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === row.address
      )
    ) ?? dedupedTokenAddresses[0];

  const snapshotQuery = `
    SELECT
      MAX(snapshot_date) AS snapshotDate
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
    WHERE LOWER(token_address) = @tokenAddress
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    ${date ? "AND snapshot_date <= DATE(@selectedDate)" : ""}
  `;
  const [snapshotRows] = await bigQuery.query({
    query: snapshotQuery,
    params: {
      tokenAddress: chosenAddress.address,
      ...(options?.chainId ? { chainId: options.chainId } : {}),
      ...(date ? { selectedDate: date } : {}),
    },
    useLegacySql: false,
  });

  const snapshotDate = String((snapshotRows[0] as { snapshotDate?: { value?: string } | string | null })?.snapshotDate instanceof Object
    ? ((snapshotRows[0] as { snapshotDate?: { value?: string } }).snapshotDate?.value ?? "")
    : ((snapshotRows[0] as { snapshotDate?: string | null })?.snapshotDate ?? "")
  ).trim();

  if (!snapshotDate) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      tokenAddress: chosenAddress.address,
      snapshotDate: null,
      total: 0,
      page,
      pageSize,
      items: [],
    };
  }

  const totalQuery = `
    SELECT COUNT(*) AS total
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
    WHERE LOWER(token_address) = @tokenAddress
      ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
      AND snapshot_date = DATE(@snapshotDate)
  `;
  const [totalRows] = await bigQuery.query({
    query: totalQuery,
    params: {
      tokenAddress: chosenAddress.address,
      snapshotDate,
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });
  const total = Number((totalRows[0] as { total?: string | number }).total ?? 0);

  const holdersQuery = `
    SELECT
      LOWER(holder_address) AS holderAddress,
      balance,
      balance_rank AS balanceRank,
      balance_delta24h AS balanceChange24h,
      balance_delta7d AS balanceChange7d,
      is_new AS isNew
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
    WHERE LOWER(token_address) = @tokenAddress
      ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
      AND snapshot_date = DATE(@snapshotDate)
    ORDER BY balance_rank ASC, SAFE_CAST(balance AS NUMERIC) DESC
    LIMIT @limit
    OFFSET @offset
  `;
  const [holderRows] = await bigQuery.query({
    query: holdersQuery,
      params: {
        tokenAddress: chosenAddress.address,
        snapshotDate,
        ...(options?.chainId ? { chainId: options.chainId } : {}),
        limit: pageSize,
        offset,
      },
    useLegacySql: false,
  });

  const addresses = holderRows
    .map(row => String((row as { holderAddress?: string }).holderAddress ?? "").toLowerCase())
    .filter(Boolean);

  const walletQuery = `
    SELECT
      LOWER(address) AS address,
      tag_label,
      tags_base,
      is_contract
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
    WHERE LOWER(address) IN UNNEST(@addresses)
  `;
  const [walletRows] = addresses.length
    ? await bigQuery.query({
        query: walletQuery,
        params: { addresses },
        useLegacySql: false,
      })
    : [[]];

  const walletMeta = new Map<
    string,
    {
      label: string;
      kind: string;
      isContract: boolean;
    }
  >();
  walletRows.forEach(row => {
    const address = String((row as { address?: string }).address ?? "").toLowerCase();
    if (!address) return;
    const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
    const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
    const isContract = Boolean((row as { is_contract?: boolean | null }).is_contract);
    walletMeta.set(address, {
      label: formatAddressTagLabel(tagLabel ?? tagsBase),
      kind: tagsBase ?? (isContract ? "合约地址" : "普通地址"),
      isContract,
    });
  });

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: chosenAddress.tokenAddressId,
    tokenAddress: chosenAddress.address,
    snapshotDate,
    total,
    page,
    pageSize,
    items: holderRows.map(row => {
      const address = String((row as { holderAddress?: string }).holderAddress ?? "").toLowerCase();
      const meta = walletMeta.get(address);
      return {
        address,
        label: meta?.label ?? "普通地址",
        kind:
          meta?.kind && meta.kind !== "普通地址"
            ? formatAddressTagLabel(meta.kind)
            : meta?.isContract
              ? "合约地址"
              : "普通地址",
        isContract: Boolean(meta?.isContract),
        balance: toNullableNumber((row as { balance?: string | number | null }).balance),
        rank: toNullableNumber((row as { balanceRank?: number | string | null }).balanceRank),
        balanceChange24h: toNullableNumber((row as { balanceChange24h?: number | string | null }).balanceChange24h),
        balanceChange7d: toNullableNumber((row as { balanceChange7d?: number | string | null }).balanceChange7d),
        isNew: Boolean((row as { isNew?: boolean | null }).isNew),
      };
    }),
  };
}

export async function getOnchainLargeTransfersBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
    page?: number;
    pageSize?: number;
    search?: string;
    sortOrder?: "asc" | "desc";
  }
): Promise<OnchainLargeTransferListResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!dataset || !context) return null;

  const page = Math.max(options?.page ?? 1, 1);
  const pageSize = Math.min(Math.max(options?.pageSize ?? 20, 10), 500);
  const offset = (page - 1) * pageSize;
  const sortOrder: "asc" | "desc" = options?.sortOrder === "asc" ? "asc" : "desc";
  const normalizedSearch = options?.search?.trim().toLowerCase() ?? "";
  const { profile, resolvedTokenId, dedupedTokenAddresses } = context;
  const totalSupply = profile?.totalSupply ?? null;
  const thresholdAmount = totalSupply && totalSupply > 0 ? totalSupply * 0.0001 : null;
  if (dedupedTokenAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: null,
      tokenAddress: null,
      totalSupply,
      thresholdAmount,
      total: 0,
      page,
      pageSize,
      sortOrder,
      latestBlockTime: null,
      items: [],
    };
  }

  const countsQuery = `
    SELECT
      LOWER(token_address) AS tokenAddress,
      COUNT(*) AS transferCount
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) IN UNNEST(@addresses)
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    GROUP BY tokenAddress
    ORDER BY transferCount DESC
  `;
  const [countRows] = await bigQuery.query({
    query: countsQuery,
    params: {
      addresses: dedupedTokenAddresses.map(row => row.address),
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });

  const chosenAddress =
    dedupedTokenAddresses.find(row =>
      countRows.some(
        countRow => String((countRow as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === row.address
      )
    ) ?? dedupedTokenAddresses[0];

  const searchClause = normalizedSearch
    ? `
      AND (
        LOWER(from_address) LIKE @addressSearch
        OR LOWER(to_address) LIKE @addressSearch
      )
    `
    : "";
  const thresholdClause = thresholdAmount != null ? "AND SAFE_CAST(amount AS NUMERIC) >= @thresholdAmount" : "";
  const baseWhere = `
    WHERE LOWER(token_address) = @tokenAddress
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    ${thresholdClause}
    ${searchClause}
  `;

  const totalQuery = `
    SELECT COUNT(*) AS total
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    ${baseWhere}
  `;
  const baseParams = {
    tokenAddress: chosenAddress.address,
    ...(thresholdAmount != null ? { thresholdAmount } : {}),
    ...(normalizedSearch ? { addressSearch: `%${normalizedSearch}%` } : {}),
  };

  const [totalRows] = await bigQuery.query({
    query: totalQuery,
    params: baseParams,
    useLegacySql: false,
  });
  const total = Number((totalRows[0] as { total?: string | number }).total ?? 0);

  const latestBlockTimeQuery = `
    SELECT MAX(block_time) AS latestBlockTime
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    ${baseWhere}
  `;
  const [latestRows] = await bigQuery.query({
    query: latestBlockTimeQuery,
    params: baseParams,
    useLegacySql: false,
  });

  const transfersQuery = `
    SELECT
      txhash,
      log_index AS logIndex,
      block_time AS blockTime,
      LOWER(from_address) AS fromAddress,
      LOWER(to_address) AS toAddress,
      amount,
      value
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    ${baseWhere}
    ORDER BY block_time ${sortOrder.toUpperCase()}, txhash ${sortOrder.toUpperCase()}, logIndex ${sortOrder.toUpperCase()}
    LIMIT @limit
    OFFSET @offset
  `;
  const [transferRows] = await bigQuery.query({
    query: transfersQuery,
    params: {
      ...baseParams,
      limit: pageSize,
      offset,
    },
    useLegacySql: false,
  });

  const addresses = Array.from(
    new Set(
      transferRows.flatMap(row => [
        String((row as { fromAddress?: string }).fromAddress ?? "").toLowerCase(),
        String((row as { toAddress?: string }).toAddress ?? "").toLowerCase(),
      ]).filter(Boolean)
    )
  );

  const walletQuery = `
    SELECT
      LOWER(address) AS address,
      tag_label,
      tags_base,
      is_contract
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
    WHERE LOWER(address) IN UNNEST(@addresses)
  `;
  const [walletRows] = addresses.length
    ? await bigQuery.query({
        query: walletQuery,
        params: { addresses },
        useLegacySql: false,
      })
    : [[]];

  const walletMeta = new Map<
    string,
    {
      label: string;
      kind: string;
      isContract: boolean;
    }
  >();
  walletRows.forEach(row => {
    const address = String((row as { address?: string }).address ?? "").toLowerCase();
    if (!address) return;
    const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
    const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
    const isContract = Boolean((row as { is_contract?: boolean | null }).is_contract);
    walletMeta.set(address, {
      label: formatAddressTagLabel(tagLabel ?? tagsBase),
      kind: tagsBase ?? (isContract ? "合约地址" : "普通地址"),
      isContract,
    });
  });

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: chosenAddress.tokenAddressId,
    tokenAddress: chosenAddress.address,
    totalSupply,
    thresholdAmount,
    total,
    page,
    pageSize,
    sortOrder,
    latestBlockTime: String(
      (latestRows[0] as { latestBlockTime?: { value?: string } | string | null })?.latestBlockTime instanceof Object
        ? ((latestRows[0] as { latestBlockTime?: { value?: string } }).latestBlockTime?.value ?? "")
        : ((latestRows[0] as { latestBlockTime?: string | null })?.latestBlockTime ?? "")
    ).trim() || null,
    items: transferRows.map(row => {
      const fromAddress = String((row as { fromAddress?: string }).fromAddress ?? "").toLowerCase();
      const toAddress = String((row as { toAddress?: string }).toAddress ?? "").toLowerCase();
      const fromMeta = walletMeta.get(fromAddress);
      const toMeta = walletMeta.get(toAddress);
      const amount = toNullableNumber((row as { amount?: string | number | null }).amount);
      const rawBlockTime = (row as { blockTime?: { value?: string } | string | null }).blockTime;
      const blockTime =
        typeof rawBlockTime === "string" ? rawBlockTime : rawBlockTime?.value ?? null;

      return {
        txhash: String((row as { txhash?: string }).txhash ?? ""),
        logIndex: toNullableNumber((row as { logIndex?: string | number | null }).logIndex),
        blockTime: blockTime?.trim() || null,
        fromAddress,
        toAddress,
        fromLabel: fromMeta?.label ?? "普通地址",
        toLabel: toMeta?.label ?? "普通地址",
        fromKind:
          fromMeta?.kind && fromMeta.kind !== "普通地址"
            ? formatAddressTagLabel(fromMeta.kind)
            : fromMeta?.isContract
              ? "合约地址"
              : "普通地址",
        toKind:
          toMeta?.kind && toMeta.kind !== "普通地址"
            ? formatAddressTagLabel(toMeta.kind)
            : toMeta?.isContract
              ? "合约地址"
              : "普通地址",
        amount,
        ratioOfSupply: amount != null && totalSupply && totalSupply > 0 ? (amount / totalSupply) * 100 : null,
        value: toNullableNumber((row as { value?: string | number | null }).value),
      };
    }),
  };
}

export async function getOnchainCexFlowsBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
  }
): Promise<OnchainCexFlowResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!dataset || !context) return null;

  const { resolvedTokenId, dedupedTokenAddresses } = context;
  if (dedupedTokenAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: null,
      tokenAddress: null,
      totalInflow: 0,
      totalOutflow: 0,
      totalNetflow: 0,
      dayCount: 0,
      days: [],
    };
  }

  const countsQuery = `
    SELECT
      LOWER(token_address) AS tokenAddress,
      COUNT(*) AS transferCount
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) IN UNNEST(@addresses)
    ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
    GROUP BY tokenAddress
    ORDER BY transferCount DESC
  `;
  const [countRows] = await bigQuery.query({
    query: countsQuery,
    params: {
      addresses: dedupedTokenAddresses.map(row => row.address),
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });

  const chosenAddress =
    dedupedTokenAddresses.find(row =>
      countRows.some(
        countRow => String((countRow as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === row.address
      )
    ) ?? dedupedTokenAddresses[0];

  const walletQuery = `
    SELECT
      LOWER(address) AS address,
      tag_label,
      tags_base
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
  `;
  const [walletRows] = await bigQuery.query({
    query: walletQuery,
    useLegacySql: false,
  });

  const exchangeWallets = walletRows
    .map(row => {
      const address = String((row as { address?: string }).address ?? "").toLowerCase();
      const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
      const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
      const exchange = detectCentralizedExchangeName(tagLabel, tagsBase);
      if (!address || !exchange) return null;
      return { address, exchange };
    })
    .filter((item): item is { address: string; exchange: string } => Boolean(item?.address && item?.exchange));

  const exchangeAddressToName = new Map<string, string>();
  exchangeWallets.forEach(item => {
    exchangeAddressToName.set(item.address, item.exchange);
  });

  const exchangeAddresses = Array.from(exchangeAddressToName.keys());
  if (exchangeAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      tokenAddress: chosenAddress.address,
      totalInflow: 0,
      totalOutflow: 0,
      totalNetflow: 0,
      dayCount: 0,
      days: [],
    };
  }

  const addressToExchangeCase = exchangeWallets
    .map(item => `WHEN '${item.address}' THEN '${item.exchange.replace(/'/g, "\\'")}'`)
    .join("\n          ");

  const transfersQuery = `
    WITH classified AS (
      SELECT
        FORMAT_TIMESTAMP('%F', TIMESTAMP(block_time), 'Asia/Shanghai') AS dateKey,
        CASE
          WHEN LOWER(to_address) IN UNNEST(@exchangeAddresses)
            AND LOWER(from_address) NOT IN UNNEST(@exchangeAddresses)
            THEN 'inflow'
          WHEN LOWER(from_address) IN UNNEST(@exchangeAddresses)
            AND LOWER(to_address) NOT IN UNNEST(@exchangeAddresses)
            THEN 'outflow'
          ELSE NULL
        END AS direction,
        CASE
          WHEN LOWER(to_address) IN UNNEST(@exchangeAddresses) THEN CASE LOWER(to_address)
          ${addressToExchangeCase}
          ELSE NULL END
          WHEN LOWER(from_address) IN UNNEST(@exchangeAddresses) THEN CASE LOWER(from_address)
          ${addressToExchangeCase}
          ELSE NULL END
          ELSE NULL
        END AS exchange,
        SAFE_CAST(amount AS NUMERIC) AS amount
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
      WHERE LOWER(token_address) = @tokenAddress
        ${options?.chainId ? "AND CAST(chain_id AS INT64) = @chainId" : ""}
        AND (
          LOWER(from_address) IN UNNEST(@exchangeAddresses)
          OR LOWER(to_address) IN UNNEST(@exchangeAddresses)
        )
        AND SAFE_CAST(amount AS NUMERIC) IS NOT NULL
    )
    SELECT
      dateKey,
      exchange,
      direction,
      COUNT(*) AS txCount,
      SUM(amount) AS totalAmount
    FROM classified
    WHERE direction IS NOT NULL
      AND exchange IS NOT NULL
    GROUP BY dateKey, exchange, direction
  `;
  const [transferRows] = await bigQuery.query({
    query: transfersQuery,
    params: {
      tokenAddress: chosenAddress.address,
      exchangeAddresses,
      ...(options?.chainId ? { chainId: options.chainId } : {}),
    },
    useLegacySql: false,
  });

  const dayMap = new Map<
    string,
    {
      inflow: number;
      outflow: number;
      exchanges: Map<
        string,
        {
          inflow: number;
          outflow: number;
          inflowTxCount: number;
          outflowTxCount: number;
        }
      >;
    }
  >();

  transferRows.forEach(row => {
    const dateKey = String((row as { dateKey?: string }).dateKey ?? "").trim();
    const direction = String((row as { direction?: string }).direction ?? "").trim();
    const exchangeName = String((row as { exchange?: string }).exchange ?? "").trim();
    const amount = toNullableNumber((row as { totalAmount?: string | number | null }).totalAmount);
    const txCount = toNullableNumber((row as { txCount?: string | number | null }).txCount) ?? 0;
    if (!dateKey || !exchangeName || amount == null || amount <= 0) return;

    const dayEntry = dayMap.get(dateKey) ?? {
      inflow: 0,
      outflow: 0,
      exchanges: new Map(),
    };

    const exchangeEntry = dayEntry.exchanges.get(exchangeName) ?? {
      inflow: 0,
      outflow: 0,
      inflowTxCount: 0,
      outflowTxCount: 0,
    };

    if (direction === "inflow") {
      dayEntry.inflow += amount;
      exchangeEntry.inflow += amount;
      exchangeEntry.inflowTxCount += txCount;
    } else if (direction === "outflow") {
      dayEntry.outflow += amount;
      exchangeEntry.outflow += amount;
      exchangeEntry.outflowTxCount += txCount;
    }

    dayEntry.exchanges.set(exchangeName, exchangeEntry);
    dayMap.set(dateKey, dayEntry);
  });

  const days = Array.from(dayMap.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([date, dayEntry]) => ({
      date,
      inflow: dayEntry.inflow,
      outflow: dayEntry.outflow,
      netflow: dayEntry.inflow - dayEntry.outflow,
      exchangeCount: dayEntry.exchanges.size,
      exchanges: Array.from(dayEntry.exchanges.entries())
        .map(([exchange, values]) => ({
          exchange,
          inflow: values.inflow,
          outflow: values.outflow,
          netflow: values.inflow - values.outflow,
          inflowTxCount: values.inflowTxCount,
          outflowTxCount: values.outflowTxCount,
        }))
        .sort((left, right) => {
          const rightMagnitude = Math.abs(right.netflow) || right.inflow + right.outflow;
          const leftMagnitude = Math.abs(left.netflow) || left.inflow + left.outflow;
          return rightMagnitude - leftMagnitude;
        }),
    }));

  const totalInflow = days.reduce((sum, day) => sum + day.inflow, 0);
  const totalOutflow = days.reduce((sum, day) => sum + day.outflow, 0);

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: chosenAddress.tokenAddressId,
    tokenAddress: chosenAddress.address,
    totalInflow,
    totalOutflow,
    totalNetflow: totalInflow - totalOutflow,
    dayCount: days.length,
    days,
  };
}

export async function getOnchainCexFlowTransferDetailsBySymbol(
  symbol: string,
  options: {
    date: string;
    exchange?: string | null;
    direction: "all" | "inflow" | "outflow";
  }
): Promise<OnchainCexFlowTransferDetailsResult | null> {
  const currentPool = getPool();
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const normalizedSymbol = symbol.trim().toUpperCase();
  const fallbackToken = fallbackOnchainTokens[normalizedSymbol] ?? null;
  let profile: TokenProfileResult | null = null;

  try {
    profile = await getTokenProfileBySymbol(symbol);
  } catch {
    profile = null;
  }

  if (!dataset || (!profile && !fallbackToken)) return null;

  const resolvedTokenId = profile?.tokenId ?? fallbackToken?.tokenId ?? 0;
  const totalSupply = profile?.totalSupply != null && Number.isFinite(profile.totalSupply) ? profile.totalSupply : null;
  let tokenAddressRows: Array<{ tokenAddressId: number | null; address: string }> = [];

  if (profile) {
    try {
      const [rows] = await currentPool.query<
        (RowDataPacket & {
          tokenAddressId: number;
          address: string;
        })[]
      >(
        `
          SELECT
            ta.id AS tokenAddressId,
            ta.address AS address
          FROM token_address ta
          WHERE ta.token_id = ?
          ORDER BY ta.id DESC
        `,
        [profile.tokenId]
      );

      tokenAddressRows = rows.map(row => ({
        tokenAddressId: row.tokenAddressId,
        address: String(row.address).toLowerCase(),
      }));
    } catch {
      tokenAddressRows = [];
    }
  }

  if (tokenAddressRows.length === 0 && fallbackToken) {
    tokenAddressRows = fallbackToken.addresses.map(address => ({
      tokenAddressId: null,
      address: address.toLowerCase(),
    }));
  }

  const dedupedTokenAddresses = Array.from(new Map(tokenAddressRows.map(row => [row.address, row])).values());
  if (dedupedTokenAddresses.length === 0) return null;

  const countsQuery = `
    SELECT
      LOWER(token_address) AS tokenAddress,
      COUNT(*) AS transferCount
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) IN UNNEST(@addresses)
    GROUP BY tokenAddress
    ORDER BY transferCount DESC
  `;
  const [countRows] = await bigQuery.query({
    query: countsQuery,
    params: { addresses: dedupedTokenAddresses.map(row => row.address) },
    useLegacySql: false,
  });

  const chosenAddress =
    dedupedTokenAddresses.find(row =>
      countRows.some(
        countRow => String((countRow as { tokenAddress?: string }).tokenAddress ?? "").toLowerCase() === row.address
      )
    ) ?? dedupedTokenAddresses[0];

  const walletQuery = `
    SELECT
      LOWER(address) AS address,
      tag_label,
      tags_base,
      is_contract
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.wallet_info\`
  `;
  const [walletRows] = await bigQuery.query({
    query: walletQuery,
    useLegacySql: false,
  });

  const walletMeta = new Map<string, { label: string; kind: string; isContract: boolean }>();
  const exchangeAddressToName = new Map<string, string>();
  walletRows.forEach(row => {
    const address = String((row as { address?: string }).address ?? "").toLowerCase();
    if (!address) return;
    const tagLabel = (row as { tag_label?: string | null }).tag_label ?? null;
    const tagsBase = (row as { tags_base?: string | null }).tags_base ?? null;
    const isContract = Boolean((row as { is_contract?: boolean | null }).is_contract);
    const label = formatAddressTagLabel(tagLabel || tagsBase || (isContract ? "合约地址" : "普通地址"));
    const kind = formatAddressTagLabel(tagsBase || (isContract ? "合约地址" : "普通地址"));
    walletMeta.set(address, { label, kind, isContract });

    const exchange = detectCentralizedExchangeName(tagLabel, tagsBase);
    if (exchange) {
      exchangeAddressToName.set(address, exchange);
    }
  });

  const selectedExchange = (options.exchange ?? "").trim();
  const selectedDirection = options.direction;
  const exchangeAddresses = Array.from(exchangeAddressToName.entries())
    .filter(([, exchange]) => !selectedExchange || exchange === selectedExchange)
    .map(([address]) => address);

  if (exchangeAddresses.length === 0) {
    return {
      tokenId: resolvedTokenId,
      tokenAddressId: chosenAddress.tokenAddressId,
      tokenAddress: chosenAddress.address,
      totalSupply,
      date: options.date,
      exchange: selectedExchange,
      direction: selectedDirection,
      transferCount: 0,
      totalAmount: 0,
      items: [],
    };
  }

  const transferQuery = `
    SELECT
      txhash,
      log_index AS logIndex,
      block_time AS blockTime,
      LOWER(from_address) AS fromAddress,
      LOWER(to_address) AS toAddress,
      SAFE_CAST(amount AS NUMERIC) AS amount,
      SAFE_CAST(value AS NUMERIC) AS value
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
    WHERE LOWER(token_address) = @tokenAddress
      AND FORMAT_TIMESTAMP('%F', TIMESTAMP(block_time), 'Asia/Shanghai') = @date
      AND SAFE_CAST(amount AS NUMERIC) IS NOT NULL
      AND (
        (${selectedDirection === "inflow"
          ? "LOWER(to_address) IN UNNEST(@exchangeAddresses)"
          : selectedDirection === "outflow"
            ? "LOWER(from_address) IN UNNEST(@exchangeAddresses)"
            : "(LOWER(to_address) IN UNNEST(@exchangeAddresses) OR LOWER(from_address) IN UNNEST(@exchangeAddresses))"})
      )
    ORDER BY TIMESTAMP(block_time) DESC, log_index DESC
  `;
  const [transferRows] = await bigQuery.query({
    query: transferQuery,
    params: {
      tokenAddress: chosenAddress.address,
      date: options.date,
      exchangeAddresses,
    },
    useLegacySql: false,
  });

  const items = transferRows
    .map(row => {
      const fromAddress = String((row as { fromAddress?: string }).fromAddress ?? "").toLowerCase();
      const toAddress = String((row as { toAddress?: string }).toAddress ?? "").toLowerCase();
      const amount = toNullableNumber((row as { amount?: string | number | null }).amount);
      const fromExchange = exchangeAddressToName.get(fromAddress) ?? null;
      const toExchange = exchangeAddressToName.get(toAddress) ?? null;

      if ((fromExchange && toExchange) || (!fromExchange && !toExchange)) {
        return null;
      }
      if (selectedDirection === "inflow" && (!toExchange || fromExchange)) {
        return null;
      }
      if (selectedDirection === "outflow" && (!fromExchange || toExchange)) {
        return null;
      }

      const rawBlockTime = (row as { blockTime?: { value?: string } | string | null }).blockTime;
      const blockTime = typeof rawBlockTime === "string" ? rawBlockTime : rawBlockTime?.value ?? null;
      const fromMeta = walletMeta.get(fromAddress);
      const toMeta = walletMeta.get(toAddress);

      return {
        txhash: String((row as { txhash?: string }).txhash ?? ""),
        logIndex: toNullableNumber((row as { logIndex?: string | number | null }).logIndex),
        blockTime: blockTime?.trim() || null,
        fromAddress,
        toAddress,
        fromLabel: fromMeta?.label ?? "普通地址",
        toLabel: toMeta?.label ?? "普通地址",
        fromKind:
          fromMeta?.kind && fromMeta.kind !== "普通地址"
            ? formatAddressTagLabel(fromMeta.kind)
            : fromMeta?.isContract
              ? "合约地址"
              : "普通地址",
        toKind:
          toMeta?.kind && toMeta.kind !== "普通地址"
            ? formatAddressTagLabel(toMeta.kind)
            : toMeta?.isContract
              ? "合约地址"
              : "普通地址",
        amount,
        ratioOfSupply: amount != null && totalSupply && totalSupply > 0 ? (amount / totalSupply) * 100 : null,
        value: toNullableNumber((row as { value?: string | number | null }).value),
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: chosenAddress.tokenAddressId,
    tokenAddress: chosenAddress.address,
    totalSupply,
    date: options.date,
    exchange: selectedExchange || "全部交易所",
    direction: selectedDirection,
    transferCount: items.length,
    totalAmount: items.reduce((sum, item) => sum + (item.amount ?? 0), 0),
    items,
  };
}

export async function listAvailableOnchainTokens(limit = 20, chainId?: number | null): Promise<AvailableOnchainTokenResult> {
  const currentPool = getPool();
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;

  if (!dataset) {
    return { items: [] };
  }

  const cappedLimit = Math.min(Math.max(limit, 5), 100);
  const activityQuery = `
    WITH transfer_counts AS (
      SELECT CAST(chain_id AS INT64) AS chainId, token_id AS tokenId, COUNT(*) AS transferCount
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_transfer_raw\`
      ${chainId ? "WHERE CAST(chain_id AS INT64) = @chainId" : ""}
      GROUP BY chainId, tokenId
    ),
    holder_counts AS (
      SELECT CAST(chain_id AS INT64) AS chainId, token_id AS tokenId, COUNT(*) AS holderCount
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_holder_snapshot\`
      ${chainId ? "WHERE CAST(chain_id AS INT64) = @chainId" : ""}
      GROUP BY chainId, tokenId
    ),
    dex_counts AS (
      SELECT CAST(chain_id AS INT64) AS chainId, token_id AS tokenId, COUNT(*) AS dexActionCount
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_dex_pool_action_raw\`
      ${chainId ? "WHERE CAST(chain_id AS INT64) = @chainId" : ""}
      GROUP BY chainId, tokenId
    ),
    activity_ids AS (
      SELECT chainId, tokenId FROM transfer_counts
      UNION DISTINCT
      SELECT chainId, tokenId FROM holder_counts
      UNION DISTINCT
      SELECT chainId, tokenId FROM dex_counts
    )
    SELECT
      ids.chainId AS chainId,
      ids.tokenId AS tokenId,
      COALESCE(t.transferCount, 0) AS transferCount,
      COALESCE(h.holderCount, 0) AS holderCount,
      COALESCE(d.dexActionCount, 0) AS dexActionCount
    FROM activity_ids ids
    LEFT JOIN transfer_counts t
      ON ids.chainId = t.chainId AND ids.tokenId = t.tokenId
    LEFT JOIN holder_counts h
      ON ids.chainId = h.chainId AND ids.tokenId = h.tokenId
    LEFT JOIN dex_counts d
      ON ids.chainId = d.chainId AND ids.tokenId = d.tokenId
    ORDER BY transferCount DESC, holderCount DESC, dexActionCount DESC, tokenId ASC
    LIMIT @limit
  `;
  const [activityRows] = await bigQuery.query({
    query: activityQuery,
    params: { limit: cappedLimit, ...(chainId ? { chainId } : {}) },
    useLegacySql: false,
  });

  const tokenIds = activityRows
    .map(row => Number((row as { tokenId?: string | number }).tokenId ?? 0))
    .filter(tokenId => Number.isFinite(tokenId) && tokenId > 0);

  if (tokenIds.length === 0) {
    return { items: [] };
  }

  const placeholders = tokenIds.map(() => "?").join(", ");
  const [profileRows] = await currentPool.query<
    (RowDataPacket & {
      tokenId: number;
      symbol: string;
      name: string;
      tokenAddressId: number | null;
      tokenAddress: string | null;
    })[]
  >(
    `
      SELECT
        tp.id AS tokenId,
        tp.symbol AS symbol,
        tp.name AS name,
        ta.id AS tokenAddressId,
        ta.address AS tokenAddress
      FROM token_profiles tp
      LEFT JOIN (
        SELECT ta1.*
        FROM token_address ta1
        JOIN (
          SELECT token_id, MAX(id) AS maxId
          FROM token_address
          GROUP BY token_id
        ) latest
          ON latest.token_id = ta1.token_id
         AND latest.maxId = ta1.id
      ) ta ON ta.token_id = tp.id
      WHERE tp.id IN (${placeholders})
    `,
    tokenIds
  );

  const profileMap = new Map(profileRows.map(row => [row.tokenId, row]));

  return {
    items: activityRows
      .map(row => {
        const tokenId = Number((row as { tokenId?: string | number }).tokenId ?? 0);
        const profile = profileMap.get(tokenId);
        if (!profile) return null;
        return {
          chainId: toNullableNumber((row as { chainId?: string | number | null }).chainId),
          tokenId,
          symbol: profile.symbol,
          name: profile.name,
          tokenAddressId: profile.tokenAddressId,
          tokenAddress: profile.tokenAddress,
          transferCount: Number((row as { transferCount?: string | number }).transferCount ?? 0),
          holderCount: Number((row as { holderCount?: string | number }).holderCount ?? 0),
          dexActionCount: Number((row as { dexActionCount?: string | number }).dexActionCount ?? 0),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
}

const COMMON_QUOTE_SYMBOLS = new Set([
  "BNB",
  "WBNB",
  "USDT",
  "USDC",
  "FDUSD",
  "BUSD",
  "USDE",
  "USD1",
  "USDS",
  "DAI",
]);

function derivePoolCoreAndQuote(params: {
  token0Symbol: string | null;
  token0Address: string | null;
  token1Symbol: string | null;
  token1Address: string | null;
  fallbackCoreTokenSymbol: string | null;
  fallbackCoreTokenAddress: string | null;
  fallbackQuoteTokenSymbol: string | null;
  fallbackQuoteTokenAddress: string | null;
}) {
  const token0Symbol = params.token0Symbol?.trim() || null;
  const token1Symbol = params.token1Symbol?.trim() || null;
  const token0Address = params.token0Address?.trim().toLowerCase() || null;
  const token1Address = params.token1Address?.trim().toLowerCase() || null;
  const fallbackCoreTokenSymbol = params.fallbackCoreTokenSymbol?.trim() || null;
  const fallbackCoreTokenAddress = params.fallbackCoreTokenAddress?.trim().toLowerCase() || null;
  const fallbackQuoteTokenSymbol = params.fallbackQuoteTokenSymbol?.trim() || null;
  const fallbackQuoteTokenAddress = params.fallbackQuoteTokenAddress?.trim().toLowerCase() || null;

  const token0IsQuote = token0Symbol ? COMMON_QUOTE_SYMBOLS.has(token0Symbol.toUpperCase()) : false;
  const token1IsQuote = token1Symbol ? COMMON_QUOTE_SYMBOLS.has(token1Symbol.toUpperCase()) : false;

  if (token0IsQuote && !token1IsQuote) {
    return {
      coreTokenSymbol: token1Symbol,
      coreTokenAddress: token1Address,
      quoteTokenSymbol: token0Symbol,
      quoteTokenAddress: token0Address,
    };
  }

  if (token1IsQuote && !token0IsQuote) {
    return {
      coreTokenSymbol: token0Symbol,
      coreTokenAddress: token0Address,
      quoteTokenSymbol: token1Symbol,
      quoteTokenAddress: token1Address,
    };
  }

  if (fallbackCoreTokenSymbol || fallbackCoreTokenAddress || fallbackQuoteTokenSymbol || fallbackQuoteTokenAddress) {
    return {
      coreTokenSymbol: fallbackCoreTokenSymbol ?? token0Symbol ?? token1Symbol,
      coreTokenAddress: fallbackCoreTokenAddress ?? token0Address ?? token1Address,
      quoteTokenSymbol: fallbackQuoteTokenSymbol ?? token1Symbol ?? token0Symbol,
      quoteTokenAddress: fallbackQuoteTokenAddress ?? token1Address ?? token0Address,
    };
  }

  return {
    coreTokenSymbol: token0Symbol ?? token1Symbol,
    coreTokenAddress: token0Address ?? token1Address,
    quoteTokenSymbol: token1Symbol ?? token0Symbol,
    quoteTokenAddress: token1Address ?? token0Address,
  };
}

async function getDexPoolRegistryMappingsByPoolIds(poolIds: string[]) {
  if (poolIds.length === 0) {
    return new Map<string, { id: string; poolId: string; poolAddress: string | null }>();
  }

  const currentPool = getPool();
  const placeholders = poolIds.map(() => "?").join(", ");
  const [rows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      poolId: string | null;
      poolAddress: string | null;
      createdAt: string | null;
    })[]
  >(
    `
      SELECT
        id,
        CAST(pool_id AS CHAR) AS poolId,
        LOWER(pool_address) AS poolAddress,
        created_at AS createdAt
      FROM dex_pool_registry
      WHERE pool_id IN (${placeholders})
      ORDER BY created_at DESC, id DESC
    `,
    poolIds
  );

  const mapping = new Map<string, { id: string; poolId: string; poolAddress: string | null }>();
  for (const row of rows) {
    if (!row.poolId || mapping.has(row.poolId)) continue;
    mapping.set(row.poolId, {
      id: String(row.id),
      poolId: row.poolId,
      poolAddress: row.poolAddress ? String(row.poolAddress).toLowerCase() : null,
    });
  }

  return mapping;
}

async function getFirstAddRowsByPoolRegistryIds(
  bigQuery: BigQuery,
  projectId: string,
  dataset: string,
  poolRegistryIds: string[]
) {
  if (poolRegistryIds.length === 0) {
    return new Map<
      string,
      {
        poolRegistryId: string;
        tokenSymbol: string | null;
        tokenAddress: string | null;
        quoteTokenSymbol: string | null;
        quoteTokenAddress: string | null;
        traderAddress: string | null;
        tokenAmount: number | null;
        quoteTokenAmount: number | null;
        value: number | null;
        price: number | null;
        blockTime: string | null;
      }
    >();
  }

  const [rows] = await bigQuery.query({
    query: `
      SELECT
        CAST(pool_registry_id AS STRING) AS poolRegistryId,
        token_symbol AS tokenSymbol,
        LOWER(token_address) AS tokenAddress,
        quote_token_symbol AS quoteTokenSymbol,
        LOWER(quote_token_address) AS quoteTokenAddress,
        LOWER(trader_address) AS traderAddress,
        SAFE_CAST(token_amount AS NUMERIC) AS tokenAmount,
        SAFE_CAST(quote_token_amount AS NUMERIC) AS quoteTokenAmount,
        SAFE_CAST(value AS NUMERIC) AS value,
        SAFE_CAST(price AS NUMERIC) AS price,
        block_time AS blockTime
      FROM \`${projectId}.${dataset}.token_dex_pool_action_raw\`
      WHERE action_type = 'add_liquidity'
        AND CAST(pool_registry_id AS STRING) IN UNNEST(@poolRegistryIds)
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY CAST(pool_registry_id AS STRING)
        ORDER BY TIMESTAMP(block_time) ASC, log_index ASC
      ) = 1
    `,
    params: { poolRegistryIds },
    useLegacySql: false,
  });

  const mapping = new Map<
    string,
    {
      poolRegistryId: string;
      tokenSymbol: string | null;
      tokenAddress: string | null;
      quoteTokenSymbol: string | null;
      quoteTokenAddress: string | null;
      traderAddress: string | null;
      tokenAmount: number | null;
      quoteTokenAmount: number | null;
      value: number | null;
      price: number | null;
      blockTime: string | null;
    }
  >();

  for (const row of rows) {
    const poolRegistryId =
      typeof (row as { poolRegistryId?: string | null }).poolRegistryId === "string"
        ? String((row as { poolRegistryId?: string | null }).poolRegistryId)
        : null;
    if (!poolRegistryId) continue;
    const rawBlockTime = (row as { blockTime?: { value?: string } | string | null }).blockTime;
    const blockTime = typeof rawBlockTime === "string" ? rawBlockTime : rawBlockTime?.value ?? null;
    mapping.set(poolRegistryId, {
      poolRegistryId,
      tokenSymbol:
        typeof (row as { tokenSymbol?: string | null }).tokenSymbol === "string"
          ? String((row as { tokenSymbol?: string | null }).tokenSymbol)
          : null,
      tokenAddress:
        typeof (row as { tokenAddress?: string | null }).tokenAddress === "string"
          ? String((row as { tokenAddress?: string | null }).tokenAddress).toLowerCase()
          : null,
      quoteTokenSymbol:
        typeof (row as { quoteTokenSymbol?: string | null }).quoteTokenSymbol === "string"
          ? String((row as { quoteTokenSymbol?: string | null }).quoteTokenSymbol)
          : null,
      quoteTokenAddress:
        typeof (row as { quoteTokenAddress?: string | null }).quoteTokenAddress === "string"
          ? String((row as { quoteTokenAddress?: string | null }).quoteTokenAddress).toLowerCase()
          : null,
      traderAddress:
        typeof (row as { traderAddress?: string | null }).traderAddress === "string"
          ? String((row as { traderAddress?: string | null }).traderAddress).toLowerCase()
          : null,
      tokenAmount: toNullableNumber((row as { tokenAmount?: string | number | null }).tokenAmount),
      quoteTokenAmount: toNullableNumber((row as { quoteTokenAmount?: string | number | null }).quoteTokenAmount),
      value: toNullableNumber((row as { value?: string | number | null }).value),
      price: toNullableNumber((row as { price?: string | number | null }).price),
      blockTime: blockTime?.trim() || null,
    });
  }

  return mapping;
}

export async function listAvailableOnchainPools(
  page = 1,
  pageSize = 100,
  query?: string
): Promise<AvailableOnchainPoolResult> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  if (!dataset || !projectId) {
    return { items: [], total: 0, page: 1, pageSize };
  }

  const normalizedPage = Math.max(1, page);
  const normalizedPageSize = Math.min(Math.max(pageSize, 20), 100);
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const hasQuery = normalizedQuery.length > 0;

  const baseCte = `
    WITH pool_rows AS (
      SELECT
        CAST(pool_id AS STRING) AS poolId,
        LOWER(pool_address) AS poolAddress,
        chain_id,
        dex_name,
        protocol_version,
        token0_symbol,
        LOWER(token0_address) AS token0Address,
        token1_symbol,
        LOWER(token1_address) AS token1Address,
        block_time
      FROM \`${projectId}.${dataset}.token_dex_pool_raw\`
    ),
    pool_meta AS (
      SELECT
        poolId,
        MIN(block_time) AS poolCreatedTime,
        ARRAY_AGG(
          STRUCT(
            poolAddress,
            chain_id,
            dex_name,
            protocol_version,
            token0_symbol,
            token0Address,
            token1_symbol,
            token1Address
          )
          ORDER BY
            CASE WHEN poolAddress IS NULL OR poolAddress = '' THEN 1 ELSE 0 END ASC,
            TIMESTAMP(block_time) DESC
          LIMIT 1
        )[OFFSET(0)] AS meta
      FROM pool_rows
      GROUP BY poolId
    ),
    first_started AS (
      SELECT
        CAST(pool_id AS STRING) AS poolId,
        MIN(block_time) AS lock_time,
        MIN(started_time) AS started_time
      FROM \`${projectId}.${dataset}.pool_started_timestamp_raw\`
      GROUP BY CAST(pool_id AS STRING)
    ),
    joined AS (
      SELECT
        first_started.poolId AS poolId,
        pool.meta.poolAddress AS poolAddress,
        pool.meta.chain_id AS chainId,
        pool.meta.dex_name AS dexName,
        pool.meta.protocol_version AS protocolVersion,
        pool.meta.token0_symbol AS token0Symbol,
        pool.meta.token0Address AS token0Address,
        pool.meta.token1_symbol AS token1Symbol,
        pool.meta.token1Address AS token1Address,
        first_started.lock_time AS poolLockTime,
        first_started.started_time AS startedTime,
        pool.poolCreatedTime AS poolCreatedTime
      FROM first_started
      INNER JOIN pool_meta pool
        ON first_started.poolId = pool.poolId
    )
  `;

  const countQuery = `
    ${baseCte}
    SELECT COUNT(*) AS total
    FROM joined
    ${hasQuery ? `
    WHERE LOWER(CONCAT(
      COALESCE(token0Symbol, ''), ' ',
      COALESCE(token1Symbol, ''), ' ',
      COALESCE(token0Address, ''), ' ',
      COALESCE(token1Address, ''), ' ',
      COALESCE(poolAddress, ''), ' ',
      COALESCE(poolId, ''), ' ',
      COALESCE(dexName, '')
    )) LIKE CONCAT('%', @query, '%')
    ` : ""}
  `;

  const dataQuery = `
    ${baseCte}
    SELECT *
    FROM joined
    ${hasQuery ? `
    WHERE LOWER(CONCAT(
      COALESCE(token0Symbol, ''), ' ',
      COALESCE(token1Symbol, ''), ' ',
      COALESCE(token0Address, ''), ' ',
      COALESCE(token1Address, ''), ' ',
      COALESCE(poolAddress, ''), ' ',
      COALESCE(poolId, ''), ' ',
      COALESCE(dexName, '')
    )) LIKE CONCAT('%', @query, '%')
    ` : ""}
    ORDER BY TIMESTAMP(poolCreatedTime) DESC, TIMESTAMP(startedTime) DESC
    LIMIT @limit
    OFFSET @offset
  `;

  const [countRows] = await bigQuery.query({
    query: countQuery,
    params: hasQuery ? { query: normalizedQuery } : undefined,
    useLegacySql: false,
  });

  const total = Number((countRows?.[0] as { total?: string | number | null } | undefined)?.total ?? 0);

  const [rows] = await bigQuery.query({
    query: dataQuery,
    params: hasQuery ? { limit: normalizedPageSize, offset, query: normalizedQuery } : { limit: normalizedPageSize, offset },
    useLegacySql: false,
  });

  const poolIds = Array.from(
    new Set(
      rows
        .map(row => {
          const rawPoolId = (row as { poolId?: string | number | null }).poolId;
          return rawPoolId == null ? null : String(rawPoolId);
        })
        .filter((poolId): poolId is string => Boolean(poolId))
    )
  );
  const registryByPoolId = await getDexPoolRegistryMappingsByPoolIds(poolIds);
  const poolRegistryIds = Array.from(new Set(Array.from(registryByPoolId.values()).map(item => item.id)));
  const firstAddByRegistryId = await getFirstAddRowsByPoolRegistryIds(bigQuery, projectId, dataset, poolRegistryIds);

  return {
    items: rows.map(row => {
      const rawStartedTime = (row as { startedTime?: { value?: string } | string | null }).startedTime;
      const rawFirstAddTime = (row as { firstAddLiquidityTime?: { value?: string } | string | null }).firstAddLiquidityTime;
      const rawPoolCreatedTime = (row as { poolCreatedTime?: { value?: string } | string | null }).poolCreatedTime;
      const rawPoolLockTime = (row as { poolLockTime?: { value?: string } | string | null }).poolLockTime;
      const startedTime = typeof rawStartedTime === "string" ? rawStartedTime : rawStartedTime?.value ?? null;
      const firstAddLiquidityTime = typeof rawFirstAddTime === "string" ? rawFirstAddTime : rawFirstAddTime?.value ?? null;
      const poolCreatedTime = typeof rawPoolCreatedTime === "string" ? rawPoolCreatedTime : rawPoolCreatedTime?.value ?? null;
      const poolLockTime = typeof rawPoolLockTime === "string" ? rawPoolLockTime : rawPoolLockTime?.value ?? null;
      const token0Symbol =
        typeof (row as { token0Symbol?: string | null }).token0Symbol === "string"
          ? String((row as { token0Symbol?: string | null }).token0Symbol)
          : null;
      const token1Symbol =
        typeof (row as { token1Symbol?: string | null }).token1Symbol === "string"
          ? String((row as { token1Symbol?: string | null }).token1Symbol)
          : null;
      const token0Address =
        typeof (row as { token0Address?: string | null }).token0Address === "string"
          ? String((row as { token0Address?: string | null }).token0Address).toLowerCase()
          : null;
      const token1Address =
        typeof (row as { token1Address?: string | null }).token1Address === "string"
          ? String((row as { token1Address?: string | null }).token1Address).toLowerCase()
          : null;
      const fallbackCoreTokenSymbol =
        null;
      const fallbackCoreTokenAddress =
        null;
      const fallbackQuoteTokenSymbol =
        null;
      const fallbackQuoteTokenAddress =
        null;
      const poolId =
        typeof (row as { poolId?: string | number | null }).poolId === "string"
          ? String((row as { poolId?: string | number | null }).poolId)
          : (row as { poolId?: string | number | null }).poolId != null
            ? String((row as { poolId?: string | number | null }).poolId)
            : null;
      const registryMapping = poolId ? registryByPoolId.get(poolId) ?? null : null;
      const firstAdd = registryMapping ? firstAddByRegistryId.get(registryMapping.id) ?? null : null;
      const derivedTokens = derivePoolCoreAndQuote({
        token0Symbol,
        token0Address,
        token1Symbol,
        token1Address,
        fallbackCoreTokenSymbol: firstAdd?.tokenSymbol ?? fallbackCoreTokenSymbol,
        fallbackCoreTokenAddress: firstAdd?.tokenAddress ?? fallbackCoreTokenAddress,
        fallbackQuoteTokenSymbol: firstAdd?.quoteTokenSymbol ?? fallbackQuoteTokenSymbol,
        fallbackQuoteTokenAddress: firstAdd?.quoteTokenAddress ?? fallbackQuoteTokenAddress,
      });
      return {
        poolRegistryId: registryMapping?.id ?? null,
        poolId,
        poolAddress:
          typeof (row as { poolAddress?: string | null }).poolAddress === "string"
            ? String((row as { poolAddress?: string | null }).poolAddress).toLowerCase()
            : registryMapping?.poolAddress ?? null,
        chainId: toNullableNumber((row as { chainId?: string | number | null }).chainId),
        dexName: typeof (row as { dexName?: string | null }).dexName === "string" ? String((row as { dexName?: string | null }).dexName) : null,
        protocolVersion:
          typeof (row as { protocolVersion?: string | null }).protocolVersion === "string"
            ? String((row as { protocolVersion?: string | null }).protocolVersion)
            : null,
        coreTokenSymbol: derivedTokens.coreTokenSymbol,
        coreTokenAddress: derivedTokens.coreTokenAddress,
        quoteTokenSymbol: derivedTokens.quoteTokenSymbol,
        quoteTokenAddress: derivedTokens.quoteTokenAddress,
        token0Symbol,
        token0Address,
        token1Symbol,
        token1Address,
        poolLockTime: poolLockTime?.trim() || null,
        poolCreatedTime: poolCreatedTime?.trim() || null,
        startedTime: startedTime?.trim() || null,
        firstAddLiquidityTime: firstAdd?.blockTime ?? null,
        firstAddTraderAddress: firstAdd?.traderAddress ?? null,
        firstAddTokenAmount: firstAdd?.tokenAmount ?? null,
        firstAddQuoteTokenAmount: firstAdd?.quoteTokenAmount ?? null,
        firstAddValue: firstAdd?.value ?? null,
        firstAddPrice: firstAdd?.price ?? null,
      };
    }),
    total,
    page: normalizedPage,
    pageSize: normalizedPageSize,
  };
}

export async function getOnchainPoolAddsBySymbol(
  symbol: string,
  options?: {
    tokenId?: number | null;
    chainId?: number | null;
  }
): Promise<OnchainPoolAddsResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const context = await resolveOnchainTokenContext({
    symbol,
    tokenId: options?.tokenId,
    chainId: options?.chainId,
  });

  if (!dataset || !context) return null;

  const { profile, resolvedTokenId, dedupedTokenAddresses } = context;
  const tokenAddress = dedupedTokenAddresses[0] ?? null;

  const latestQuery = `
    SELECT
      action.pool_registry_id AS poolRegistryId,
      CAST(pool.pool_id AS STRING) AS poolId,
      LOWER(pool.pool_address) AS poolAddress,
      action.txhash AS txhash,
      action.block_time AS blockTime,
      started.started_time AS startedTime,
      LOWER(action.trader_address) AS traderAddress,
      LOWER(action.recipient_address) AS recipientAddress,
      LOWER(action.quote_token_address) AS quoteTokenAddress,
      action.quote_token_symbol AS quoteTokenSymbol,
      pool.token0_symbol AS token0Symbol,
      pool.token1_symbol AS token1Symbol,
      action.action_type AS actionType,
      action.event_name AS eventName,
      SAFE_CAST(action.token_amount AS NUMERIC) AS tokenAmount,
      SAFE_CAST(action.quote_token_amount AS NUMERIC) AS quoteTokenAmount,
      SAFE_CAST(action.value AS NUMERIC) AS value,
      SAFE_CAST(action.price AS NUMERIC) AS price,
      action.parse_source AS parseSource,
      action.parse_reason AS parseReason,
      action.chain_id AS chainId
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_dex_pool_action_raw\` action
    LEFT JOIN \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_dex_pool_raw\` pool
      ON CAST(pool.row_id AS STRING) = CAST(action.pool_registry_id AS STRING)
    LEFT JOIN (
      SELECT
        pool_id,
        MIN(started_time) AS started_time
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.pool_started_timestamp_raw\`
      GROUP BY pool_id
    ) started
      ON started.pool_id = pool.pool_id
    WHERE action.token_id = @tokenId
      ${options?.chainId ? "AND CAST(action.chain_id AS INT64) = @chainId" : ""}
      AND action.action_type = 'add_liquidity'
    ORDER BY TIMESTAMP(action.block_time) ASC
    LIMIT 20
  `;

  const totalQuery = `
    SELECT
      COUNT(*) AS total,
      MIN(action.block_time) AS earliestBlockTime,
      MIN(started.started_time) AS earliestStartedTime
    FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_dex_pool_action_raw\` action
    LEFT JOIN \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.token_dex_pool_raw\` pool
      ON CAST(pool.row_id AS STRING) = CAST(action.pool_registry_id AS STRING)
    LEFT JOIN (
      SELECT
        pool_id,
        MIN(started_time) AS started_time
      FROM \`${process.env.BIGQUERY_PROJECT_ID}.${dataset}.pool_started_timestamp_raw\`
      GROUP BY pool_id
    ) started
      ON started.pool_id = pool.pool_id
    WHERE action.token_id = @tokenId
      ${options?.chainId ? "AND CAST(action.chain_id AS INT64) = @chainId" : ""}
      AND action.action_type = 'add_liquidity'
  `;

  const [latestRows] = await bigQuery.query({
    query: latestQuery,
    params: { tokenId: resolvedTokenId, ...(options?.chainId ? { chainId: options.chainId } : {}) },
    useLegacySql: false,
  });

  const [totalRows] = await bigQuery.query({
    query: totalQuery,
    params: { tokenId: resolvedTokenId, ...(options?.chainId ? { chainId: options.chainId } : {}) },
    useLegacySql: false,
  });

  const total = Number((totalRows[0] as { total?: string | number | null } | undefined)?.total ?? 0);
  const rawEarliestBlockTime = (totalRows[0] as { earliestBlockTime?: { value?: string } | string | null } | undefined)?.earliestBlockTime;
  const earliestBlockTime = typeof rawEarliestBlockTime === "string" ? rawEarliestBlockTime : rawEarliestBlockTime?.value ?? null;
  const rawEarliestStartedTime = (totalRows[0] as { earliestStartedTime?: { value?: string } | string | null } | undefined)?.earliestStartedTime;
  const earliestStartedTime = typeof rawEarliestStartedTime === "string" ? rawEarliestStartedTime : rawEarliestStartedTime?.value ?? null;

  return {
    tokenId: resolvedTokenId,
    tokenAddressId: tokenAddress?.tokenAddressId ?? null,
    tokenAddress: tokenAddress?.address ?? profile?.addresses[0]?.address ?? null,
    total,
    earliestBlockTime: earliestBlockTime?.trim() || null,
    earliestStartedTime: earliestStartedTime?.trim() || null,
    items: latestRows.map(row => {
      const tokenAmount = toNullableNumber((row as { tokenAmount?: string | number | null }).tokenAmount);
      const quoteTokenAmount = toNullableNumber((row as { quoteTokenAmount?: string | number | null }).quoteTokenAmount);
      const value = toNullableNumber((row as { value?: string | number | null }).value);
      const price = toNullableNumber((row as { price?: string | number | null }).price);
      const rawBlockTime = (row as { blockTime?: { value?: string } | string | null }).blockTime;
      const blockTime = typeof rawBlockTime === "string" ? rawBlockTime : rawBlockTime?.value ?? null;
      const rawStartedTime = (row as { startedTime?: { value?: string } | string | null }).startedTime;
      const startedTime = typeof rawStartedTime === "string" ? rawStartedTime : rawStartedTime?.value ?? null;

      return {
        poolRegistryId:
          typeof (row as { poolRegistryId?: string | number | null }).poolRegistryId === "string"
            ? String((row as { poolRegistryId?: string | number | null }).poolRegistryId)
            : (row as { poolRegistryId?: string | number | null }).poolRegistryId != null
              ? String((row as { poolRegistryId?: string | number | null }).poolRegistryId)
              : null,
        poolId:
          typeof (row as { poolId?: string | number | null }).poolId === "string"
            ? String((row as { poolId?: string | number | null }).poolId)
            : (row as { poolId?: string | number | null }).poolId != null
              ? String((row as { poolId?: string | number | null }).poolId)
              : null,
        poolAddress:
          typeof (row as { poolAddress?: string | null }).poolAddress === "string"
            ? String((row as { poolAddress?: string | null }).poolAddress).toLowerCase()
            : null,
        txhash: typeof (row as { txhash?: string | null }).txhash === "string" ? String((row as { txhash?: string | null }).txhash) : null,
        blockTime: blockTime?.trim() || null,
        startedTime: startedTime?.trim() || null,
        traderAddress: String((row as { traderAddress?: string }).traderAddress ?? "").toLowerCase(),
        recipientAddress:
          typeof (row as { recipientAddress?: string | null }).recipientAddress === "string"
            ? String((row as { recipientAddress?: string | null }).recipientAddress).toLowerCase()
            : null,
        quoteTokenAddress:
          typeof (row as { quoteTokenAddress?: string | null }).quoteTokenAddress === "string"
            ? String((row as { quoteTokenAddress?: string | null }).quoteTokenAddress).toLowerCase()
            : null,
        quoteTokenSymbol:
          typeof (row as { quoteTokenSymbol?: string | null }).quoteTokenSymbol === "string"
            ? String((row as { quoteTokenSymbol?: string | null }).quoteTokenSymbol)
            : null,
        token0Symbol:
          typeof (row as { token0Symbol?: string | null }).token0Symbol === "string"
            ? String((row as { token0Symbol?: string | null }).token0Symbol)
            : null,
        token1Symbol:
          typeof (row as { token1Symbol?: string | null }).token1Symbol === "string"
            ? String((row as { token1Symbol?: string | null }).token1Symbol)
            : null,
        actionType: typeof (row as { actionType?: string | null }).actionType === "string" ? String((row as { actionType?: string | null }).actionType) : null,
        eventName: typeof (row as { eventName?: string | null }).eventName === "string" ? String((row as { eventName?: string | null }).eventName) : null,
        tokenAmount,
        quoteTokenAmount,
        value,
        price,
        parseSource: typeof (row as { parseSource?: string | null }).parseSource === "string" ? String((row as { parseSource?: string | null }).parseSource) : null,
        parseReason: typeof (row as { parseReason?: string | null }).parseReason === "string" ? String((row as { parseReason?: string | null }).parseReason) : null,
        chainId: toNullableNumber((row as { chainId?: string | number | null }).chainId),
      };
    }),
  };
}

export async function getOnchainPoolAddsByPoolId(
  poolRegistryId: string
): Promise<OnchainPoolAddsByPoolResult | null> {
  const bigQuery = getBigQueryClient();
  const dataset = process.env.BIGQUERY_DATASET;
  const projectId = process.env.BIGQUERY_PROJECT_ID;
  const normalizedPoolRegistryId = poolRegistryId.trim();

  if (!dataset || !projectId || !normalizedPoolRegistryId) return null;

  const currentPool = getPool();
  const [registryRows] = await currentPool.query<
    (RowDataPacket & {
      id: number;
      poolId: string | null;
      poolAddress: string | null;
      token0Symbol: string | null;
      token1Symbol: string | null;
      createdAt: string | null;
    })[]
  >(
    `
      SELECT
        id,
        CAST(pool_id AS CHAR) AS poolId,
        LOWER(pool_address) AS poolAddress,
        token0_symbol AS token0Symbol,
        token1_symbol AS token1Symbol,
        created_at AS createdAt
      FROM dex_pool_registry
      WHERE id = ?
      LIMIT 1
    `,
    [normalizedPoolRegistryId]
  );

  const registry = registryRows[0] ?? null;
  if (!registry) return null;

  const normalizedPoolId = registry.poolId?.trim() || null;

  const latestQuery = `
    SELECT
      CAST(action.pool_registry_id AS STRING) AS poolRegistryId,
      action.txhash AS txhash,
      action.block_time AS blockTime,
      LOWER(action.trader_address) AS traderAddress,
      LOWER(action.recipient_address) AS recipientAddress,
      LOWER(action.quote_token_address) AS quoteTokenAddress,
      action.quote_token_symbol AS quoteTokenSymbol,
      action.action_type AS actionType,
      action.event_name AS eventName,
      SAFE_CAST(action.token_amount AS NUMERIC) AS tokenAmount,
      SAFE_CAST(action.quote_token_amount AS NUMERIC) AS quoteTokenAmount,
      SAFE_CAST(action.value AS NUMERIC) AS value,
      SAFE_CAST(action.price AS NUMERIC) AS price,
      action.parse_source AS parseSource,
      action.parse_reason AS parseReason,
      action.chain_id AS chainId
    FROM \`${projectId}.${dataset}.token_dex_pool_action_raw\` action
    WHERE CAST(action.pool_registry_id AS STRING) = @poolRegistryId
      AND action.action_type = 'add_liquidity'
    ORDER BY TIMESTAMP(action.block_time) ASC
    LIMIT 20
  `;

  const totalQuery = `
    SELECT
      COUNT(*) AS total,
      MIN(action.block_time) AS earliestBlockTime
    FROM \`${projectId}.${dataset}.token_dex_pool_action_raw\` action
    WHERE CAST(action.pool_registry_id AS STRING) = @poolRegistryId
      AND action.action_type = 'add_liquidity'
  `;

  const startedQuery = normalizedPoolId
    ? `
      SELECT
        MIN(block_time) AS earliestLockTime,
        MIN(started_time) AS earliestStartedTime
      FROM \`${projectId}.${dataset}.pool_started_timestamp_raw\`
      WHERE CAST(pool_id AS STRING) = @poolId
    `
    : null;

  const [latestRows] = await bigQuery.query({
    query: latestQuery,
    params: { poolRegistryId: normalizedPoolRegistryId },
    useLegacySql: false,
  });

  const [totalRows] = await bigQuery.query({
    query: totalQuery,
    params: { poolRegistryId: normalizedPoolRegistryId },
    useLegacySql: false,
  });

  const [startedRows] = startedQuery
    ? await bigQuery.query({
        query: startedQuery,
        params: { poolId: normalizedPoolId },
        useLegacySql: false,
      })
    : [[]];

  const totalRow = (totalRows[0] as {
    total?: string | number | null;
    earliestBlockTime?: { value?: string } | string | null;
  } | undefined) ?? {};
  const startedRow = (startedRows[0] as {
    earliestLockTime?: { value?: string } | string | null;
    earliestStartedTime?: { value?: string } | string | null;
  } | undefined) ?? {};

  const total = Number(totalRow.total ?? 0);
  const rawEarliestBlockTime = totalRow.earliestBlockTime;
  const rawEarliestStartedTime = startedRow.earliestStartedTime;
  const earliestBlockTime =
    typeof rawEarliestBlockTime === "string" ? rawEarliestBlockTime : rawEarliestBlockTime?.value ?? null;
  const earliestStartedTime =
    typeof rawEarliestStartedTime === "string" ? rawEarliestStartedTime : rawEarliestStartedTime?.value ?? null;

  return {
    poolRegistryId: String(registry.id),
    poolId: normalizedPoolId,
    poolAddress: registry.poolAddress ? String(registry.poolAddress).toLowerCase() : null,
    total,
    earliestBlockTime: earliestBlockTime?.trim() || null,
    earliestStartedTime: earliestStartedTime?.trim() || null,
    items: latestRows.map(row => {
      const tokenAmount = toNullableNumber((row as { tokenAmount?: string | number | null }).tokenAmount);
      const quoteTokenAmount = toNullableNumber((row as { quoteTokenAmount?: string | number | null }).quoteTokenAmount);
      const value = toNullableNumber((row as { value?: string | number | null }).value);
      const price = toNullableNumber((row as { price?: string | number | null }).price);
      const rawBlockTime = (row as { blockTime?: { value?: string } | string | null }).blockTime;
      const blockTime = typeof rawBlockTime === "string" ? rawBlockTime : rawBlockTime?.value ?? null;
      const rawStartedTime = (row as { startedTime?: { value?: string } | string | null }).startedTime;
      const startedTime = typeof rawStartedTime === "string" ? rawStartedTime : rawStartedTime?.value ?? null;

      return {
        poolRegistryId:
          typeof (row as { poolRegistryId?: string | number | null }).poolRegistryId === "string"
            ? String((row as { poolRegistryId?: string | number | null }).poolRegistryId)
            : (row as { poolRegistryId?: string | number | null }).poolRegistryId != null
              ? String((row as { poolRegistryId?: string | number | null }).poolRegistryId)
              : null,
        poolId: normalizedPoolId,
        poolAddress: registry.poolAddress ? String(registry.poolAddress).toLowerCase() : null,
        txhash: typeof (row as { txhash?: string | null }).txhash === "string" ? String((row as { txhash?: string | null }).txhash) : null,
        blockTime: blockTime?.trim() || null,
        startedTime: (startedTime?.trim() || earliestStartedTime?.trim()) ?? null,
        traderAddress: String((row as { traderAddress?: string }).traderAddress ?? "").toLowerCase(),
        recipientAddress:
          typeof (row as { recipientAddress?: string | null }).recipientAddress === "string"
            ? String((row as { recipientAddress?: string | null }).recipientAddress).toLowerCase()
            : null,
        quoteTokenAddress:
          typeof (row as { quoteTokenAddress?: string | null }).quoteTokenAddress === "string"
            ? String((row as { quoteTokenAddress?: string | null }).quoteTokenAddress).toLowerCase()
            : null,
        quoteTokenSymbol:
          typeof (row as { quoteTokenSymbol?: string | null }).quoteTokenSymbol === "string"
            ? String((row as { quoteTokenSymbol?: string | null }).quoteTokenSymbol)
            : null,
        token0Symbol: registry.token0Symbol ? String(registry.token0Symbol) : null,
        token1Symbol: registry.token1Symbol ? String(registry.token1Symbol) : null,
        actionType:
          typeof (row as { actionType?: string | null }).actionType === "string"
            ? String((row as { actionType?: string | null }).actionType)
            : null,
        eventName:
          typeof (row as { eventName?: string | null }).eventName === "string"
            ? String((row as { eventName?: string | null }).eventName)
            : null,
        tokenAmount,
        quoteTokenAmount,
        value,
        price,
        parseSource:
          typeof (row as { parseSource?: string | null }).parseSource === "string"
            ? String((row as { parseSource?: string | null }).parseSource)
            : null,
        parseReason:
          typeof (row as { parseReason?: string | null }).parseReason === "string"
            ? String((row as { parseReason?: string | null }).parseReason)
            : null,
        chainId: toNullableNumber((row as { chainId?: string | number | null }).chainId),
      };
    }),
  };
}
