import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createConnection, type RowDataPacket } from "mysql2/promise";

type Severity = "high" | "medium" | "low";

type Issue = {
  severity: Severity;
  category: string;
  tokenId: number;
  symbol: string;
  tokenName: string;
  exchangeId?: number;
  exchangeName?: string;
  marketType?: string;
  message: string;
  metrics?: Record<string, unknown>;
};

type CoverageRow = RowDataPacket & {
  tokenId: number;
  exchangeId: number;
  exchangeName: string;
  marketType: string;
  listingCount: number;
  pairCount: number;
  pairNames: string | null;
  hasCurrentFundingRate: number;
  hasCurrentOpenInterest: number;
};

type TokenProfileRow = RowDataPacket & {
  id: number;
  slug: string;
  symbol: string;
  name: string;
  coinMarketCapId: string | null;
  coinMarketCapIdVerify: number;
  totalSupply: number | null;
};

type UnlockAggregateRow = RowDataPacket & {
  tokenId: number;
  unlockRowCount: number;
  unlockAmountSum: number | null;
  unlockPctSum: number | null;
  unlockPctNullCount: number;
  emptyRecipientCount: number;
};

type TeamAggregateRow = RowDataPacket & {
  tokenId: number;
  teamMemberCount: number;
};

type FundingAggregateRow = RowDataPacket & {
  tokenId: number;
  fundingRoundCount: number;
};

type SocialAggregateRow = RowDataPacket & {
  tokenId: number;
  twitterLinkCount: number;
  twitterUrl: string | null;
};

type HistorySummaryRow = RowDataPacket & {
  tokenId: number;
  exchangeId: number;
  rowCount: number;
  minTs: string | null;
  maxTs: string | null;
  nullPrimaryCount: number;
  nullSecondaryCount: number;
  negativePrimaryCount: number;
  negativeSecondaryCount: number;
};

type GapSummaryRow = RowDataPacket & {
  tokenId: number;
  exchangeId: number;
  maxGapMinutes: number | null;
  gapCountOverThreshold: number;
  sameValueTransitions: number;
  outlierPrimaryCount: number;
  outlierSecondaryCount: number;
};

type RawDepthSnapshotRow = RowDataPacket & {
  tokenId: number;
  exchangeId: number;
  snapshotTs: string;
  buyDepth: number | null;
  sellDepth: number | null;
};

type RawFundingHistoryRow = RowDataPacket & {
  tokenId: number;
  exchangeId: number;
  snapshotTs: string;
  fundingRate: number | null;
  openInterest: number | null;
};

type ScopeToken = {
  tokenId: number;
  slug: string;
  symbol: string;
  tokenName: string;
  coinMarketCapId: string | null;
  coinMarketCapIdVerify: number;
  totalSupply: number | null;
  exchanges: CoverageRow[];
};

type CliOptions = {
  historyDays: number;
  outputDir: string;
  failOnHigh: boolean;
};

type CategoryMeta = {
  title: string;
  meaning: string;
};

const TARGET_EXCHANGES = [
  { id: 1, name: "Binance Spot" },
  { id: 9, name: "Upbit Spot" },
  { id: 8, name: "Bithumb Spot" },
  { id: 2, name: "OKX Spot" },
  { id: 7, name: "Coinbase Spot" },
  { id: 10, name: "Binance Perps" },
  { id: 16, name: "OKX Perps" },
] as const;

const TARGET_EXCHANGE_IDS = TARGET_EXCHANGES.map(exchange => exchange.id);

const HOURLY_GAP_THRESHOLD_MINUTES = 90;
const HOURLY_STALE_HOURS = 6;
const DAILY_STALE_HOURS = 48;
const UNLOCK_TOLERANCE_PCT = 1;
const STALE_RATIO_THRESHOLD = 0.95;
const MIN_STALE_SAMPLE_COUNT = 12;

