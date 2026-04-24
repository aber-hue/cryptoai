import { listMarketTokens, getTokenProfileBySymbol, getTokenDepthViewBySymbol, getTokenHoldersViewBySymbol, getTokenUnlockViewBySymbol, getTokenListingViewBySymbol, getOnchainHoldersBySymbol } from "../liveData";
import * as db from "../db";

const SIGNAL_DEFAULTS = {
  price24hPct: 10,
  oi12hPct: 50,
  oi24hPct: 100,
  fundingPositive: 0.05,
  fundingNegative: -0.05,
  bidAskRatio: 1.5,
  unlockDays: 7,
  unlockLookaheadDays: 60,
  unlockPct: 2,
  topHolderChangePct: 10,
  topHolderWindowSize: 20,
} as const;

const ONCHAIN_TIMEOUT_MS = 8000;

type ScanSignalResult = {
  signalType: string;
  created: boolean;
  signalEventId: string;
  symbol: string;
};

function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildHourBucket(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hour = `${date.getUTCHours()}`.padStart(2, "0");
  return `${year}${month}${day}${hour}`;
}

function buildDayBucket(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toNumeric(input: unknown) {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  if (typeof input === "string" && input.trim()) {
    const num = Number(input);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toDecimalString(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? null : String(value);
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, label: string) {
  let timer: NodeJS.Timeout | null = null;

  try {
    return await Promise.race<T>([
      task,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function saveSignalEvent(input: {
  signalType: string;
  symbol: string;
  tokenId: number;
  title: string;
  summary: string;
  category: string;
  direction: string;
  window: string;
  severity: "low" | "medium" | "high";
  source: string;
  triggeredAt: Date;
  dedupeBucket: string;
  latestMetricValue?: number | null;
  baselineValue?: number | null;
  thresholdValue?: number | null;
  changePct?: number | null;
  payload?: Record<string, unknown>;
  metrics?: Array<{
    metricKey: string;
    metricLabel: string;
    metricValue?: number | null;
    metricUnit?: string | null;
    baselineValue?: number | null;
    thresholdValue?: number | null;
    sortOrder?: number;
  }>;
}) {
  const dedupeKey = `${input.signalType}:${input.tokenId}:${input.window}:${input.dedupeBucket}`;
  const result = await db.upsertSignalEventWithMetrics({
    event: {
      signalType: input.signalType,
      tokenId: input.tokenId,
      symbol: input.symbol,
      title: input.title,
      summary: input.summary,
      category: input.category,
      direction: input.direction,
      window: input.window,
      severity: input.severity,
      status: "new",
      source: input.source,
      triggeredAt: input.triggeredAt,
      expiresAt: addDays(input.triggeredAt, 3),
      dedupeKey,
      latestMetricValue: toDecimalString(input.latestMetricValue),
      baselineValue: toDecimalString(input.baselineValue),
      thresholdValue: toDecimalString(input.thresholdValue),
      changePct: toDecimalString(input.changePct),
      payloadJson: input.payload ? JSON.stringify(input.payload) : null,
    },
    metrics: input.metrics?.map(metric => ({
      metricKey: metric.metricKey,
      metricLabel: metric.metricLabel,
      metricValue: toDecimalString(metric.metricValue),
      metricUnit: metric.metricUnit ?? null,
      baselineValue: toDecimalString(metric.baselineValue),
      thresholdValue: toDecimalString(metric.thresholdValue),
      sortOrder: metric.sortOrder ?? 0,
    })),
  });

  return result;
}

function computePctChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function severityFromPct(changePct: number | null, medium: number, high: number): "low" | "medium" | "high" {
  const value = Math.abs(changePct ?? 0);
  if (value >= high) return "high";
  if (value >= medium) return "medium";
  return "low";
}

async function getCandidateSymbols(limit = 80) {
  const market = await listMarketTokens({
    page: 1,
    pageSize: Math.min(Math.max(limit, 10), 100),
    sortBy: "volume24h",
    sortOrder: "desc",
  });

  return Array.from(
    new Set([
      ...market.items.map(item => item.symbol.trim().toUpperCase()).filter(Boolean),
    ])
  );
}

export async function runSignalScan(input?: {
  symbols?: string[];
  limit?: number;
}) {
  const triggered: ScanSignalResult[] = [];
  const scannedSymbols = input?.symbols?.length
    ? Array.from(new Set(input.symbols.map(symbol => symbol.trim().toUpperCase()).filter(Boolean)))
    : await getCandidateSymbols(input?.limit ?? 80);

  const now = new Date();
  const yesterday = addDays(now, -1);

  for (const symbol of scannedSymbols) {
    const profile = await getTokenProfileBySymbol(symbol).catch(() => null);
    if (!profile) continue;
    let shouldRunOnchainChecks = false;

    if ((profile.priceChange24h ?? 0) > SIGNAL_DEFAULTS.price24hPct) {
      const result = await saveSignalEvent({
        signalType: "price_change_24h_gt_10pct",
        symbol: profile.symbol,
        tokenId: profile.tokenId,
        title: "24h 价格异动",
        summary: `24h 价格上涨 ${roundTo(profile.priceChange24h ?? 0, 2)}%，超过 ${SIGNAL_DEFAULTS.price24hPct}% 阈值`,
        category: "price",
        direction: "up",
        window: "24h",
        severity: severityFromPct(profile.priceChange24h, SIGNAL_DEFAULTS.price24hPct, 20),
        source: "token_profile",
        triggeredAt: now,
        dedupeBucket: buildHourBucket(now),
        latestMetricValue: profile.priceChange24h,
        thresholdValue: SIGNAL_DEFAULTS.price24hPct,
        changePct: profile.priceChange24h,
        payload: {
          currentPrice: profile.currentPrice,
        },
        metrics: [
          {
            metricKey: "price_change_24h",
            metricLabel: "24h 价格涨幅",
            metricValue: profile.priceChange24h,
            metricUnit: "%",
            thresholdValue: SIGNAL_DEFAULTS.price24hPct,
            sortOrder: 1,
          },
          {
            metricKey: "current_price",
            metricLabel: "当前价格",
            metricValue: profile.currentPrice,
            metricUnit: "price",
            sortOrder: 2,
          },
        ],
      });
      triggered.push({ signalType: "price_change_24h_gt_10pct", created: result.created, signalEventId: result.id, symbol: profile.symbol });
      shouldRunOnchainChecks = true;
    }

    const holdersView = await getTokenHoldersViewBySymbol(symbol, "1h").catch(() => null);
    if (holdersView?.series && holdersView.series.length >= 2) {
      const sorted = [...holdersView.series].sort(
        (left, right) => new Date(left.snapshotDate).getTime() - new Date(right.snapshotDate).getTime()
      );
      const latest = sorted.at(-1);
      const baseline12h = [...sorted]
        .reverse()
        .find(point => now.getTime() - new Date(point.snapshotDate).getTime() >= 12 * 60 * 60 * 1000) ?? sorted[0];
      const baseline24h = sorted[0];

      const latestOi = toNumeric(latest?.totalOpenInterest);
      const previous12hOi = toNumeric(baseline12h?.totalOpenInterest);
      const previous24hOi = toNumeric(baseline24h?.totalOpenInterest);
      const latestFunding = toNumeric(latest?.fundingRate);

      const oiChange12h = latestOi != null && previous12hOi != null ? computePctChange(latestOi, previous12hOi) : null;
      const oiChange24h = latestOi != null && previous24hOi != null ? computePctChange(latestOi, previous24hOi) : null;

      if (oiChange12h != null && oiChange12h > SIGNAL_DEFAULTS.oi12hPct) {
        const result = await saveSignalEvent({
          signalType: "oi_change_12h_gt_50pct",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "12h OI 异动",
          summary: `12h OI 增长 ${roundTo(oiChange12h, 2)}%，超过 ${SIGNAL_DEFAULTS.oi12hPct}% 阈值`,
          category: "oi_funding",
          direction: "up",
          window: "12h",
          severity: severityFromPct(oiChange12h, SIGNAL_DEFAULTS.oi12hPct, 80),
          source: "funding_series",
          triggeredAt: now,
          dedupeBucket: buildHourBucket(now),
          latestMetricValue: latestOi,
          baselineValue: previous12hOi,
          thresholdValue: SIGNAL_DEFAULTS.oi12hPct,
          changePct: oiChange12h,
          metrics: [
            { metricKey: "current_oi", metricLabel: "当前 OI", metricValue: latestOi, metricUnit: "usd", sortOrder: 1 },
            { metricKey: "previous_oi_12h", metricLabel: "12h 前 OI", metricValue: previous12hOi, metricUnit: "usd", sortOrder: 2 },
            { metricKey: "oi_change_12h_pct", metricLabel: "12h OI 变化", metricValue: oiChange12h, metricUnit: "%", thresholdValue: SIGNAL_DEFAULTS.oi12hPct, sortOrder: 3 },
          ],
        });
        triggered.push({ signalType: "oi_change_12h_gt_50pct", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }

      if (oiChange24h != null && oiChange24h > SIGNAL_DEFAULTS.oi24hPct) {
        const result = await saveSignalEvent({
          signalType: "oi_change_24h_gt_100pct",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "24h OI 爆量",
          summary: `24h OI 增长 ${roundTo(oiChange24h, 2)}%，超过 ${SIGNAL_DEFAULTS.oi24hPct}% 阈值`,
          category: "oi_funding",
          direction: "up",
          window: "24h",
          severity: severityFromPct(oiChange24h, SIGNAL_DEFAULTS.oi24hPct, 150),
          source: "funding_series",
          triggeredAt: now,
          dedupeBucket: buildHourBucket(now),
          latestMetricValue: latestOi,
          baselineValue: previous24hOi,
          thresholdValue: SIGNAL_DEFAULTS.oi24hPct,
          changePct: oiChange24h,
          metrics: [
            { metricKey: "current_oi", metricLabel: "当前 OI", metricValue: latestOi, metricUnit: "usd", sortOrder: 1 },
            { metricKey: "previous_oi_24h", metricLabel: "24h 前 OI", metricValue: previous24hOi, metricUnit: "usd", sortOrder: 2 },
            { metricKey: "oi_change_24h_pct", metricLabel: "24h OI 变化", metricValue: oiChange24h, metricUnit: "%", thresholdValue: SIGNAL_DEFAULTS.oi24hPct, sortOrder: 3 },
          ],
        });
        triggered.push({ signalType: "oi_change_24h_gt_100pct", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }

      if (latestFunding != null && latestFunding > SIGNAL_DEFAULTS.fundingPositive) {
        const result = await saveSignalEvent({
          signalType: "funding_rate_gt_pos_threshold",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "资金费率偏高",
          summary: `当前资金费率 ${roundTo(latestFunding, 4)}，高于 ${SIGNAL_DEFAULTS.fundingPositive} 阈值`,
          category: "oi_funding",
          direction: "up",
          window: "now",
          severity: severityFromPct(latestFunding, SIGNAL_DEFAULTS.fundingPositive, 0.08),
          source: "funding_series",
          triggeredAt: now,
          dedupeBucket: buildHourBucket(now),
          latestMetricValue: latestFunding,
          thresholdValue: SIGNAL_DEFAULTS.fundingPositive,
          changePct: null,
          metrics: [
            { metricKey: "funding_rate", metricLabel: "资金费率", metricValue: latestFunding, metricUnit: "ratio", thresholdValue: SIGNAL_DEFAULTS.fundingPositive, sortOrder: 1 },
          ],
        });
        triggered.push({ signalType: "funding_rate_gt_pos_threshold", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }

      if (latestFunding != null && latestFunding < SIGNAL_DEFAULTS.fundingNegative) {
        const result = await saveSignalEvent({
          signalType: "funding_rate_lt_neg_threshold",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "资金费率偏低",
          summary: `当前资金费率 ${roundTo(latestFunding, 4)}，低于 ${SIGNAL_DEFAULTS.fundingNegative} 阈值`,
          category: "oi_funding",
          direction: "down",
          window: "now",
          severity: severityFromPct(latestFunding, Math.abs(SIGNAL_DEFAULTS.fundingNegative), 0.08),
          source: "funding_series",
          triggeredAt: now,
          dedupeBucket: buildHourBucket(now),
          latestMetricValue: latestFunding,
          thresholdValue: SIGNAL_DEFAULTS.fundingNegative,
          changePct: null,
          metrics: [
            { metricKey: "funding_rate", metricLabel: "资金费率", metricValue: latestFunding, metricUnit: "ratio", thresholdValue: SIGNAL_DEFAULTS.fundingNegative, sortOrder: 1 },
          ],
        });
        triggered.push({ signalType: "funding_rate_lt_neg_threshold", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }
    }

    const depthView = await getTokenDepthViewBySymbol(symbol).catch(() => null);
    if (depthView?.items?.length) {
      const totalBuy = depthView.items.reduce((sum, item) => sum + (toNumeric(item.depthBuy2) ?? 0), 0);
      const totalSell = depthView.items.reduce((sum, item) => sum + (toNumeric(item.depthSell2) ?? 0), 0);
      const ratio = totalSell > 0 ? totalBuy / totalSell : null;

      if (ratio != null && ratio > SIGNAL_DEFAULTS.bidAskRatio) {
        const result = await saveSignalEvent({
          signalType: "bid_ask_ratio_gt_1_5",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "盘口买卖比失衡",
          summary: `聚合买卖盘比 ${roundTo(ratio, 3)}，高于 ${SIGNAL_DEFAULTS.bidAskRatio} 阈值`,
          category: "depth",
          direction: "up",
          window: "now",
          severity: severityFromPct(ratio, SIGNAL_DEFAULTS.bidAskRatio, 2),
          source: "depth_view",
          triggeredAt: now,
          dedupeBucket: buildHourBucket(now),
          latestMetricValue: ratio,
          thresholdValue: SIGNAL_DEFAULTS.bidAskRatio,
          metrics: [
            { metricKey: "depth_buy_2_total", metricLabel: "聚合买盘深度", metricValue: totalBuy, metricUnit: "usd", sortOrder: 1 },
            { metricKey: "depth_sell_2_total", metricLabel: "聚合卖盘深度", metricValue: totalSell, metricUnit: "usd", sortOrder: 2 },
            { metricKey: "bid_ask_ratio", metricLabel: "买卖盘比", metricValue: ratio, metricUnit: "ratio", thresholdValue: SIGNAL_DEFAULTS.bidAskRatio, sortOrder: 3 },
          ],
        });
        triggered.push({ signalType: "bid_ask_ratio_gt_1_5", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }
    }

    const unlockView = await getTokenUnlockViewBySymbol(symbol).catch(() => null);
    if (unlockView?.rows?.length) {
      const eligibleUnlockRows = unlockView.rows.filter(row => {
        const unlockAt = new Date(row.unlockDate);
        return (
          unlockAt.getTime() >= now.getTime() &&
          unlockAt.getTime() <= addDays(now, SIGNAL_DEFAULTS.unlockLookaheadDays).getTime()
        );
      });

      const upcomingUnlock = unlockView.rows.find(row => {
        const date = new Date(row.unlockDate);
        return date.getTime() >= now.getTime() && date.getTime() <= addDays(now, SIGNAL_DEFAULTS.unlockDays).getTime();
      });

      if (upcomingUnlock) {
        const result = await saveSignalEvent({
          signalType: "unlock_within_7d",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "7d 内解锁事件",
          summary: `${upcomingUnlock.unlockDate} 存在解锁事件，位于未来 ${SIGNAL_DEFAULTS.unlockDays} 天窗口内`,
          category: "event",
          direction: "upcoming",
          window: "7d",
          severity: "medium",
          source: "unlock_view",
          triggeredAt: now,
          dedupeBucket: buildDayBucket(now),
          payload: {
            unlockDate: upcomingUnlock.unlockDate,
          },
          metrics: [
            { metricKey: "unlock_date", metricLabel: "解锁日期", metricValue: null, metricUnit: upcomingUnlock.unlockDate, sortOrder: 1 },
            { metricKey: "monthly_release_ratio", metricLabel: "单期解锁占比", metricValue: toNumeric(upcomingUnlock.monthlyReleaseRatio), metricUnit: "%", sortOrder: 2 },
          ],
        });
        triggered.push({ signalType: "unlock_within_7d", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }

      const largeUnlock = eligibleUnlockRows.find(row => (toNumeric(row.monthlyReleaseRatio) ?? 0) > SIGNAL_DEFAULTS.unlockPct);
      if (largeUnlock) {
        const ratio = toNumeric(largeUnlock.monthlyReleaseRatio);
        const result = await saveSignalEvent({
          signalType: "unlock_pct_gt_2pct",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "大额解锁占比",
          summary: `${largeUnlock.unlockDate} 单期解锁占比 ${roundTo(ratio ?? 0, 2)}%，超过 ${SIGNAL_DEFAULTS.unlockPct}% 阈值`,
          category: "event",
          direction: "upcoming",
          window: "event",
          severity: severityFromPct(ratio, SIGNAL_DEFAULTS.unlockPct, 5),
          source: "unlock_view",
          triggeredAt: now,
          dedupeBucket: buildDayBucket(new Date(largeUnlock.unlockDate)),
          latestMetricValue: ratio,
          thresholdValue: SIGNAL_DEFAULTS.unlockPct,
          changePct: ratio,
          payload: {
            unlockDate: largeUnlock.unlockDate,
          },
          metrics: [
            { metricKey: "unlock_date", metricLabel: "解锁日期", metricValue: null, metricUnit: largeUnlock.unlockDate, sortOrder: 1 },
            { metricKey: "monthly_release_ratio", metricLabel: "单期解锁占比", metricValue: ratio, metricUnit: "%", thresholdValue: SIGNAL_DEFAULTS.unlockPct, sortOrder: 2 },
            { metricKey: "monthly_total_release", metricLabel: "单期解锁数量", metricValue: toNumeric(largeUnlock.monthlyTotalRelease), metricUnit: "token", sortOrder: 3 },
          ],
        });
        triggered.push({ signalType: "unlock_pct_gt_2pct", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }
    }

    const listingView = await getTokenListingViewBySymbol(symbol).catch(() => null);
    if (listingView?.items?.length) {
      const recentListing = listingView.items.find(item => item.eventType === "listing" && item.date && new Date(item.date).getTime() >= addDays(now, -2).getTime());
      if (recentListing) {
        const listingDate = new Date(recentListing.date ?? now.toISOString());
        const result = await saveSignalEvent({
          signalType: "new_listing_detected",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "新上线事件",
          summary: `检测到 ${recentListing.exchangeName} 新上线事件，时间 ${recentListing.date ?? "未知"}`,
          category: "event",
          direction: "event",
          window: "event",
          severity: "medium",
          source: "listing_view",
          triggeredAt: now,
          dedupeBucket: buildDayBucket(listingDate),
          payload: {
            exchangeName: recentListing.exchangeName,
            marketType: recentListing.marketType,
            eventDate: recentListing.date,
          },
          metrics: [
            { metricKey: "listing_exchange", metricLabel: "交易所", metricValue: null, metricUnit: recentListing.exchangeName, sortOrder: 1 },
          ],
        });
        triggered.push({ signalType: "new_listing_detected", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }

      const recentActivity = listingView.items.find(item => item.eventType === "activity" && item.date && new Date(item.date).getTime() >= addDays(now, -2).getTime());
      if (recentActivity) {
        const activityDate = new Date(recentActivity.date ?? now.toISOString());
        const result = await saveSignalEvent({
          signalType: "new_activity_detected",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "新活动事件",
          summary: `检测到 ${recentActivity.exchangeName} 新活动，时间 ${recentActivity.date ?? "未知"}`,
          category: "event",
          direction: "event",
          window: "event",
          severity: "medium",
          source: "listing_view",
          triggeredAt: now,
          dedupeBucket: buildDayBucket(activityDate),
          payload: {
            exchangeName: recentActivity.exchangeName,
            rewardToken: recentActivity.rewardToken,
            rewardAmount: recentActivity.rewardAmount,
            eventDate: recentActivity.date,
          },
          metrics: [
            { metricKey: "activity_exchange", metricLabel: "交易所", metricValue: null, metricUnit: recentActivity.exchangeName, sortOrder: 1 },
            { metricKey: "reward_amount", metricLabel: "奖励数量", metricValue: toNumeric(recentActivity.rewardAmount), metricUnit: recentActivity.rewardToken ?? "token", sortOrder: 2 },
          ],
        });
        triggered.push({ signalType: "new_activity_detected", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        shouldRunOnchainChecks = true;
      }
    }

    if (!shouldRunOnchainChecks) continue;

    const currentHolders = await withTimeout(
      getOnchainHoldersBySymbol(symbol, { page: 1, pageSize: SIGNAL_DEFAULTS.topHolderWindowSize }),
      ONCHAIN_TIMEOUT_MS,
      `getOnchainHoldersBySymbol(${symbol})`
    ).catch(() => null);
    if (currentHolders?.items?.length) {
      const topMovers = currentHolders.items
        .filter(item => (item.rank ?? Number.MAX_SAFE_INTEGER) <= SIGNAL_DEFAULTS.topHolderWindowSize)
        .map(item => {
          const change = toNumeric(item.balanceChange24h);
          const balance = toNumeric(item.balance);
          const previousBalance = balance != null && change != null ? balance - change : null;
          const pct = previousBalance != null && previousBalance !== 0 && change != null ? (Math.abs(change) / Math.abs(previousBalance)) * 100 : null;
          return { item, pct, change, balance };
        })
        .filter(entry => (entry.pct ?? 0) > SIGNAL_DEFAULTS.topHolderChangePct)
        .sort((left, right) => (right.pct ?? 0) - (left.pct ?? 0));

      const topMover = topMovers[0];
      if (topMover) {
        const result = await saveSignalEvent({
          signalType: "top_holder_balance_change_gt_x",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "Top Holder 持仓异动",
          summary: `地址 ${topMover.item.address.slice(0, 8)}... 24h 持仓变化 ${roundTo(topMover.pct ?? 0, 2)}%，超过 ${SIGNAL_DEFAULTS.topHolderChangePct}% 阈值`,
          category: "onchain",
          direction: "both",
          window: "24h",
          severity: severityFromPct(topMover.pct, SIGNAL_DEFAULTS.topHolderChangePct, 20),
          source: "onchain_holders",
          triggeredAt: now,
          dedupeBucket: buildDayBucket(now),
          latestMetricValue: topMover.balance,
          baselineValue: topMover.balance != null && topMover.change != null ? topMover.balance - topMover.change : null,
          thresholdValue: SIGNAL_DEFAULTS.topHolderChangePct,
          changePct: topMover.pct,
          payload: {
            address: topMover.item.address,
            rank: topMover.item.rank,
            label: topMover.item.label,
            kind: topMover.item.kind,
          },
          metrics: [
            { metricKey: "holder_rank", metricLabel: "地址排名", metricValue: topMover.item.rank, metricUnit: "rank", sortOrder: 1 },
            { metricKey: "holder_balance", metricLabel: "当前余额", metricValue: topMover.balance, metricUnit: "token", sortOrder: 2 },
            { metricKey: "holder_balance_change_24h", metricLabel: "24h 余额变化", metricValue: topMover.change, metricUnit: "token", sortOrder: 3 },
            { metricKey: "holder_balance_change_24h_pct", metricLabel: "24h 余额变化比例", metricValue: topMover.pct, metricUnit: "%", thresholdValue: SIGNAL_DEFAULTS.topHolderChangePct, sortOrder: 4 },
          ],
        });
        triggered.push({ signalType: "top_holder_balance_change_gt_x", created: result.created, signalEventId: result.id, symbol: profile.symbol });
      }

      const newEntry = currentHolders.items.find(item => item.isNew && (item.rank ?? Number.MAX_SAFE_INTEGER) <= SIGNAL_DEFAULTS.topHolderWindowSize);
      if (newEntry) {
        const result = await saveSignalEvent({
          signalType: "new_top_holder_entered",
          symbol: profile.symbol,
          tokenId: profile.tokenId,
          title: "新地址进入前排",
          summary: `地址 ${newEntry.address.slice(0, 8)}... 新进入前 ${SIGNAL_DEFAULTS.topHolderWindowSize} holder`,
          category: "onchain",
          direction: "in",
          window: "snapshot",
          severity: (newEntry.rank ?? SIGNAL_DEFAULTS.topHolderWindowSize) <= 10 ? "high" : "medium",
          source: "onchain_holders",
          triggeredAt: now,
          dedupeBucket: buildDayBucket(now),
          payload: {
            address: newEntry.address,
            rank: newEntry.rank,
            label: newEntry.label,
            kind: newEntry.kind,
          },
          metrics: [
            { metricKey: "holder_rank", metricLabel: "地址排名", metricValue: newEntry.rank, metricUnit: "rank", sortOrder: 1 },
            { metricKey: "holder_balance", metricLabel: "当前余额", metricValue: toNumeric(newEntry.balance), metricUnit: "token", sortOrder: 2 },
          ],
        });
        triggered.push({ signalType: "new_top_holder_entered", created: result.created, signalEventId: result.id, symbol: profile.symbol });
      }

      const previousHolders = await withTimeout(
        getOnchainHoldersBySymbol(symbol, {
          date: isoDate(yesterday),
          page: 1,
          pageSize: SIGNAL_DEFAULTS.topHolderWindowSize,
        }),
        ONCHAIN_TIMEOUT_MS,
        `getOnchainHoldersBySymbol(${symbol}, previous)`
      ).catch(() => null);

      if (previousHolders?.items?.length) {
        const currentSet = new Set(
          currentHolders.items
            .filter(item => (item.rank ?? Number.MAX_SAFE_INTEGER) <= SIGNAL_DEFAULTS.topHolderWindowSize)
            .map(item => item.address.toLowerCase())
        );
        const previousTop = previousHolders.items.filter(item => (item.rank ?? Number.MAX_SAFE_INTEGER) <= SIGNAL_DEFAULTS.topHolderWindowSize);
        const exited = previousTop.find(item => !currentSet.has(item.address.toLowerCase()));

        if (exited) {
          const result = await saveSignalEvent({
            signalType: "top_holder_exited",
            symbol: profile.symbol,
            tokenId: profile.tokenId,
            title: "地址退出前排",
            summary: `地址 ${exited.address.slice(0, 8)}... 退出前 ${SIGNAL_DEFAULTS.topHolderWindowSize} holder 队列`,
            category: "onchain",
            direction: "out",
            window: "snapshot",
            severity: (exited.rank ?? SIGNAL_DEFAULTS.topHolderWindowSize) <= 10 ? "high" : "medium",
            source: "onchain_holders",
            triggeredAt: now,
            dedupeBucket: buildDayBucket(now),
            payload: {
              address: exited.address,
              previousRank: exited.rank,
              label: exited.label,
              kind: exited.kind,
            },
            metrics: [
              { metricKey: "previous_holder_rank", metricLabel: "上一期排名", metricValue: exited.rank, metricUnit: "rank", sortOrder: 1 },
              { metricKey: "previous_holder_balance", metricLabel: "上一期余额", metricValue: toNumeric(exited.balance), metricUnit: "token", sortOrder: 2 },
            ],
          });
          triggered.push({ signalType: "top_holder_exited", created: result.created, signalEventId: result.id, symbol: profile.symbol });
        }
      }
    }
  }

  return {
    scannedSymbols,
    triggered,
    summary: {
      scanned: scannedSymbols.length,
      triggered: triggered.length,
      created: triggered.filter(item => item.created).length,
      updated: triggered.filter(item => !item.created).length,
    },
  };
}