const CATEGORY_META: Record<string, CategoryMeta> = {
  unlock_missing: {
    title: "缺少解锁数据",
    meaning: "这个代币没有解锁排期明细，无法判断未来解锁节奏。",
  },
  unlock_total_not_100: {
    title: "解锁总占比不等于 100%",
    meaning: "解锁数据存在，但累计占比和 100% 对不上，通常意味着解锁表不完整或 total supply 不匹配。",
  },
  unlock_not_verifiable: {
    title: "解锁数据无法校验",
    meaning: "有解锁行，但缺少百分比或总供应量，无法验证最终累计是否正确。",
  },
  unlock_percentage_inconsistent: {
    title: "解锁百分比与数量换算不一致",
    meaning: "表里的 percentage_of_total_supply 与 unlock_amount / total_supply 算出来的结果偏差较大。",
  },
  unlock_category_missing: {
    title: "解锁接收方分类缺失",
    meaning: "部分解锁行没有 recipient_category，后续做团队/投资人/生态拆分会不准确。",
  },
  cmc_missing: {
    title: "缺少 CMC 链接映射",
    meaning: "token_profiles 里没有 CoinMarketCap ID，前端无法稳定跳转到 CMC。",
  },
  cmc_unverified: {
    title: "CMC 映射未校验",
    meaning: "已经有 CoinMarketCap ID，但还没有标记为 verified，可能仍然存在误匹配风险。",
  },
  team_missing: {
    title: "缺少团队数据",
    meaning: "token_team_members 里没有团队成员数据。",
  },
  funding_missing: {
    title: "缺少融资数据",
    meaning: "token_funding_rounds 里没有融资轮次数据。",
  },
  x_missing: {
    title: "缺少 X/Twitter 链接",
    meaning: "token_socials 里没有官方 X/Twitter 链接。",
  },
  depth_trend_missing: {
    title: "完全缺少深度趋势图数据",
    meaning: "这个代币在纳入范围的交易所里，一条 depth daily 趋势数据都没有。",
  },
  depth_trend_exchange_missing: {
    title: "部分交易所缺少深度趋势图数据",
    meaning: "这个代币在某些交易所有交易对，但 token_trade_depth_daily 没有对应趋势数据。",
  },
  depth_trend_stale: {
    title: "深度趋势图数据未更新",
    meaning: "有深度趋势图，但最近更新时间太旧，趋势图会落后。",
  },
  depth_detail_missing: {
    title: "缺少深度明细数据",
    meaning: "最近检查窗口内，这个代币在对应交易所没有小时级深度明细 snapshot。",
  },
  depth_detail_stale: {
    title: "深度明细数据未更新",
    meaning: "小时级深度明细存在，但最新快照太旧。",
  },
  depth_detail_sparse: {
    title: "深度明细数据稀疏",
    meaning: "应该每小时都有数据，但实际缺口较多，明细时间轴不连续。",
  },
  depth_detail_null_values: {
    title: "深度明细存在空值",
    meaning: "小时级深度明细里有买深度或卖深度为空。",
  },
  depth_detail_negative_values: {
    title: "深度明细存在负值",
    meaning: "小时级深度明细里出现负的深度值，属于明显异常数据。",
  },
  depth_detail_gaps: {
    title: "深度明细中间断点",
    meaning: "按 1 小时频率看，中间存在缺失时间点。",
  },
  depth_detail_stuck: {
    title: "深度明细长时间不变",
    meaning: "连续多个小时深度值几乎完全一样，疑似采集卡住或重复写入。",
  },
  perps_history_missing: {
    title: "完全缺少合约 OI/Funding 历史",
    meaning: "代币已经纳入合约交易所范围，但 funding_rate_daily 完全没有历史行。",
  },
  perps_detail_missing: {
    title: "缺少合约 OI/Funding 明细",
    meaning: "最近检查窗口内，对应合约交易所没有小时级 OI/Funding 明细。",
  },
  perps_detail_stale: {
    title: "合约 OI/Funding 明细未更新",
    meaning: "合约明细存在，但最新快照太旧。",
  },
  perps_detail_sparse: {
    title: "合约 OI/Funding 明细稀疏",
    meaning: "按小时应该连续的数据存在较多缺口。",
  },
  perps_detail_gaps: {
    title: "合约 OI/Funding 中间断点",
    meaning: "合约 OI/Funding 时间序列中间有缺失时间点。",
  },
  perps_detail_stuck: {
    title: "合约 OI/Funding 长时间不变",
    meaning: "连续多个小时 funding_rate 和 open_interest 基本不变，疑似卡住。",
  },
  funding_rate_null_values: {
    title: "Funding Rate 有空值",
    meaning: "funding_rate_daily 有记录，但 funding_rate 字段为空。",
  },
  open_interest_null_values: {
    title: "Open Interest 有空值",
    meaning: "funding_rate_daily 有记录，但 open_interest 字段为空。",
  },
  open_interest_negative_values: {
    title: "Open Interest 出现负值",
    meaning: "open_interest 理论上不应该为负数，属于明显异常。",
  },
  funding_rate_out_of_range: {
    title: "Funding Rate 数值异常",
    meaning: "funding_rate 出现极端异常值，超过正常波动范围。",
  },
  perps_current_summary_missing: {
    title: "当前合约汇总字段缺失",
    meaning: "exchange_pairs 里当前 funding_rate 和 open_interest 都为空，页面摘要会缺字段。",
  },
  exchange_pair_missing: {
    title: "交易所覆盖了但缺少交易对记录",
    meaning: "这个代币已经纳入检查范围，但对应交易所在 exchange_pairs 里没有交易对记录。",
  },
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    historyDays: 1,
    outputDir: path.resolve(process.cwd(), "reports", "data-checks"),
    failOnHigh: false,
  };

  for (const arg of argv) {
    if (arg.startsWith("--days=")) {
      const value = Number(arg.slice("--days=".length));
      if (Number.isFinite(value) && value >= 1 && value <= 30) {
        options.historyDays = Math.floor(value);
      }
    } else if (arg.startsWith("--output-dir=")) {
      const value = arg.slice("--output-dir=".length).trim();
      if (value) {
        options.outputDir = path.resolve(process.cwd(), value);
      }
    } else if (arg === "--fail-on-high") {
      options.failOnHigh = true;
    }
  }

  return options;
}

function mustGetEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function formatPct(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(digits)}%`;
}

function formatHours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "n/a";
  return `${value.toFixed(1)}h`;
}

function formatDate(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return "n/a";
  return value.toISOString().replace(".000Z", "Z");
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function hoursBetween(older: Date | null, newer: Date): number | null {
  if (!older) return null;
  return (newer.getTime() - older.getTime()) / 3_600_000;
}

function expectedHourlyPoints(minTs: Date | null, maxTs: Date | null): number | null {
  if (!minTs || !maxTs) return null;
  const diffHours = Math.round((maxTs.getTime() - minTs.getTime()) / 3_600_000);
  return diffHours >= 0 ? diffHours + 1 : null;
}

function buildInClause(values: readonly number[]): { placeholders: string; params: number[] } {
  if (values.length === 0) {
    throw new Error("Cannot build IN clause for empty values");
  }
  return {
    placeholders: values.map(() => "?").join(", "),
    params: [...values],
  };
}

function addIssue(issues: Issue[], issue: Issue) {
  issues.push(issue);
}

function getSeverityRank(severity: Severity): number {
  if (severity === "high") return 0;
  if (severity === "medium") return 1;
  return 2;
}

function getSeverityLabel(severity: Severity) {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  return "低";
}

function getCategoryMeta(category: string): CategoryMeta {
  return (
    CATEGORY_META[category] ?? {
      title: category,
      meaning: "未配置中文说明的问题类型。",
    }
  );
}

function formatTokenLabel(issue: Pick<Issue, "symbol" | "tokenName" | "tokenId">) {
  return `${issue.symbol} (${issue.tokenName}, #${issue.tokenId})`;
}

function formatTokenSummaryLabel(issue: Pick<Issue, "symbol" | "tokenId">) {
  return `${issue.symbol}(#${issue.tokenId})`;
}

function formatMetrics(metrics?: Record<string, unknown>) {
  if (!metrics) return "";
  const entries = Object.entries(metrics).filter(([, value]) => value != null && value !== "");
  if (entries.length === 0) return "";
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(", ");
}

function buildDisplayedTokenScopeSql(tokenPlaceholders: string) {
  return `
    SELECT DISTINCT tp.id AS tokenId
    FROM token_profiles tp
    INNER JOIN (
      SELECT DISTINCT el.token_id AS token_id
      FROM exchange_listings el
      LEFT JOIN exchange_platforms ep ON ep.id = el.exchange_id
      WHERE ep.market_type NOT IN ('tradfi', 'onchain')
    ) listingAgg ON listingAgg.token_id = tp.id
    WHERE tp.id IN (${tokenPlaceholders})
      AND COALESCE(tp.coin_tags, '') NOT LIKE '%STOCK%'
      AND COALESCE(tp.coin_tags, '') NOT LIKE '%LEVSP%'
      AND EXISTS (
        SELECT 1
        FROM exchange_listings el_visible
        JOIN exchange_platforms ep_visible ON ep_visible.id = el_visible.exchange_id
        WHERE el_visible.token_id = tp.id
          AND ep_visible.market_type NOT IN ('tradfi', 'onchain')
          AND ep_visible.name NOT IN ('Gate Alpha', 'KuCoin Alpha')
      )
  `;
}

function summarizeHourlySeries<
  T extends {
    snapshotTs: string;
    primary: number | null;
    secondary: number | null;
  },
>(rows: T[]) {
  const sortedRows = [...rows].sort(
    (left, right) => new Date(left.snapshotTs).getTime() - new Date(right.snapshotTs).getTime()
  );
  let maxGapMinutes: number | null = null;
  let gapCountOverThreshold = 0;
  let sameValueTransitions = 0;

  for (let index = 1; index < sortedRows.length; index += 1) {
    const previous = sortedRows[index - 1];
    const current = sortedRows[index];
    const previousTs = new Date(previous.snapshotTs).getTime();
    const currentTs = new Date(current.snapshotTs).getTime();
    const gapMinutes = Math.round((currentTs - previousTs) / 60_000);

    if (Number.isFinite(gapMinutes)) {
      maxGapMinutes = maxGapMinutes == null ? gapMinutes : Math.max(maxGapMinutes, gapMinutes);
      if (gapMinutes > HOURLY_GAP_THRESHOLD_MINUTES) {
        gapCountOverThreshold += 1;
      }
    }

    if (previous.primary === current.primary && previous.secondary === current.secondary) {
      sameValueTransitions += 1;
    }
  }

  return {
    maxGapMinutes,
    gapCountOverThreshold,
    sameValueTransitions,
  };
}

async function queryRowsByExchange<T extends RowDataPacket>(
  connection: Awaited<ReturnType<typeof createConnection>>,
  sqlFactory: (exchangePlaceholders: string, tokenPlaceholders: string) => string,
  exchangeIds: readonly number[],
  tokenIds: readonly number[],
  cutoff: Date
) {
  const tokenClause = buildInClause(tokenIds);
  const results: T[] = [];

  for (const exchangeId of exchangeIds) {
    const [rows] = await connection.query<T[]>(
      sqlFactory("?", tokenClause.placeholders),
      [exchangeId, ...tokenClause.params, cutoff]
    );
    results.push(...rows);
  }

  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const databaseUrl = mustGetEnv("DATABASE_URL");
  const database = new URL(databaseUrl);
  const connection = await createConnection({
    host: database.hostname,
    port: Number(database.port || 3306),
    user: decodeURIComponent(database.username),
    password: decodeURIComponent(database.password),
    database: database.pathname.replace(/^\//, ""),
    charset: database.searchParams.get("charset") ?? "utf8mb4",
    dateStrings: true,
  });

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - options.historyDays * 24 * 3_600_000);
    const exchangeClause = buildInClause(TARGET_EXCHANGE_IDS);

    const [coverageRows] = await connection.query<CoverageRow[]>(
      `
        SELECT
          scope.token_id AS tokenId,
          scope.exchange_id AS exchangeId,
          ep.name AS exchangeName,
          ep.market_type AS marketType,
          COALESCE(listing_agg.listing_count, 0) AS listingCount,
          COALESCE(pair_agg.pair_count, 0) AS pairCount,
          pair_agg.pair_names AS pairNames,
          COALESCE(pair_agg.has_current_funding_rate, 0) AS hasCurrentFundingRate,
          COALESCE(pair_agg.has_current_open_interest, 0) AS hasCurrentOpenInterest
        FROM (
          SELECT token_id, exchange_id
          FROM exchange_listings
          WHERE token_id IS NOT NULL
            AND exchange_id IN (${exchangeClause.placeholders})
          UNION
          SELECT token_id, exchange_id
          FROM exchange_pairs
          WHERE token_id IS NOT NULL
            AND exchange_id IN (${exchangeClause.placeholders})
        ) scope
        JOIN exchange_platforms ep
          ON ep.id = scope.exchange_id
        LEFT JOIN (
          SELECT token_id, exchange_id, COUNT(*) AS listing_count
          FROM exchange_listings
          WHERE token_id IS NOT NULL
            AND exchange_id IN (${exchangeClause.placeholders})
          GROUP BY token_id, exchange_id
        ) listing_agg
          ON listing_agg.token_id = scope.token_id
         AND listing_agg.exchange_id = scope.exchange_id
        LEFT JOIN (
          SELECT
            token_id,
            exchange_id,
            COUNT(*) AS pair_count,
            GROUP_CONCAT(DISTINCT pair_name ORDER BY pair_name SEPARATOR ' | ') AS pair_names,
            MAX(CASE WHEN funding_rate IS NOT NULL THEN 1 ELSE 0 END) AS has_current_funding_rate,
            MAX(CASE WHEN open_interest IS NOT NULL THEN 1 ELSE 0 END) AS has_current_open_interest
          FROM exchange_pairs
          WHERE token_id IS NOT NULL
            AND exchange_id IN (${exchangeClause.placeholders})
          GROUP BY token_id, exchange_id
        ) pair_agg
          ON pair_agg.token_id = scope.token_id
         AND pair_agg.exchange_id = scope.exchange_id
        ORDER BY scope.token_id ASC, scope.exchange_id ASC
      `,
      [
        ...exchangeClause.params,
        ...exchangeClause.params,
        ...exchangeClause.params,
        ...exchangeClause.params,
      ]
    );

    if (coverageRows.length === 0) {
      throw new Error("No scoped tokens were found for the target exchanges");
    }

    const initiallyScopedTokenIds = [...new Set(coverageRows.map(row => row.tokenId))];
    const initialTokenClause = buildInClause(initiallyScopedTokenIds);
    const [displayedTokenRows] = await connection.query<(RowDataPacket & { tokenId: number })[]>(
      buildDisplayedTokenScopeSql(initialTokenClause.placeholders),
      initialTokenClause.params
    );

    const displayedTokenIdSet = new Set(displayedTokenRows.map(row => Number(row.tokenId)));
    const filteredCoverageRows = coverageRows.filter(row => displayedTokenIdSet.has(Number(row.tokenId)));

    if (filteredCoverageRows.length === 0) {
      throw new Error("No tokens remained after applying the visible market-list token filter");
    }

    const scopedTokenIds = [...new Set(filteredCoverageRows.map(row => row.tokenId))];
    const tokenClause = buildInClause(scopedTokenIds);

    const [profileRows] = await connection.query<TokenProfileRow[]>(
      `
        SELECT
          id,
          slug,
          symbol,
          name,
          coin_market_cap_id AS coinMarketCapId,
          coin_market_cap_id_verify AS coinMarketCapIdVerify,
          total_supply AS totalSupply
        FROM token_profiles
        WHERE id IN (${tokenClause.placeholders})
      `,
      tokenClause.params
    );

    const [unlockRows] = await connection.query<UnlockAggregateRow[]>(
      `
        SELECT
          token_id AS tokenId,
          COUNT(*) AS unlockRowCount,
          SUM(unlock_amount) AS unlockAmountSum,
          SUM(COALESCE(percentage_of_total_supply, 0)) AS unlockPctSum,
          SUM(CASE WHEN percentage_of_total_supply IS NULL THEN 1 ELSE 0 END) AS unlockPctNullCount,
          SUM(CASE WHEN recipient_category IS NULL OR TRIM(recipient_category) = '' THEN 1 ELSE 0 END) AS emptyRecipientCount
        FROM token_unlocks
        WHERE token_id IN (${tokenClause.placeholders})
        GROUP BY token_id
      `,
      tokenClause.params
    );

    const [teamRows] = await connection.query<TeamAggregateRow[]>(
      `
        SELECT token_id AS tokenId, COUNT(*) AS teamMemberCount
        FROM token_team_members
        WHERE token_id IN (${tokenClause.placeholders})
        GROUP BY token_id
      `,
      tokenClause.params
    );

    const [fundingRows] = await connection.query<FundingAggregateRow[]>(
      `
        SELECT token_id AS tokenId, COUNT(*) AS fundingRoundCount
        FROM token_funding_rounds
        WHERE token_id IN (${tokenClause.placeholders})
        GROUP BY token_id
      `,
      tokenClause.params
    );

    const [socialRows] = await connection.query<SocialAggregateRow[]>(
      `
        SELECT
          token_id AS tokenId,
          SUM(CASE WHEN platform = 'twitter' THEN 1 ELSE 0 END) AS twitterLinkCount,
          MAX(CASE WHEN platform = 'twitter' THEN url ELSE NULL END) AS twitterUrl
        FROM token_socials
        WHERE token_id IN (${tokenClause.placeholders})
        GROUP BY token_id
      `,
      tokenClause.params
    );

    const [depthDailyRows] = await connection.query<HistorySummaryRow[]>(
      `
        SELECT
          token_id AS tokenId,
          exchange_id AS exchangeId,
          COUNT(*) AS rowCount,
          MIN(snapshot_ts) AS minTs,
          MAX(snapshot_ts) AS maxTs,
          SUM(CASE WHEN bid_amt IS NULL THEN 1 ELSE 0 END) AS nullPrimaryCount,
          SUM(CASE WHEN ask_amt IS NULL THEN 1 ELSE 0 END) AS nullSecondaryCount,
          SUM(CASE WHEN bid_amt < 0 THEN 1 ELSE 0 END) AS negativePrimaryCount,
          SUM(CASE WHEN ask_amt < 0 THEN 1 ELSE 0 END) AS negativeSecondaryCount
        FROM token_trade_depth_daily
        WHERE token_id IN (${tokenClause.placeholders})
          AND exchange_id IN (${exchangeClause.placeholders})
        GROUP BY token_id, exchange_id
      `,
      [...tokenClause.params, ...exchangeClause.params]
    );

    const [depthSnapshotRows] = await connection.query<HistorySummaryRow[]>(
      `
        SELECT
          token_id AS tokenId,
          exchange_id AS exchangeId,
          COUNT(*) AS rowCount,
          MIN(snapshot_ts) AS minTs,
          MAX(snapshot_ts) AS maxTs,
          SUM(CASE WHEN depth_buy_2 IS NULL THEN 1 ELSE 0 END) AS nullPrimaryCount,
          SUM(CASE WHEN depth_sell_2 IS NULL THEN 1 ELSE 0 END) AS nullSecondaryCount,
          SUM(CASE WHEN depth_buy_2 < 0 THEN 1 ELSE 0 END) AS negativePrimaryCount,
          SUM(CASE WHEN depth_sell_2 < 0 THEN 1 ELSE 0 END) AS negativeSecondaryCount
        FROM token_trade_depth_snapshot
        WHERE token_id IN (${tokenClause.placeholders})
          AND exchange_id IN (${exchangeClause.placeholders})
          AND snapshot_ts >= ?
        GROUP BY token_id, exchange_id
      `,
      [...tokenClause.params, ...exchangeClause.params, cutoff]
    );

    const rawDepthSnapshotRows = await queryRowsByExchange<RawDepthSnapshotRow>(
      connection,
      (exchangePlaceholder, tokenPlaceholders) => `
        SELECT
          token_id AS tokenId,
          exchange_id AS exchangeId,
          snapshot_ts AS snapshotTs,
          depth_buy_2 AS buyDepth,
          depth_sell_2 AS sellDepth
        FROM token_trade_depth_snapshot
        WHERE exchange_id = ${exchangePlaceholder}
          AND token_id IN (${tokenPlaceholders})
          AND snapshot_ts >= ?
      `,
      TARGET_EXCHANGE_IDS,
      scopedTokenIds,
      cutoff
    );

    const [fundingHistoryRows] = await connection.query<HistorySummaryRow[]>(
      `
        SELECT
          token_id AS tokenId,
          exchange_id AS exchangeId,
          COUNT(*) AS rowCount,
          MIN(snapshot_ts) AS minTs,
          MAX(snapshot_ts) AS maxTs,
          SUM(CASE WHEN funding_rate IS NULL THEN 1 ELSE 0 END) AS nullPrimaryCount,
          SUM(CASE WHEN open_interest IS NULL THEN 1 ELSE 0 END) AS nullSecondaryCount,
          SUM(CASE WHEN funding_rate < -0.05 THEN 1 ELSE 0 END) AS negativePrimaryCount,
          SUM(CASE WHEN open_interest < 0 THEN 1 ELSE 0 END) AS negativeSecondaryCount
        FROM funding_rate_daily
        WHERE token_id IN (${tokenClause.placeholders})
          AND exchange_id IN (${exchangeClause.placeholders})
          AND snapshot_ts >= ?
        GROUP BY token_id, exchange_id
      `,
      [...tokenClause.params, ...exchangeClause.params, cutoff]
    );

    const rawFundingHistoryRows = await queryRowsByExchange<RawFundingHistoryRow>(
      connection,
      (exchangePlaceholder, tokenPlaceholders) => `
        SELECT
          token_id AS tokenId,
          exchange_id AS exchangeId,
          snapshot_ts AS snapshotTs,
          funding_rate AS fundingRate,
          open_interest AS openInterest
        FROM funding_rate_daily
        WHERE exchange_id = ${exchangePlaceholder}
          AND token_id IN (${tokenPlaceholders})
          AND snapshot_ts >= ?
      `,
      TARGET_EXCHANGE_IDS,
      scopedTokenIds,
      cutoff
    );

    const profileById = new Map(profileRows.map(row => [row.id, row]));
    const unlockByTokenId = new Map(unlockRows.map(row => [row.tokenId, row]));
    const teamByTokenId = new Map(teamRows.map(row => [row.tokenId, row]));
    const fundingByTokenId = new Map(fundingRows.map(row => [row.tokenId, row]));
    const socialByTokenId = new Map(socialRows.map(row => [row.tokenId, row]));
    const depthDailyByPair = new Map(depthDailyRows.map(row => [`${row.tokenId}:${row.exchangeId}`, row]));
    const depthSnapshotByPair = new Map(depthSnapshotRows.map(row => [`${row.tokenId}:${row.exchangeId}`, row]));
    const groupedDepthRows = new Map<string, RawDepthSnapshotRow[]>();
    for (const row of rawDepthSnapshotRows) {
      const key = `${row.tokenId}:${row.exchangeId}`;
      const current = groupedDepthRows.get(key) ?? [];
      current.push(row);
      groupedDepthRows.set(key, current);
    }
    const depthGapByPair = new Map<string, GapSummaryRow>();
    for (const [key, rows] of groupedDepthRows.entries()) {
      const [tokenIdText, exchangeIdText] = key.split(":");
      const tokenId = Number(tokenIdText);
      const exchangeId = Number(exchangeIdText);
      const summary = summarizeHourlySeries(
        rows.map(row => ({
          snapshotTs: row.snapshotTs,
          primary: row.buyDepth,
          secondary: row.sellDepth,
        }))
      );
      const outlierPrimaryCount = rows.filter(row => (row.buyDepth ?? 0) > 1000000000).length;
      const outlierSecondaryCount = rows.filter(row => (row.sellDepth ?? 0) > 1000000000).length;
      depthGapByPair.set(key, {
        tokenId,
        exchangeId,
        maxGapMinutes: summary.maxGapMinutes,
        gapCountOverThreshold: summary.gapCountOverThreshold,
        sameValueTransitions: summary.sameValueTransitions,
        outlierPrimaryCount,
        outlierSecondaryCount,
      } as GapSummaryRow);
    }
    const fundingHistoryByPair = new Map(fundingHistoryRows.map(row => [`${row.tokenId}:${row.exchangeId}`, row]));
    const groupedFundingRows = new Map<string, RawFundingHistoryRow[]>();
    for (const row of rawFundingHistoryRows) {
      const key = `${row.tokenId}:${row.exchangeId}`;
      const current = groupedFundingRows.get(key) ?? [];
      current.push(row);
      groupedFundingRows.set(key, current);
    }
    const fundingGapByPair = new Map<string, GapSummaryRow>();
    for (const [key, rows] of groupedFundingRows.entries()) {
      const [tokenIdText, exchangeIdText] = key.split(":");
      const tokenId = Number(tokenIdText);
      const exchangeId = Number(exchangeIdText);
      const summary = summarizeHourlySeries(
        rows.map(row => ({
          snapshotTs: row.snapshotTs,
          primary: row.fundingRate,
          secondary: row.openInterest,
        }))
      );
      const outlierPrimaryCount = rows.filter(row => Math.abs(row.fundingRate ?? 0) > 0.05).length;
      const outlierSecondaryCount = rows.filter(row => (row.openInterest ?? 0) > 100000000000).length;
      fundingGapByPair.set(key, {
        tokenId,
        exchangeId,
        maxGapMinutes: summary.maxGapMinutes,
        gapCountOverThreshold: summary.gapCountOverThreshold,
        sameValueTransitions: summary.sameValueTransitions,
        outlierPrimaryCount,
        outlierSecondaryCount,
      } as GapSummaryRow);
    }

    const scopeTokens = new Map<number, ScopeToken>();
    for (const coverage of filteredCoverageRows) {
      const profile = profileById.get(coverage.tokenId);
      if (!profile) continue;
      const current = scopeTokens.get(coverage.tokenId) ?? {
        tokenId: coverage.tokenId,
        slug: profile.slug,
        symbol: profile.symbol,
        tokenName: profile.name,
        coinMarketCapId: profile.coinMarketCapId,
        coinMarketCapIdVerify: profile.coinMarketCapIdVerify,
        totalSupply: profile.totalSupply,
        exchanges: [],
      };
      current.exchanges.push(coverage);
      scopeTokens.set(coverage.tokenId, current);
    }

    const issues: Issue[] = [];

    for (const token of scopeTokens.values()) {
      const unlock = unlockByTokenId.get(token.tokenId);
      const team = teamByTokenId.get(token.tokenId);
      const funding = fundingByTokenId.get(token.tokenId);
      const social = socialByTokenId.get(token.tokenId);

      if (!unlock || unlock.unlockRowCount === 0) {
        addIssue(issues, {
          severity: "high",
          category: "unlock_missing",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "Missing token unlock schedule rows.",
        });
      } else {
        const unlockPctFromRows =
          unlock.unlockPctNullCount === 0 ? Number(unlock.unlockPctSum ?? 0) : null;
        const unlockPctFromAmount =
          token.totalSupply && token.totalSupply > 0 && unlock.unlockAmountSum != null
            ? (Number(unlock.unlockAmountSum) / Number(token.totalSupply)) * 100
            : null;
        const basisPct = unlockPctFromRows ?? unlockPctFromAmount;

        if (basisPct == null) {
          addIssue(issues, {
            severity: "medium",
            category: "unlock_not_verifiable",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            message: "Unlock rows exist, but total cannot be verified against percentage or total supply.",
            metrics: {
              unlockRowCount: unlock.unlockRowCount,
              unlockPctNullCount: unlock.unlockPctNullCount,
              totalSupply: token.totalSupply,
            },
          });
        } else if (Math.abs(basisPct - 100) > UNLOCK_TOLERANCE_PCT) {
          addIssue(issues, {
            severity: "high",
            category: "unlock_total_not_100",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            message: "Unlock total does not reconcile to 100% within tolerance.",
            metrics: {
              checkedPercentage: Number(basisPct.toFixed(4)),
              rowPercentageSum: unlockPctFromRows,
              amountDerivedPercentage: unlockPctFromAmount,
              totalSupply: token.totalSupply,
            },
          });
        }

        if (
          unlockPctFromRows != null &&
          unlockPctFromAmount != null &&
          Math.abs(unlockPctFromRows - unlockPctFromAmount) > 1
        ) {
          addIssue(issues, {
            severity: "medium",
            category: "unlock_percentage_inconsistent",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            message: "Unlock percentage columns and unlock amount derived percentage diverge materially.",
            metrics: {
              rowPercentageSum: Number(unlockPctFromRows.toFixed(4)),
              amountDerivedPercentage: Number(unlockPctFromAmount.toFixed(4)),
            },
          });
        }

        if (Number(unlock.emptyRecipientCount ?? 0) > 0) {
          addIssue(issues, {
            severity: "low",
            category: "unlock_category_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            message: "Some unlock rows are missing recipient categories.",
            metrics: {
              emptyRecipientCount: unlock.emptyRecipientCount,
            },
          });
        }
      }

      if (!token.coinMarketCapId) {
        addIssue(issues, {
          severity: "high",
          category: "cmc_missing",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "Missing CoinMarketCap mapping id.",
        });
      } else if (token.coinMarketCapIdVerify !== 1) {
        addIssue(issues, {
          severity: "medium",
          category: "cmc_unverified",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "CoinMarketCap mapping exists but is not marked verified.",
          metrics: {
            coinMarketCapId: token.coinMarketCapId,
            verifyStatus: token.coinMarketCapIdVerify,
          },
        });
      }

      if (!team || team.teamMemberCount === 0) {
        addIssue(issues, {
          severity: "medium",
          category: "team_missing",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "Missing team member data.",
        });
      }

      if (!funding || funding.fundingRoundCount === 0) {
        addIssue(issues, {
          severity: "medium",
          category: "funding_missing",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "Missing funding rounds data.",
        });
      }

      if (!social || Number(social.twitterLinkCount ?? 0) === 0) {
        addIssue(issues, {
          severity: "medium",
          category: "x_missing",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "Missing official X/Twitter link in token_socials.",
        });
      }

      const hasAnyDepthTrend = token.exchanges.some(exchange =>
        depthDailyByPair.has(`${token.tokenId}:${exchange.exchangeId}`)
      );

      if (!hasAnyDepthTrend) {
        addIssue(issues, {
          severity: "high",
          category: "depth_trend_missing",
          tokenId: token.tokenId,
          symbol: token.symbol,
          tokenName: token.tokenName,
          message: "No depth trend rows were found for any scoped exchange.",
        });
      }

      const perpsExchanges = token.exchanges.filter(
        exchange =>
          exchange.marketType === "perps" &&
          (exchange.exchangeId === 10 || exchange.exchangeId === 16)
      );
      if (perpsExchanges.length > 0) {
        const hasAnyFundingHistory = perpsExchanges.some(exchange =>
          fundingHistoryByPair.has(`${token.tokenId}:${exchange.exchangeId}`)
        );
        if (!hasAnyFundingHistory) {
          addIssue(issues, {
            severity: "high",
            category: "perps_history_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            message: "Token is in scoped perps exchanges but has no funding/OI history rows.",
          });
        }
      }

      for (const exchange of token.exchanges) {
        const pairKey = `${token.tokenId}:${exchange.exchangeId}`;

        if (exchange.pairCount === 0) {
          addIssue(issues, {
            severity: "high",
            category: "exchange_pair_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Covered exchange has no exchange_pairs row for this token.",
            metrics: {
              listingCount: exchange.listingCount,
            },
          });
          continue;
        }

        const depthDaily = depthDailyByPair.get(pairKey);
        if (!depthDaily) {
          addIssue(issues, {
            severity: "medium",
            category: "depth_trend_exchange_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Exchange pair exists, but no depth trend rows were found in token_trade_depth_daily.",
            metrics: {
              pairNames: exchange.pairNames,
            },
          });
        } else {
          const latestDailyTs = toDate(depthDaily.maxTs);
          const staleHours = hoursBetween(latestDailyTs, now);
          if (staleHours != null && staleHours > DAILY_STALE_HOURS) {
            addIssue(issues, {
              severity: "medium",
              category: "depth_trend_stale",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Depth trend data exists but has not updated recently.",
              metrics: {
                latestSnapshot: formatDate(latestDailyTs),
                staleHours: Number(staleHours.toFixed(1)),
              },
            });
          }
        }

        const depthSnapshot = depthSnapshotByPair.get(pairKey);
        const depthGap = depthGapByPair.get(pairKey);
        if (!depthSnapshot) {
          addIssue(issues, {
            severity: "high",
            category: "depth_detail_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: `No hourly depth detail rows found in the last ${options.historyDays} days.`,
            metrics: {
              pairNames: exchange.pairNames,
            },
          });
        } else {
          const minTs = toDate(depthSnapshot.minTs);
          const maxTs = toDate(depthSnapshot.maxTs);
          const latestHours = hoursBetween(maxTs, now);
          const expectedRows = expectedHourlyPoints(minTs, maxTs);
          const completenessRatio =
            expectedRows && expectedRows > 0 ? depthSnapshot.rowCount / expectedRows : null;

          if (latestHours != null && latestHours > HOURLY_STALE_HOURS) {
            addIssue(issues, {
              severity: "medium",
              category: "depth_detail_stale",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Hourly depth detail exists but the latest snapshot is stale.",
              metrics: {
                latestSnapshot: formatDate(maxTs),
                staleHours: Number(latestHours.toFixed(1)),
              },
            });
          }

          if (completenessRatio != null && completenessRatio < 0.9) {
            addIssue(issues, {
              severity: "medium",
              category: "depth_detail_sparse",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Hourly depth detail coverage is sparse within the observed window.",
              metrics: {
                rowCount: depthSnapshot.rowCount,
                expectedRows,
                completenessRatio: Number(completenessRatio.toFixed(4)),
                from: formatDate(minTs),
                to: formatDate(maxTs),
              },
            });
          }

          if (Number(depthSnapshot.nullPrimaryCount ?? 0) > 0 || Number(depthSnapshot.nullSecondaryCount ?? 0) > 0) {
            addIssue(issues, {
              severity: "medium",
              category: "depth_detail_null_values",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Hourly depth detail contains null buy/sell depth values.",
              metrics: {
                nullBuyRows: depthSnapshot.nullPrimaryCount,
                nullSellRows: depthSnapshot.nullSecondaryCount,
              },
            });
          }

          if (Number(depthSnapshot.negativePrimaryCount ?? 0) > 0 || Number(depthSnapshot.negativeSecondaryCount ?? 0) > 0) {
            addIssue(issues, {
              severity: "high",
              category: "depth_detail_negative_values",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Hourly depth detail contains negative depth values.",
              metrics: {
                negativeBuyRows: depthSnapshot.negativePrimaryCount,
                negativeSellRows: depthSnapshot.negativeSecondaryCount,
              },
            });
          }

          if (depthGap) {
            if (Number(depthGap.gapCountOverThreshold ?? 0) > 0) {
              addIssue(issues, {
                severity: "medium",
                category: "depth_detail_gaps",
                tokenId: token.tokenId,
                symbol: token.symbol,
                tokenName: token.tokenName,
                exchangeId: exchange.exchangeId,
                exchangeName: exchange.exchangeName,
                marketType: exchange.marketType,
                message: "Hourly depth detail has missing time buckets.",
                metrics: {
                  gapCountOverThreshold: depthGap.gapCountOverThreshold,
                  maxGapMinutes: depthGap.maxGapMinutes,
                },
              });
            }

            const transitionCount = Math.max(depthSnapshot.rowCount - 1, 0);
            const staleRatio =
              transitionCount > 0 ? Number(depthGap.sameValueTransitions ?? 0) / transitionCount : null;
            if (
              depthSnapshot.rowCount >= MIN_STALE_SAMPLE_COUNT &&
              staleRatio != null &&
              staleRatio >= STALE_RATIO_THRESHOLD
            ) {
              addIssue(issues, {
                severity: "medium",
                category: "depth_detail_stuck",
                tokenId: token.tokenId,
                symbol: token.symbol,
                tokenName: token.tokenName,
                exchangeId: exchange.exchangeId,
                exchangeName: exchange.exchangeName,
                marketType: exchange.marketType,
                message: "Hourly depth detail appears frozen or nearly unchanged for most recent points.",
                metrics: {
                  rowCount: depthSnapshot.rowCount,
                  staleRatio: Number(staleRatio.toFixed(4)),
                },
              });
            }
          }
        }

        if (exchange.marketType !== "perps") {
          continue;
        }

        const fundingHistory = fundingHistoryByPair.get(pairKey);
        const fundingGap = fundingGapByPair.get(pairKey);

        if (!fundingHistory) {
          addIssue(issues, {
            severity: "high",
            category: "perps_detail_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: `No funding/OI detail rows found in the last ${options.historyDays} days.`,
            metrics: {
              pairNames: exchange.pairNames,
            },
          });
          continue;
        }

        const minTs = toDate(fundingHistory.minTs);
        const maxTs = toDate(fundingHistory.maxTs);
        const latestHours = hoursBetween(maxTs, now);
        const expectedRows = expectedHourlyPoints(minTs, maxTs);
        const completenessRatio =
          expectedRows && expectedRows > 0 ? fundingHistory.rowCount / expectedRows : null;

        if (latestHours != null && latestHours > HOURLY_STALE_HOURS) {
          addIssue(issues, {
            severity: "medium",
            category: "perps_detail_stale",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Funding/OI detail exists but the latest snapshot is stale.",
            metrics: {
              latestSnapshot: formatDate(maxTs),
              staleHours: Number(latestHours.toFixed(1)),
            },
          });
        }

        if (completenessRatio != null && completenessRatio < 0.9) {
          addIssue(issues, {
            severity: "medium",
            category: "perps_detail_sparse",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Funding/OI detail coverage is sparse within the observed window.",
            metrics: {
              rowCount: fundingHistory.rowCount,
              expectedRows,
              completenessRatio: Number(completenessRatio.toFixed(4)),
              from: formatDate(minTs),
              to: formatDate(maxTs),
            },
          });
        }

        if (Number(fundingHistory.nullPrimaryCount ?? 0) > 0) {
          addIssue(issues, {
            severity: "medium",
            category: "funding_rate_null_values",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Funding history contains null funding_rate values.",
            metrics: {
              nullFundingRateRows: fundingHistory.nullPrimaryCount,
            },
          });
        }

        if (Number(fundingHistory.nullSecondaryCount ?? 0) > 0) {
          addIssue(issues, {
            severity: "medium",
            category: "open_interest_null_values",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Funding history contains null open_interest values.",
            metrics: {
              nullOpenInterestRows: fundingHistory.nullSecondaryCount,
            },
          });
        }

        if (Number(fundingHistory.negativeSecondaryCount ?? 0) > 0) {
          addIssue(issues, {
            severity: "high",
            category: "open_interest_negative_values",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Funding history contains negative open_interest values.",
            metrics: {
              negativeOpenInterestRows: fundingHistory.negativeSecondaryCount,
            },
          });
        }

        if (Number(fundingHistory.negativePrimaryCount ?? 0) > 0) {
          addIssue(issues, {
            severity: "medium",
            category: "funding_rate_out_of_range",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Funding history contains extremely negative funding_rate values.",
            metrics: {
              outOfRangeRows: fundingHistory.negativePrimaryCount,
            },
          });
        }

        if (fundingGap) {
          if (Number(fundingGap.gapCountOverThreshold ?? 0) > 0) {
            addIssue(issues, {
              severity: "medium",
              category: "perps_detail_gaps",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Funding/OI detail has missing time buckets.",
              metrics: {
                gapCountOverThreshold: fundingGap.gapCountOverThreshold,
                maxGapMinutes: fundingGap.maxGapMinutes,
              },
            });
          }

          const transitionCount = Math.max(fundingHistory.rowCount - 1, 0);
          const staleRatio =
            transitionCount > 0 ? Number(fundingGap.sameValueTransitions ?? 0) / transitionCount : null;
          if (
            fundingHistory.rowCount >= MIN_STALE_SAMPLE_COUNT &&
            staleRatio != null &&
            staleRatio >= STALE_RATIO_THRESHOLD
          ) {
            addIssue(issues, {
              severity: "medium",
              category: "perps_detail_stuck",
              tokenId: token.tokenId,
              symbol: token.symbol,
              tokenName: token.tokenName,
              exchangeId: exchange.exchangeId,
              exchangeName: exchange.exchangeName,
              marketType: exchange.marketType,
              message: "Funding/OI detail appears frozen or nearly unchanged for most recent points.",
              metrics: {
                rowCount: fundingHistory.rowCount,
                staleRatio: Number(staleRatio.toFixed(4)),
              },
            });
          }
        }

        if (!exchange.hasCurrentFundingRate && !exchange.hasCurrentOpenInterest) {
          addIssue(issues, {
            severity: "medium",
            category: "perps_current_summary_missing",
            tokenId: token.tokenId,
            symbol: token.symbol,
            tokenName: token.tokenName,
            exchangeId: exchange.exchangeId,
            exchangeName: exchange.exchangeName,
            marketType: exchange.marketType,
            message: "Perps pair exists, but current funding_rate and open_interest are both absent in exchange_pairs.",
          });
        }
      }
    }

    issues.sort((left, right) => {
      const severityDiff = getSeverityRank(left.severity) - getSeverityRank(right.severity);
      if (severityDiff !== 0) return severityDiff;
      const symbolDiff = left.symbol.localeCompare(right.symbol);
      if (symbolDiff !== 0) return symbolDiff;
      const categoryDiff = left.category.localeCompare(right.category);
      if (categoryDiff !== 0) return categoryDiff;
      return (left.exchangeName ?? "").localeCompare(right.exchangeName ?? "");
    });

    const issuesByCategory = new Map<string, number>();
    const affectedTokens = new Set<number>();
    const highSeverityTokens = new Set<number>();

    for (const issue of issues) {
      issuesByCategory.set(issue.category, (issuesByCategory.get(issue.category) ?? 0) + 1);
      affectedTokens.add(issue.tokenId);
      if (issue.severity === "high") {
        highSeverityTokens.add(issue.tokenId);
      }
    }

    const summaryLines = [
      `Checked at: ${formatDate(now)}`,
      `Token scope: ${scopeTokens.size} tokens`,
      `Scoped exchanges: ${TARGET_EXCHANGES.map(exchange => exchange.name).join(", ")}`,
      `History window: last ${options.historyDays} days`,
      `Total issues: ${issues.length}`,
      `Affected tokens: ${affectedTokens.size}`,
      `High-severity affected tokens: ${highSeverityTokens.size}`,
    ];

    const sortedCategories = [...issuesByCategory.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0])
    );

    const categoryOverviewRows = sortedCategories.map(([category, count]) => {
      const meta = getCategoryMeta(category);
      const tokenLabels = [
        ...new Map(
          issues
            .filter(issue => issue.category === category)
            .map(issue => [issue.tokenId, formatTokenSummaryLabel(issue)])
        ).values(),
      ].sort((left, right) => left.localeCompare(right));

      return {
        category,
        title: meta.title,
        count,
        tokenCount: tokenLabels.length,
        tokenLabels,
      };
    });

    const categoryLines = categoryOverviewRows.map(
      row => `- ${row.title}: ${row.count} 条，${row.tokenCount} 个代币`
    );

    const categorySections = sortedCategories.map(([category, count], index) => {
      const meta = getCategoryMeta(category);
      const categoryIssues = issues.filter(issue => issue.category === category);
      const affectedTokenIdsInCategory = new Set(categoryIssues.map(issue => issue.tokenId));
      const severitySet = [...new Set(categoryIssues.map(issue => issue.severity))].sort(
        (left, right) => getSeverityRank(left) - getSeverityRank(right)
      );
      const groupedByToken = new Map<
        number,
        {
          label: string;
          exchanges: Set<string>;
          messages: Set<string>;
          metricSamples: Set<string>;
          issueCount: number;
        }
      >();

      for (const issue of categoryIssues) {
        const current =
          groupedByToken.get(issue.tokenId) ?? {
            label: formatTokenLabel(issue),
            exchanges: new Set<string>(),
            messages: new Set<string>(),
            metricSamples: new Set<string>(),
            issueCount: 0,
          };
        if (issue.exchangeName) {
          current.exchanges.add(issue.exchangeName);
        }
        current.messages.add(issue.message);
        const metricText = formatMetrics(issue.metrics);
        if (metricText) {
          current.metricSamples.add(metricText);
        }
        current.issueCount += 1;
        groupedByToken.set(issue.tokenId, current);
      }

      const tokenLines = [...groupedByToken.values()]
        .sort((left, right) => left.label.localeCompare(right.label))
        .map(entry => {
          const exchangesText =
            entry.exchanges.size > 0 ? `；交易所: ${[...entry.exchanges].sort().join(" / ")}` : "";
          const metricText =
            entry.metricSamples.size > 0
              ? `；指标: ${[...entry.metricSamples].slice(0, 2).join(" | ")}`
              : "";
          const issueCountText = entry.issueCount > 1 ? `；问题次数: ${entry.issueCount}` : "";
          return `- ${entry.label}${exchangesText}${issueCountText}${metricText}`;
        });

      return [
        `## ${index + 1}. ${meta.title}`,
        "",
        `- 严重级别: ${severitySet.map(getSeverityLabel).join(" / ")}`,
        `- 问题条数: ${count}`,
        `- 涉及代币数: ${affectedTokenIdsInCategory.size}`,
        `- 问题说明: ${meta.meaning}`,
        "- 涉及代币:",
        ...(tokenLines.length > 0 ? tokenLines : ["- 无"]),
        "",
      ].join("\n");
    });

    const report = {
      meta: {
        checkedAt: now.toISOString(),
        historyDays: options.historyDays,
        tokenCount: scopeTokens.size,
        exchanges: TARGET_EXCHANGES,
      },
      summary: {
        totalIssues: issues.length,
        affectedTokens: affectedTokens.size,
        highSeverityAffectedTokens: highSeverityTokens.size,
        issuesByCategory: Object.fromEntries(issuesByCategory.entries()),
      },
      categorySummaries: categoryOverviewRows.map(row => {
        const meta = getCategoryMeta(row.category);
        return {
          category: row.category,
          title: meta.title,
          meaning: meta.meaning,
          issueCount: row.count,
          tokenCount: row.tokenCount,
          tokenLabels: row.tokenLabels,
        };
      }),
      issues,
    };

    const timestampLabel = now.toISOString().replace(/[:]/g, "-");
    await fs.mkdir(options.outputDir, { recursive: true });
    const jsonPath = path.join(options.outputDir, `data-coverage-${timestampLabel}.json`);
    const mdPath = path.join(options.outputDir, `data-coverage-${timestampLabel}.md`);

    const markdown = [
      "# 每日数据覆盖检查报告",
      "",
      `- 检查时间: ${formatDate(now)}`,
      `- 检查范围代币数: ${scopeTokens.size}`,
      `- 口径说明: 仅检查会在代币列表展示的代币`,
      `- 纳入范围交易所: ${TARGET_EXCHANGES.map(exchange => exchange.name).join("、")}`,
      `- 检查窗口: 最近 ${options.historyDays} 天`,
      `- 问题总数: ${issues.length}`,
      `- 有问题的代币数: ${affectedTokens.size}`,
      `- 含高优先级问题的代币数: ${highSeverityTokens.size}`,
      "",
      "## 问题概览",
      ...categoryLines,
      "",
      "| 问题类型 | 问题条数 | 涉及代币数 | 涉及代币 |",
      "| --- | ---: | ---: | --- |",
      ...categoryOverviewRows.map(
        row =>
          `| ${row.title} | ${row.count} | ${row.tokenCount} | ${row.tokenLabels.join("、")} |`
      ),
      "",
      "## 按问题类型展开",
      ...categorySections,
      "",
      `详细 JSON: ${jsonPath}`,
    ].join("\n");

    await Promise.all([
      fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
      fs.writeFile(mdPath, `${markdown}\n`, "utf8"),
    ]);

    console.log("每日数据覆盖检查");
    console.log(`检查时间: ${formatDate(now)}`);
    console.log(`检查范围代币数: ${scopeTokens.size}`);
    console.log("口径说明: 仅检查会在代币列表展示的代币");
    console.log(`纳入范围交易所: ${TARGET_EXCHANGES.map(exchange => exchange.name).join("、")}`);
    console.log(`检查窗口: 最近 ${options.historyDays} 天`);
    console.log(`问题总数: ${issues.length}`);
    console.log(`有问题的代币数: ${affectedTokens.size}`);
    console.log(`含高优先级问题的代币数: ${highSeverityTokens.size}`);
    console.log("");
    console.log("问题概览:");
    for (const line of categoryLines) {
      console.log(line);
    }
    console.log("");
    console.log("问题概览总表:");
    for (const row of categoryOverviewRows) {
      console.log(`${row.title} | ${row.count} 条 | ${row.tokenCount} 个代币`);
      console.log(`代币: ${row.tokenLabels.join("、")}`);
    }
    console.log("");
    console.log("按问题类型展开:");
    for (const section of categorySections) {
      console.log(section);
    }
    console.log("");
    console.log(`Markdown 报告已保存: ${mdPath}`);
    console.log(`JSON 明细已保存: ${jsonPath}`);

    if (options.failOnHigh && highSeverityTokens.size > 0) {
      process.exitCode = 1;
    }
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
