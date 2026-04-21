import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  listedTokens,
  type PositionTimeframe,
} from "@/features/crypto-ai/market-data";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowLeft,
  Activity,
  BarChart3,
  Clock3,
  ExternalLink,
  GitBranch,
  Globe,
  Link2,
  List,
  Package,
  ScanLine,
  Users,
} from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import type { LucideIcon } from "lucide-react";

const priceKlineData = [
  { date: "3月15日", open: 3.05, high: 3.23, low: 2.75, close: 3.22, volume: 6.0 },
  { date: "3月17日", open: 3.18, high: 3.33, low: 2.75, close: 2.92, volume: 3.0 },
  { date: "3月19日", open: 2.95, high: 3.12, low: 2.75, close: 2.85, volume: 2.3 },
  { date: "3月21日", open: 2.9, high: 3.0, low: 2.75, close: 3.0, volume: 3.8 },
  { date: "3月23日", open: 2.92, high: 2.92, low: 2.75, close: 2.8, volume: 2.2 },
  { date: "3月25日", open: 3.05, high: 3.25, low: 2.75, close: 3.15, volume: 1.3 },
  { date: "3月27日", open: 3.13, high: 3.13, low: 2.75, close: 2.92, volume: 1.6 },
  { date: "3月29日", open: 3.05, high: 3.28, low: 2.75, close: 3.28, volume: 5.7 },
  { date: "3月31日", open: 2.9, high: 3.38, low: 2.75, close: 3.37, volume: 1.1 },
  { date: "4月2日", open: 3.48, high: 3.76, low: 2.75, close: 3.45, volume: 5.3 },
  { date: "4月4日", open: 3.58, high: 3.8, low: 2.75, close: 2.93, volume: 2.4 },
  { date: "4月6日", open: 3.55, high: 3.78, low: 2.75, close: 3.68, volume: 2.2 },
  { date: "4月8日", open: 3.7, high: 3.8, low: 2.75, close: 3.35, volume: 5.5 },
  { date: "4月10日", open: 3.59, high: 3.6, low: 2.75, close: 3.0, volume: 1.8 },
  { date: "4月12日", open: 3.47, high: 3.79, low: 2.75, close: 3.7, volume: 5.9 },
  { date: "4月14日", open: 3.37, high: 3.37, low: 2.75, close: 3.21, volume: 1.2 },
].map(item => ({ ...item, bodyLow: Math.min(item.open, item.close), bodyHigh: Math.max(item.open, item.close) }));

function CandleBar(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const isUp = payload.close >= payload.open;
  const color = isUp ? "#22c55e" : "#ef4444";
  const range = payload.high - payload.low || 1;
  const bodyTop = y + ((payload.high - payload.bodyHigh) / range) * height;
  const bodyHeight = Math.max(((payload.bodyHigh - payload.bodyLow) / range) * height, 2);
  const bodyBottom = bodyTop + bodyHeight;
  const wickX = x + width / 2;

  return (
    <g>
      <line x1={wickX} y1={y} x2={wickX} y2={y + height} stroke={color} strokeWidth={1.5} />
      <rect x={x + 2} y={bodyTop} width={Math.max(width - 4, 3)} height={bodyHeight} rx={1} fill={color} />
      <line x1={wickX} y1={bodyBottom} x2={wickX} y2={y + height} stroke={color} strokeWidth={1.5} />
    </g>
  );
}

function formatCompactPrice(value: number) {
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function formatMetricValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function formatSupplyValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return value.toFixed(2);
}

function formatHolderCount(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return `${value}`;
}

function formatPercentValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(2)}%`;
}

function shortAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

function AssetLogo({
  src,
  alt,
  fallback,
  className,
}: {
  src?: string | null;
  alt: string;
  fallback: string;
  className?: string;
}) {
  if (src) {
    return <img src={src} alt={alt} className={cn("rounded-full border border-[#d8e0eb] bg-white object-cover", className)} />;
  }

  return (
    <div className={cn("flex items-center justify-center rounded-full bg-[#dbeafe] font-semibold text-[#1d4ed8]", className)}>
      {fallback}
    </div>
  );
}

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const SHANGHAI_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHANGHAI_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function getFormatterParts(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions
) {
  const date = value instanceof Date ? value : parseValidDate(value);
  if (!date) return null;

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    ...options,
  }).formatToParts(date);
}

function getDatePart(
  parts: Intl.DateTimeFormatPart[] | null,
  type: Intl.DateTimeFormatPartTypes
) {
  return parts?.find(part => part.type === type)?.value ?? "";
}

function toShanghaiDateKey(value: string | Date | null | undefined) {
  const date = value instanceof Date ? value : parseValidDate(value);
  if (!date) {
    return typeof value === "string" ? value.slice(0, 10) : null;
  }

  const parts = SHANGHAI_KEY_FORMATTER.formatToParts(date);
  const year = parts.find(part => part.type === "year")?.value ?? "";
  const month = parts.find(part => part.type === "month")?.value ?? "";
  const day = parts.find(part => part.type === "day")?.value ?? "";
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function shiftDateKey(value: string, offsetDays: number) {
  const [year, month, day] = value.split("-").map(Number);
  if (![year, month, day].every(Number.isFinite)) return value;
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + offsetDays);
  const nextYear = date.getUTCFullYear();
  const nextMonth = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const nextDay = `${date.getUTCDate()}`.padStart(2, "0");
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function parseValidDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatInShanghai(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions
) {
  const date = parseValidDate(value);
  if (!date) return value ?? "—";

  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    ...options,
  });

  return formatter.format(date).replace(/\//g, "/");
}

function formatAnnouncementDate(value: string | null) {
  return formatInShanghai(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatUnlockDate(value: string) {
  return formatInShanghai(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatUnlockAmount(value: number | null) {
  if (value == null || Number.isNaN(value)) return "--";
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatUnlockPercent(value: number | null) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(4)}%`;
}

function formatPlainNumber(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  return `${value}`;
}

function formatListingDateTime(value: string | null) {
  return formatInShanghai(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function formatListingMetric(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  return `$${value.toFixed(4)}`;
}

function formatChartShortDate(value: string | null) {
  const parts = getFormatterParts(value, {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
  if (!parts) return value ?? "—";
  return `${getDatePart(parts, "year")}/${getDatePart(parts, "month")}/${getDatePart(parts, "day")}`;
}

function resolveListingMarkerType(items: Array<{ markerType: "listing" | "activity" | "multi" }>) {
  const hasListing = items.some(item => item.markerType === "listing");
  const hasActivity = items.some(item => item.markerType === "activity");
  if (hasListing && hasActivity) return "multi" as const;
  if (hasListing) return "listing" as const;
  if (hasActivity) return "activity" as const;
  return null;
}

function buildListingTrendSeries(
  klinePoints: Array<{
    time: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    marketCap: number | null;
  }>,
  groups: Array<{
    key: string;
    date: string;
    rawDate: string | null;
    price: number;
    markerType: "listing" | "activity" | "multi";
    items: Array<{
      id: string;
      exchange: string;
      tag: string;
      title: string;
      markerType: "listing" | "activity" | "multi";
    }>;
  }>,
  currentPrice: number
) {
  if (klinePoints.length === 0) return [];

  const sortedKlines = [...klinePoints]
    .map(point => ({
      key: toDateKey(point.time) ?? point.time,
      rawDate: point.time,
      date: formatListingDateTime(point.time),
      axisLabel: formatChartShortDate(point.time),
      price: point.close ?? point.high ?? point.open ?? point.low ?? currentPrice,
      eventY: null as number | null,
      markerType: null as "listing" | "activity" | "multi" | null,
      items: [] as Array<{
        id: string;
        exchange: string;
        tag: string;
        title: string;
        markerType: "listing" | "activity" | "multi";
      }>,
    }))
    .filter(point => point.price != null && Number.isFinite(point.price));

  if (sortedKlines.length === 0) return [];

  const points: Array<{
    key: string;
    date: string;
    axisLabel: string;
    rawDate: string;
    price: number;
    eventY: number | null;
    markerType: "listing" | "activity" | "multi" | null;
    items: Array<{
      id: string;
      exchange: string;
      tag: string;
      title: string;
      markerType: "listing" | "activity" | "multi";
      }>;
  }> = sortedKlines;

  groups.forEach(group => {
    const rawTime = group.rawDate ? new Date(group.rawDate).getTime() : Number.NaN;
    if (Number.isNaN(rawTime)) return;

    let targetIndex = points.findIndex(point => toDateKey(point.rawDate) === toDateKey(group.rawDate));
    if (targetIndex === -1) {
      let minDistance = Number.POSITIVE_INFINITY;
      points.forEach((point, index) => {
        const distance = Math.abs(new Date(point.rawDate).getTime() - rawTime);
        if (distance < minDistance) {
          minDistance = distance;
          targetIndex = index;
        }
      });
    }

    if (targetIndex === -1) return;

    const target = points[targetIndex];
    target.items.push(...group.items);
    target.markerType = resolveListingMarkerType(target.items);
    target.eventY = target.price;
  });

  return points;
}

function buildListingPriceSeries(
  klinePoints: Array<{
    time: string;
    open: number | null;
    high: number | null;
    low: number | null;
    close: number | null;
    volume: number | null;
    marketCap: number | null;
  }>,
  currentPrice: number
) {
  return [...klinePoints]
    .map(point => ({
      key: toDateKey(point.time) ?? point.time,
      rawDate: point.time,
      date: formatListingDateTime(point.time),
      axisLabel: formatChartShortDate(point.time),
      price: point.close ?? point.high ?? point.open ?? point.low ?? currentPrice,
      high: point.high,
      low: point.low,
      open: point.open,
      close: point.close,
    }))
    .filter(point => point.price != null && Number.isFinite(point.price));
}

function ListingPriceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload?: {
      date: string;
      price: number;
      open: number | null;
      high: number | null;
      low: number | null;
      close: number | null;
    };
  }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="w-[220px] rounded-[18px] border border-[#dbe3ef] bg-white/98 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
      <div className="text-[1.05rem] font-semibold text-[oklch(var(--crypto-ink))]">{point.date}</div>
      <div className="mt-2 text-[1.2rem] font-semibold text-[oklch(var(--crypto-ink))]">
        收盘价: ${point.price.toFixed(point.price >= 1 ? 4 : 6)}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-[#475467]">
        <div>开盘: {point.open != null ? formatCompactPrice(point.open) : "—"}</div>
        <div>最高: {point.high != null ? formatCompactPrice(point.high) : "—"}</div>
        <div>最低: {point.low != null ? formatCompactPrice(point.low) : "—"}</div>
        <div>收盘: {point.close != null ? formatCompactPrice(point.close) : "—"}</div>
      </div>
    </div>
  );
}

function ListingChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string;
    payload?: {
      date: string;
      price: number;
      open?: number | null;
      high?: number | null;
      low?: number | null;
      close?: number | null;
      items?: Array<{
        id: string;
        exchange: string;
        tag: string;
        title: string;
        markerType: "listing" | "activity" | "multi";
      }>;
      markerType?: "listing" | "activity" | "multi" | null;
    };
  }>;
}) {
  const eventEntry = payload?.find(entry => entry.payload?.items?.length);
  const eventPoint = eventEntry?.payload;
  if (active && eventPoint?.items?.length) {
    return (
      <div className="w-[260px] rounded-[18px] border border-[#dbe3ef] bg-white/98 px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.14)]">
        <div className="text-[1.05rem] font-semibold text-[oklch(var(--crypto-ink))]">{eventPoint.date}</div>
        <div className="mt-2 text-[1.2rem] font-semibold text-[oklch(var(--crypto-ink))]">
          价格: ${eventPoint.price.toFixed(eventPoint.price >= 1 ? 4 : 6)}
        </div>
        <div className="mt-3 border-t border-[#e4e7ec] pt-3">
          {eventPoint.items.map(item => (
            <div key={item.id} className="mb-2 last:mb-0">
              <div className="flex items-center gap-2 text-sm font-medium text-[oklch(var(--crypto-ink))]">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor:
                      item.markerType === "listing"
                        ? "#22c55e"
                        : item.markerType === "activity"
                          ? "#f4b000"
                          : "#3b82f6",
                  }}
                />
                <span>{item.markerType === "listing" ? "上币事件" : item.markerType === "activity" ? "活动事件" : "多重事件"}</span>
              </div>
              <div className="mt-1 text-sm text-[#101828]">{item.title || `${item.exchange} ${item.tag}`}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <ListingPriceTooltip active={active} payload={payload as any} />;
}

function ListingEventTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { date: string; axisLabel?: string; price: number; items?: Array<any> } }>;
}) {
  return null;
}

function formatDepthMoney(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return formatMetricValue(value);
}

function formatDepthDateLabel(value: string) {
  const dateKey = toShanghaiDateKey(value);
  if (!dateKey) return value;
  const [, month, day] = dateKey.split("-");
  return `${month}/${day}`;
}

function toIsoDate(value: Date) {
  return toShanghaiDateKey(value) ?? "";
}

function toDateKey(value: string | Date | null | undefined) {
  return toShanghaiDateKey(value);
}

function buildDepthRangeSeries(
  points: Array<{
    snapshotDate: string | Date;
    totalDepth: number | null;
    totalVolume: number | null;
  }>,
  days: number,
  anchorDate: string | Date | null
) {
  const pointMap = new Map(
    points.flatMap(point => {
      const key = toDateKey(point.snapshotDate);
      if (!key) return [];
      return [[
        key,
        {
          totalDepth: point.totalDepth,
          volume: point.totalVolume,
        },
      ]] as const;
    })
  );

  const endDateKey = toDateKey(anchorDate);
  const normalizedEndDateKey = endDateKey ?? toShanghaiDateKey(new Date()) ?? "";

  return Array.from({ length: days }, (_, index) => {
    const key = shiftDateKey(normalizedEndDateKey, -(days - 1 - index));
    const matched = pointMap.get(key);

    return {
      date: formatDepthDateLabel(key),
      totalDepth: matched?.totalDepth ?? null,
      volume: matched?.volume ?? null,
    };
  });
}

function formatMarketTypeLabel(value: string | null) {
  switch (value) {
    case "spot":
      return "现货";
    case "perps":
      return "合约";
    case "alpha":
      return "Alpha";
    case "boost":
      return "Boost";
    case "xlaunch":
      return "X Launch";
    default:
      return value ? value.toUpperCase() : "—";
  }
}

function formatVolumeMillions(value: number) {
  return `$${value.toFixed(1)}M`;
}

function formatCompactMoney(value: number) {
  return formatMetricValue(value);
}

function formatFundingRate(value: number) {
  return `${value.toFixed(3)}%`;
}

function formatPositionAxisLabel(value: string, timeframe: PositionTimeframe) {
  const date = parseValidDate(value);
  if (!date) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");

  if (timeframe === "1h" || timeframe === "4h" || timeframe === "12h") {
    return `${month}/${day} ${hour}:${minute}`;
  }

  return `${month}/${day}`;
}

const listingTimelineRows = [
  {
    id: "upbit",
    exchange: "Upbit Spot",
    tag: "现货",
    date: "2026/04/15 03:00",
    price: "—",
    fdv: "N/A",
    link: "#",
    side: "left" as const,
    color: "#22c55e",
    logo: "UP",
    logoUrl: null,
    logoTone: "bg-[#1f4aa8] text-white",
  },
  {
    id: "bithumb",
    exchange: "Bithumb Spot",
    tag: "现货",
    date: "2026/04/15 00:30",
    price: "—",
    fdv: "N/A",
    link: "#",
    side: "left" as const,
    color: "#22c55e",
    logo: "b",
    logoUrl: null,
    logoTone: "bg-[#ff6b1a] text-white",
  },
  {
    id: "binance",
    exchange: "Binance Alpha",
    tag: "活动",
    date: "2026/04/13 20:00",
    price: "$0.021",
    fdv: "$210.0M",
    link: "#",
    side: "right" as const,
    color: "#f4b000",
    logo: "BN",
    logoUrl: null,
    logoTone: "bg-[#f4b000] text-zinc-900",
  },
  {
    id: "okx",
    exchange: "OKX Boost",
    tag: "多重事件",
    date: "2026/04/10 12:00",
    price: "$0.019",
    fdv: "$190.0M",
    link: "#",
    side: "right" as const,
    color: "#3b82f6",
    logo: "OK",
    logoUrl: null,
    logoTone: "bg-zinc-900 text-white",
  },
];

export default function CoinDetail() {
  const { coinId } = useParams<{ coinId: string }>();
  const [location, setLocation] = useLocation();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialTab = searchParams.get("tab");
  const initialDepthRange = searchParams.get("depthRange");
  const initialActiveTab: "listing" | "depth" | "unlock" | "onchain" | "holders" | "funding" =
    initialTab === "depth" ||
    initialTab === "unlock" ||
    initialTab === "onchain" ||
    initialTab === "holders" ||
    initialTab === "funding"
      ? initialTab
      : "listing";
  const initialDepthRangeDays: 30 | 90 | 180 | 365 =
    initialDepthRange === "90"
      ? 90
      : initialDepthRange === "180"
        ? 180
        : initialDepthRange === "365"
          ? 365
          : 30;
  const initialDepthMarketType: "spot" | "perps" =
    searchParams.get("depthMarket") === "perps" ? "perps" : "spot";
  const normalizedId = (coinId ?? "").toLowerCase();
  const matchedFallbackToken = listedTokens.find(item => item.symbol.toLowerCase() === normalizedId);
  const fallbackToken =
    matchedFallbackToken ??
    ({
      rank: 0,
      id: normalizedId || "token",
      symbol: (coinId ?? "TOKEN").toUpperCase(),
      name: coinId ?? "Token",
      description: "",
      price: 0,
      totalSupply: "—",
      circulatingSupply: "—",
      fdv: "—",
      marketCap: "—",
      volume24h: "—",
      listedAt: "—",
      recentVenue: "—",
      exchanges: [],
      logoText: (coinId ?? "T").slice(0, 2).toUpperCase(),
      logoTone: "bg-[#dbeafe] text-[#1d4ed8]",
    } as (typeof listedTokens)[number]);
  const [activeTab, setActiveTab] = useState<
    "listing" | "depth" | "unlock" | "onchain" | "holders" | "funding"
  >(initialActiveTab);
  const [listingRange, setListingRange] = useState<"1m" | "3m" | "6m" | "1y">("3m");
  const [positionTimeframe, setPositionTimeframe] = useState<PositionTimeframe>("4h");
  const [listingView, setListingView] = useState<"timeline" | "list">("list");
  const [depthRange, setDepthRange] = useState<30 | 90 | 180 | 365>(initialDepthRangeDays);
  const [depthMarketType, setDepthMarketType] = useState<"spot" | "perps">(initialDepthMarketType);
  const tokenProfileQuery = trpc.token.getProfile.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase() },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenUnlockQuery = trpc.token.getUnlockView.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase() },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenListingQuery = trpc.token.getListingView.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase() },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenKlineQuery = trpc.token.getKline.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase(), range: listingRange },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenHoldersQuery = trpc.token.getHoldersView.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase(), timeframe: positionTimeframe },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenFundingQuery = trpc.token.getFundingView.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase() },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenDepthQuery = trpc.token.getDepthView.useQuery(
    { symbol: (coinId ?? fallbackToken.symbol).toUpperCase(), marketType: depthMarketType },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenDepthTrendQuery = trpc.token.getDepthTrend.useQuery(
    {
      symbol: (coinId ?? fallbackToken.symbol).toUpperCase(),
      days: depthRange,
      marketType: depthMarketType,
    },
    { enabled: Boolean(coinId ?? fallbackToken.symbol) }
  );
  const tokenProfile = tokenProfileQuery.data;
  const token = {
    ...fallbackToken,
    symbol: tokenProfile?.symbol ?? fallbackToken.symbol,
    name: tokenProfile?.name ?? fallbackToken.name,
    price: tokenProfile?.currentPrice ?? fallbackToken.price,
    totalSupply: tokenProfile ? formatSupplyValue(tokenProfile.totalSupply) : fallbackToken.totalSupply,
    circulatingSupply: tokenProfile ? formatSupplyValue(tokenProfile.circulatingSupply) : fallbackToken.circulatingSupply,
    fdv: tokenProfile ? formatMetricValue(tokenProfile.fdv) : fallbackToken.fdv,
    marketCap: tokenProfile ? formatMetricValue(tokenProfile.marketCap) : fallbackToken.marketCap,
    volume24h: tokenProfile ? formatMetricValue(tokenProfile.volume24h) : fallbackToken.volume24h,
    logoText: (tokenProfile?.symbol?.[0] || fallbackToken.logoText || "?").slice(0, 2).toUpperCase(),
  };
  const primaryAddress = tokenProfile?.addresses[0];
  const tokenTags = tokenProfile?.coinTags.length
    ? tokenProfile.coinTags
    : ["DeFi", "Layer 1", "Smart Contracts", "Interoperability"];
  const tokenLinks: Array<{ label: string; href: string; icon: LucideIcon }> = [
    ...(tokenProfile?.website ? [{ label: "Website", href: tokenProfile.website, icon: Globe }] : []),
    ...(tokenProfile?.coinMarketCapId
      ? [
          {
            label: "CoinMarketCap",
            href: `https://coinmarketcap.com/currencies/${tokenProfile.coinMarketCapId}/`,
            icon: ExternalLink,
          },
        ]
      : []),
    ...(tokenProfile?.coinGeckoId
      ? [
          {
            label: "CoinGecko",
            href: `https://www.coingecko.com/en/coins/${tokenProfile.coinGeckoId}`,
            icon: ExternalLink,
          },
        ]
      : []),
    ...(tokenProfile?.whitepaperUrl
      ? [{ label: "Whitepaper", href: tokenProfile.whitepaperUrl, icon: ExternalLink }]
      : []),
  ];
  const latestAnnouncements = tokenProfile?.latestAnnouncements.length
    ? tokenProfile.latestAnnouncements
    : [
        { id: 1, title: `${token.symbol} 上线 Binance 现货`, publishedAt: "2025-03-15", type: "listing" as const, url: "#" },
        { id: 2, title: `${token.symbol} Launchpool 活动开启`, publishedAt: "2025-02-28", type: "event" as const, url: "#" },
        { id: 3, title: `${token.symbol} 上线 OKX 合约`, publishedAt: "2025-02-10", type: "listing" as const, url: "#" },
      ];
  const volumeToMarketCap =
    tokenProfile?.volume24h != null && tokenProfile?.marketCap
      ? (tokenProfile.volume24h / tokenProfile.marketCap) * 100
      : null;
  const unlockCategories = tokenUnlockQuery.data?.categories ?? [];
  const unlockRows = tokenUnlockQuery.data?.rows ?? [];
  const listingTimelineItems = tokenListingQuery.data?.items.length
    ? tokenListingQuery.data.items.map((item, index) => ({
        id: item.id,
        exchange: item.exchangeName,
        tag:
          item.eventType === "listing"
            ? item.marketType === "spot"
              ? "现货"
              : item.marketType === "perps"
                ? "合约"
                : item.marketType === "alpha"
                  ? "Alpha"
                  : item.marketType ?? "上币"
            : "活动",
        date: formatListingDateTime(item.date),
        price: item.eventType === "listing" ? formatListingMetric(item.priceAtList) : item.rewardAmount != null ? `${item.rewardAmount.toLocaleString()} ${item.rewardToken ?? ""}`.trim() : "—",
        fdv: item.eventType === "listing" ? formatListingMetric(item.fdvAtList) : item.estimatedValue != null ? formatMetricValue(item.estimatedValue) : "—",
        link: item.url,
        side: index % 2 === 0 ? "left" : "right",
        color: item.eventType === "listing" ? "#22c55e" : "#f4b000",
        logo: item.exchangeName.slice(0, 2).toUpperCase(),
        logoUrl: item.exchangeLogoUrl,
        logoTone: item.eventType === "listing" ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#fef3c7] text-[#b45309]",
        title: item.title,
        isActivity: item.eventType === "activity",
        marketCap: item.eventType === "listing" ? formatListingMetric(item.marketCapAtList) : "—",
        rawDate: item.date,
        chartPrice:
          item.eventType === "listing"
            ? Number(item.priceAtList ?? tokenProfile?.currentPrice ?? token.price)
            : Number(tokenProfile?.currentPrice ?? token.price),
      }))
    : listingTimelineRows.map(item => ({
        ...item,
        title: item.exchange,
        isActivity: item.tag !== "现货",
        marketCap: "—",
        rawDate: null,
        chartPrice: Number(token.price),
      }));
  const listingChartGroups = useMemo(() => {
    const grouped = new Map<
      string,
      {
        key: string;
        date: string;
        rawDate: string | null;
        price: number;
        items: typeof listingTimelineItems;
        markerType: "listing" | "activity" | "multi";
      }
    >();

    listingTimelineItems.forEach(item => {
      const key = toDateKey(item.rawDate) ?? item.id;
      const current = grouped.get(key);
      if (current) {
        current.items.push(item);
        if (!current.date || current.date === "—") current.date = formatChartShortDate(item.rawDate);
        if (item.chartPrice && !Number.isNaN(item.chartPrice)) current.price = item.chartPrice;
        const hasListing = current.items.some(entry => !entry.isActivity);
        const hasActivity = current.items.some(entry => entry.isActivity);
        current.markerType = hasListing && hasActivity ? "multi" : hasListing ? "listing" : "activity";
        return;
      }

      grouped.set(key, {
        key,
        date: formatChartShortDate(item.rawDate),
        rawDate: item.rawDate,
        price: item.chartPrice && !Number.isNaN(item.chartPrice) ? item.chartPrice : Number(token.price),
        items: [item],
        markerType: item.isActivity ? "activity" : "listing",
      });
    });

    return Array.from(grouped.values()).sort((left, right) => {
      const leftTime = left.rawDate ? new Date(left.rawDate).getTime() : 0;
      const rightTime = right.rawDate ? new Date(right.rawDate).getTime() : 0;
      return leftTime - rightTime;
    });
  }, [listingTimelineItems, token.price]);
  const listingChartData = listingChartGroups.map(group => ({
    key: group.key,
    date: group.rawDate ? formatListingDateTime(group.rawDate) : group.date,
    axisLabel: group.date,
    rawDate: group.rawDate,
    price: group.price,
    eventY: group.price,
    markerType: group.markerType,
    items: group.items.map(item => ({
      id: item.id,
      exchange: item.exchange,
      tag: item.tag,
      title: item.title,
      markerType: (item.isActivity ? "activity" : "listing") as "listing" | "activity" | "multi",
    })),
  }));
  const listingTrendSeries = useMemo(
    () => buildListingTrendSeries(tokenKlineQuery.data?.points ?? [], listingChartData, Number(token.price) || 0.01),
    [listingChartData, token.price, tokenKlineQuery.data?.points]
  );
  const listingPriceSeries = useMemo(
    () => buildListingPriceSeries(tokenKlineQuery.data?.points ?? [], Number(token.price) || 0.01),
    [token.price, tokenKlineQuery.data?.points]
  );
  const listingHistoryStart = listingPriceSeries[0]?.rawDate ?? null;
  const listingHistoryEnd = listingPriceSeries.at(-1)?.rawDate ?? null;
  const depthItems = tokenDepthQuery.data?.items ?? [];
  const depthTrendPoints = tokenDepthTrendQuery.data?.points ?? [];
  const totalDepthVolume = depthItems.reduce((sum, item) => sum + (item.volume24h ?? 0), 0);
  const depthOverview = tokenDepthTrendQuery.data?.summary;
  const realCoverageDays = depthTrendPoints.length;
  const depthAnchorDate =
    depthTrendPoints
      .map(point => toDateKey(point.snapshotDate))
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? depthOverview?.latestSnapshotTs ?? null;
  const priceVolumeChartData =
    depthTrendPoints.length > 0
      ? buildDepthRangeSeries(
          depthTrendPoints.map(point => ({
            snapshotDate: point.snapshotDate,
            totalDepth: Number(point.totalDepthBuy2 ?? 0) + Number(point.totalDepthSell2 ?? 0),
            totalVolume: point.totalVolume != null ? Number(point.totalVolume) : null,
          })),
          depthRange,
          depthAnchorDate
        )
      : buildDepthRangeSeries([], depthRange, depthOverview?.latestSnapshotTs ?? null);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    params.set("tab", activeTab);
    if (activeTab === "depth") {
      params.set("depthRange", `${depthRange}`);
      params.set("depthMarket", depthMarketType);
    } else {
      params.delete("depthRange");
      params.delete("depthMarket");
    }

    const currentUrl = typeof window !== "undefined" ? `${window.location.pathname}${window.location.search}` : location;
    const nextUrl = `${location.split("?")[0]}?${params.toString()}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeTab, depthRange, depthMarketType, location]);

  const marketRows =
    depthItems.length > 0
      ? depthItems.map((item, index) => ({
          id: `${item.exchangeId}-${index}`,
          exchangeId: item.exchangeName.toLowerCase().replace(/\s+/g, "-"),
          exchange: item.exchangeName,
          exchangeLogoUrl: item.exchangeLogoUrl,
          marketType: formatMarketTypeLabel(item.marketType),
          pair: item.pairName ?? `${token.symbol}/${item.quoteCurrency ?? "USDT"}`,
          price: item.price,
          volume24h: item.volume24h,
          volumeRatio: totalDepthVolume > 0 ? ((item.volume24h ?? 0) / totalDepthVolume) * 100 : null,
          depthBuy2: item.depthBuy2,
          depthSell2: item.depthSell2,
          fundingRate: item.fundingRate,
          openInterest: item.openInterest,
        }))
      : token.exchanges.map((exchange, index) => ({
          id: `${exchange.name}-${index}`,
          exchangeId: exchange.name.toLowerCase().replace(/\s+/g, "-"),
          exchange: exchange.name,
          exchangeLogoUrl: null,
          marketType: formatMarketTypeLabel(exchange.type),
          pair: `${token.symbol}/USDT`,
          price: token.price,
          volume24h: 25_529_217.73 + index * 19_200_000,
          volumeRatio: 7.99 + index * 6.4,
          depthBuy2: null,
          depthSell2: null,
          fundingRate: null,
          openInterest: null,
        }));

  const holdersSeries = tokenHoldersQuery.data?.series ?? [];
  const holdersItems = tokenHoldersQuery.data?.items ?? [];
  const positionSeries = holdersSeries.map((point, index) => ({
    id: `${point.snapshotDate}-${index}`,
    label: formatPositionAxisLabel(point.snapshotDate, positionTimeframe),
    totalOpenInterest: point.totalOpenInterest ?? 0,
    fundingRate: point.fundingRate ?? 0,
  }));
  const holdersTotalOpenInterest = holdersItems.reduce((sum, item) => sum + (item.openInterest ?? 0), 0);
  const holdersWithOpenInterestCount = holdersItems.filter(item => (item.openInterest ?? 0) > 0).length;
  const latestFundingRate = holdersSeries.at(-1)?.fundingRate ?? null;
  const positionRows = holdersItems.map((row, index) => ({
    id: `${row.exchangeId}-${index}`,
    exchangeId: row.exchangeName.toLowerCase().replace(/\s+/g, "-"),
    exchange: row.exchangeName,
    exchangeLogoUrl: row.exchangeLogoUrl,
    marketType: formatMarketTypeLabel(row.marketType),
    pair: row.pairName ?? `${token.symbol}/USDT`,
    price: row.price,
    volume24h: row.volume24h,
    marketShare: row.marketShare,
    fundingRate: row.fundingRate,
    openInterest: row.openInterest,
  }));

  const fundingSummary = tokenFundingQuery.data?.summary;
  const fundingRounds = tokenFundingQuery.data?.rounds ?? [];
  const teamMembers = tokenFundingQuery.data?.teamMembers ?? [];

  const detailTabs: Array<{ id: "listing" | "depth" | "unlock" | "onchain" | "holders" | "funding"; label: string; icon: LucideIcon }> = [
    { id: "listing", label: "上市策略", icon: Clock3 },
    { id: "depth", label: "市场深度", icon: BarChart3 },
    { id: "unlock", label: "代币解锁", icon: Package },
    { id: "onchain", label: "链上数据", icon: GitBranch },
    { id: "holders", label: "合约持仓信息", icon: Users },
    { id: "funding", label: "投融资 / 团队", icon: Activity },
  ];

  const isPrimaryDetailLoading =
    tokenProfileQuery.isLoading && !tokenProfileQuery.data && !tokenProfileQuery.isError;

  return (
    <div className="space-y-6">
      <Link href="/market" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        返回总览
      </Link>

      <div className="grid gap-6 xl:grid-cols-[340px_1fr]">
        {isPrimaryDetailLoading ? (
          <>
            <aside className="space-y-6 rounded-[28px] border border-white/70 bg-white/78 p-6 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
              <div className="h-24 animate-pulse rounded-2xl bg-[#eef2f6]" />
              <div className="space-y-3 border-t border-[#e7edf4] pt-5">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="h-6 animate-pulse rounded-xl bg-[#eef2f6]" />
                ))}
              </div>
            </aside>
            <main className="space-y-6">
              <div className="rounded-[28px] border border-white/70 bg-white/78 p-6 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <div className="h-10 w-56 animate-pulse rounded-xl bg-[#eef2f6]" />
                <div className="mt-4 h-6 w-full animate-pulse rounded-xl bg-[#eef2f6]" />
                <div className="mt-6 flex gap-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div key={index} className="h-11 w-28 animate-pulse rounded-full bg-[#eef2f6]" />
                  ))}
                </div>
              </div>
              <div className="rounded-[28px] border border-white/70 bg-white/78 p-6 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <div className="h-[420px] animate-pulse rounded-[22px] bg-[#eef2f6]" />
              </div>
            </main>
          </>
        ) : (
          <>
        <aside className="space-y-6 rounded-[28px] border border-white/70 bg-white/78 p-6 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
          {tokenProfileQuery.isError ? (
            <div className="rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
              详情数据加载失败：{tokenProfileQuery.error.message}
            </div>
          ) : null}
          <div className="flex items-start gap-4">
            <AssetLogo
              src={tokenProfile?.logoUrl}
              alt={token.symbol}
              fallback={token.logoText}
              className="h-16 w-16 rounded-[22px]"
            />
            <div>
              <div className="text-[3rem] font-semibold leading-none tracking-tight text-[oklch(var(--crypto-ink))]">
                {formatCompactPrice(token.price)}
              </div>
              <div className="mt-3 text-[1.75rem] font-semibold leading-none text-[oklch(var(--crypto-green))]">
                {tokenProfile?.priceChange7d != null
                  ? `${tokenProfile.priceChange7d >= 0 ? "+" : ""}${tokenProfile.priceChange7d.toFixed(2)}% (7D)`
                  : "+35.17% (All)"}
              </div>
            </div>
          </div>

          <div className="space-y-3 border-t border-[#e7edf4] pt-5 text-[15px]">
            {[
              ["流通市值", token.marketCap],
              ["FDV", token.fdv],
              ["24h 交易量", token.volume24h],
              ["量/市值", formatPercentValue(volumeToMarketCap)],
              ["总供应量", token.totalSupply],
              ["最大供应量", token.totalSupply],
              ["流通供应量", token.circulatingSupply],
              ["持有者", formatHolderCount(tokenProfile?.tokenHolderCount ?? null)],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[100px_1fr] items-center gap-3">
                <span className="text-[15px] text-muted-foreground">{label}</span>
                <span className="text-right text-[17px] font-medium text-[oklch(var(--crypto-ink))]">{value}</span>
              </div>
            ))}
          </div>

          <div className="space-y-5 border-t border-[#e7edf4] pt-5">
            <div>
              <div className="mb-3 text-[15px] font-semibold text-muted-foreground">行业 / 赛道</div>
              <div className="flex flex-wrap gap-2.5">
                {tokenTags.map(item => (
                  <Badge key={item} variant="secondary" className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-[13px] font-medium">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="space-y-3 border-t border-[#eef2f6] pt-5">
              <div className="text-[15px] font-semibold text-muted-foreground">链接</div>
              <div className="flex flex-wrap gap-2.5">
                {tokenLinks.length > 0 ? (
                  tokenLinks.map(item => {
                    const Icon = item.icon;
                    return (
                      <a
                        key={item.label}
                        className="inline-flex w-fit items-center gap-2 rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-2 text-sm font-medium text-[oklch(var(--crypto-ink))]"
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Icon className="h-4 w-4" />
                        {item.label}
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    );
                  })
                ) : (
                  <div className="text-sm text-muted-foreground">暂无外部链接数据</div>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-[oklch(var(--crypto-ink))]">
                  <Link2 className="h-4 w-4" />
                  Contracts
                </div>
                <div className="rounded-xl bg-[oklch(var(--crypto-panel-soft))] px-3 py-2.5 font-mono text-sm text-[oklch(var(--crypto-ink))]">
                  {primaryAddress ? shortAddress(primaryAddress.address) : "—"}
                </div>
                <div className="flex items-center gap-2 text-sm text-[oklch(var(--crypto-ink))]">
                  <ExternalLink className="h-4 w-4" />
                  {primaryAddress?.chainName || "Block Explorer"}
                </div>
              </div>
            </div>

            <div className="border-t border-[#eef2f6] pt-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[15px] font-semibold text-muted-foreground">最新公告</div>
                <Button variant="ghost" className="h-auto p-0 text-sm text-muted-foreground">
                  查看全部
                </Button>
              </div>
              <div className="space-y-3">
                {latestAnnouncements.map(item => (
                  <div key={`${item.id}-${item.title}`} className="rounded-2xl bg-[oklch(var(--crypto-panel-soft))] px-3 py-3.5">
                    <div className="flex items-start gap-2 text-sm font-medium text-[oklch(var(--crypto-ink))]">
                      <span className={cn("mt-1 text-[10px]", item.type === "listing" ? "text-[oklch(var(--crypto-green))]" : "text-[oklch(var(--crypto-gold))]")}>
                        ●
                      </span>
                      <span className="leading-6">{item.title}</span>
                    </div>
                    <div className="mt-2 pl-4 text-sm text-muted-foreground">{formatAnnouncementDate(item.publishedAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <main className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              <AssetLogo
                src={tokenProfile?.logoUrl}
                alt={token.symbol}
                fallback={token.logoText}
                className="h-16 w-16 rounded-2xl"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <h1 className="text-4xl font-semibold text-[oklch(var(--crypto-ink))]">{token.name}</h1>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    {token.symbol}
                  </Badge>
                </div>
                <div className="mt-2 text-lg text-muted-foreground">
                  {tokenProfile?.description
                    ? tokenProfile.description.slice(0, 180)
                    : `${token.name} market depth, short-term price trend, and venue-level liquidity overview.`}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {detailTabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium",
                    activeTab === id
                      ? "border-[#0f66d8] bg-white text-[#0f66d8] shadow-[0_0_0_2px_rgba(15,102,216,0.1)]"
                      : "border-white/70 bg-white/85 text-[oklch(var(--crypto-ink))]"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "depth" && (
            <>
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-full border border-[#d8e0eb] bg-white/70 p-1">
                  {[
                    { value: "spot", label: "现货" },
                    { value: "perps", label: "合约" },
                  ].map(option => (
                    <button
                      key={option.value}
                      onClick={() => setDepthMarketType(option.value as "spot" | "perps")}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-xs font-medium transition",
                        depthMarketType === option.value
                          ? "bg-[#0f66d8] text-white"
                          : "text-muted-foreground hover:text-[oklch(var(--crypto-ink))]"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <h2 className="text-[1.55rem] font-semibold text-[oklch(var(--crypto-ink))]">价格与成交量概览</h2>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {[30, 90, 180, 365].map(days => (
                        <button
                          key={days}
                          onClick={() => setDepthRange(days as 30 | 90 | 180 | 365)}
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                            depthRange === days
                              ? "border-[#0f66d8] bg-white text-[#0f66d8] shadow-[0_0_0_2px_rgba(15,102,216,0.08)]"
                              : "border-[#d8e0eb] bg-white/70 text-muted-foreground hover:border-[#b9c6d8] hover:text-[oklch(var(--crypto-ink))]"
                          )}
                        >
                          {days === 30 ? "1个月" : days === 90 ? "3个月" : days === 180 ? "6个月" : "1年"}
                        </button>
                      ))}
                      {tokenDepthTrendQuery.data?.summary.latestSnapshotTs ? (
                        <div className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-xs font-medium text-muted-foreground">
                          更新于 {formatListingDateTime(tokenDepthTrendQuery.data.summary.latestSnapshotTs)}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {tokenDepthTrendQuery.isError ? (
                    <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
                      价格与成交量数据加载失败：{tokenDepthTrendQuery.error.message}
                    </div>
                  ) : null}

                  <div className="mb-5 grid gap-3 md:grid-cols-4">
                    {[
                      ["最新价格", depthOverview?.latestPrice != null ? formatCompactPrice(depthOverview.latestPrice) : formatCompactPrice(token.price)],
                      [
                        "24h 成交量",
                        depthOverview?.totalVolume24h != null
                          ? formatDepthMoney(depthOverview.totalVolume24h)
                          : token.volume24h,
                      ],
                      ["买盘深度", formatDepthMoney(depthOverview?.totalDepthBuy2 ?? null)],
                      ["卖盘深度", formatDepthMoney(depthOverview?.totalDepthSell2 ?? null)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-[#e7edf4] bg-white/70 px-4 py-3">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
                        <div className="mt-2 text-xl font-semibold text-[oklch(var(--crypto-ink))]">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] border border-[#e7edf4] bg-white/70 p-4">
                      <div className="mb-3 text-base font-semibold text-[oklch(var(--crypto-ink))]">总深度趋势</div>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={priceVolumeChartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="#eef2f6" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" minTickGap={24} tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis
                              tick={{ fill: "#667085", fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={value => (value == null ? "—" : formatMetricValue(value).replace("$", ""))}
                            />
                            <Tooltip formatter={(value: unknown) => (typeof value === "number" ? formatMetricValue(value) : "—")} />
                            <Line
                              type="monotone"
                              dataKey="totalDepth"
                              stroke="#0f66d8"
                              strokeWidth={2.5}
                              dot={{ r: 3, strokeWidth: 2, fill: "#ffffff" }}
                              activeDot={{ r: 5 }}
                              connectNulls
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    <div className="rounded-[24px] border border-[#e7edf4] bg-white/70 p-4">
                      <div className="mb-3 text-base font-semibold text-[oklch(var(--crypto-ink))]">成交量趋势</div>
                      <div className="h-[220px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={priceVolumeChartData} margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                            <CartesianGrid stroke="#eef2f6" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" minTickGap={24} tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis
                              tick={{ fill: "#667085", fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                              tickFormatter={value => (value == null ? "—" : formatMetricValue(value).replace("$", ""))}
                            />
                            <Tooltip formatter={(value: unknown) => (typeof value === "number" ? formatMetricValue(value) : "—")} />
                            <Bar dataKey="volume" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5">
                    <h2 className="text-[1.55rem] font-semibold text-[oklch(var(--crypto-ink))]">交易所市场深度</h2>
                  </div>
                  {tokenDepthQuery.isError ? (
                    <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
                      深度数据加载失败：{tokenDepthQuery.error.message}
                    </div>
                  ) : null}
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                        <tr>
                          <th className="px-3 py-4">#</th>
                          <th className="px-3 py-4">交易所</th>
                          <th className="px-3 py-4">市场</th>
                          <th className="px-3 py-4">交易对</th>
                          <th className="px-3 py-4">当前价格</th>
                          <th className="px-3 py-4">24h交易量</th>
                          <th className="px-3 py-4">买盘深度</th>
                          <th className="px-3 py-4">卖盘深度</th>
                          {depthMarketType === "perps" ? <th className="px-3 py-4">资金费率 / OI</th> : null}
                          <th className="px-3 py-4 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenDepthQuery.isLoading ? (
                          <tr>
                            <td colSpan={depthMarketType === "perps" ? 10 : 9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                              市场深度加载中...
                            </td>
                          </tr>
                        ) : marketRows.length === 0 ? (
                          <tr>
                            <td colSpan={depthMarketType === "perps" ? 10 : 9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                              当前币种暂无{depthMarketType === "spot" ? "现货" : "合约"}市场深度数据
                            </td>
                          </tr>
                        ) : (
                          marketRows.map((row, index) => (
                            <tr key={row.id} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                              <td className="px-3 py-4">{index + 1}</td>
                              <td className="px-3 py-4">
                                <div className="flex items-center gap-2 font-medium">
                                  <AssetLogo
                                    src={row.exchangeLogoUrl}
                                    alt={row.exchange}
                                    fallback={row.exchange.slice(0, 1).toUpperCase()}
                                    className="h-6 w-6"
                                  />
                                  <span>{row.exchange}</span>
                                </div>
                              </td>
                              <td className="px-3 py-4">{row.marketType}</td>
                              <td className="px-3 py-4">{row.pair}</td>
                              <td className="px-3 py-4">{row.price != null ? formatCompactPrice(row.price) : "—"}</td>
                              <td className="px-3 py-4">
                                <div>{formatDepthMoney(row.volume24h)}</div>
                                <div className="mt-1 text-xs text-muted-foreground">{formatPercentValue(row.volumeRatio)}</div>
                              </td>
                              <td className="px-3 py-4">{formatDepthMoney(row.depthBuy2)}</td>
                              <td className="px-3 py-4">{formatDepthMoney(row.depthSell2)}</td>
                              {depthMarketType === "perps" ? (
                                <td className="px-3 py-4">
                                  <div>{row.fundingRate != null ? formatFundingRate(row.fundingRate) : "—"}</div>
                                  <div className="mt-1 text-xs text-muted-foreground">{formatDepthMoney(row.openInterest)}</div>
                                </td>
                              ) : null}
                              <td className="px-3 py-4 text-right">
                                <button
                                  className="font-medium text-[#101828] hover:text-[#0f66d8]"
                                  onClick={() => setLocation(`/depth/${row.exchangeId}/${normalizedId}?tab=depth&depthRange=${depthRange}&depthMarket=${depthMarketType}`)}
                                >
                                  查看深度
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "listing" && (
            <>
              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-[1.15rem] font-semibold text-[oklch(var(--crypto-ink))]">价格趋势 & 事件标记</h2>
                      <div className="mt-2 text-muted-foreground">真实价格趋势来自 CMC，事件点会落在对应时间附近的价格节点上</div>
                      {listingHistoryStart ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          当前仅有 {formatListingDateTime(listingHistoryStart)} 至 {formatListingDateTime(listingHistoryEnd)} 的价格历史
                        </div>
                      ) : null}
                    </div>
                    <div className="inline-flex rounded-2xl border border-[#dbe3ef] bg-[#f8fafc] p-1">
                      {[
                        { value: "1m", label: "1个月" },
                        { value: "3m", label: "3个月" },
                        { value: "6m", label: "6个月" },
                        { value: "1y", label: "1年" },
                      ].map(option => (
                        <button
                          key={option.value}
                          onClick={() => setListingRange(option.value as "1m" | "3m" | "6m" | "1y")}
                          className={cn(
                            "inline-flex items-center rounded-xl px-4 py-2 text-sm font-medium transition",
                            listingRange === option.value ? "bg-white text-[#101828] shadow-sm" : "text-[#667085]"
                          )}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {tokenKlineQuery.isError ? (
                    <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
                      价格趋势加载失败：{tokenKlineQuery.error.message}
                    </div>
                  ) : null}
                  {tokenKlineQuery.isLoading ? (
                    <div className="rounded-[24px] border border-[#e7edf4] bg-white/70 px-5 py-10 text-center text-sm text-muted-foreground">
                      正在加载价格趋势...
                    </div>
                  ) : listingPriceSeries.length === 0 ? (
                    <div className="rounded-[24px] border border-[#e7edf4] bg-white/70 px-5 py-10 text-center text-sm text-muted-foreground">
                      当前币种暂无可用的价格趋势数据
                    </div>
                  ) : (
                    <div className="h-[340px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={listingTrendSeries} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
                          <defs>
                            <linearGradient id="listingArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#cfd4dc" stopOpacity={0.95} />
                              <stop offset="100%" stopColor="#f7f9fc" stopOpacity={0.65} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="#edf2f7" strokeDasharray="3 3" vertical={false} />
                          <XAxis
                            dataKey="axisLabel"
                            minTickGap={28}
                            tick={{ fill: "#667085", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tick={{ fill: "#667085", fontSize: 12 }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={value => formatCompactPrice(Number(value))}
                            domain={["auto", "auto"]}
                          />
                          <Tooltip cursor={false} content={<ListingChartTooltip />} />
                          <Area type="monotone" dataKey="price" stroke="transparent" fill="url(#listingArea)" />
                          <Line
                            type="monotone"
                            dataKey="price"
                            stroke="#98a2b3"
                            strokeWidth={2.5}
                            dot={(props: any) => {
                              const { cx, cy, payload } = props;
                              if (typeof cx !== "number" || typeof cy !== "number" || !payload?.markerType || !payload?.items?.length) {
                                return <g />;
                              }
                              const fill =
                                payload.markerType === "listing"
                                  ? "#22c55e"
                                  : payload.markerType === "activity"
                                    ? "#f4b000"
                                    : "#3b82f6";

                              return <circle cx={cx} cy={cy} r={6.5} fill={fill} stroke="#ffffff" strokeWidth={2.5} />;
                            }}
                            activeDot={{ r: 4, fill: "#98a2b3", stroke: "#ffffff", strokeWidth: 2 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-[1.15rem] font-semibold text-[oklch(var(--crypto-ink))]">上市历程 & 活动事件</h2>
                      <div className="mt-2 text-muted-foreground">默认按真实列表查看，时间线作为辅助浏览模式</div>
                    </div>
                    <div className="inline-flex rounded-2xl border border-[#dbe3ef] bg-[#f8fafc] p-1">
                      <button
                        onClick={() => setListingView("timeline")}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                          listingView === "timeline" ? "bg-white text-[#101828] shadow-sm" : "text-[#667085]"
                        )}
                      >
                        <ScanLine className="h-4 w-4" />
                        时间线
                      </button>
                      <button
                        onClick={() => setListingView("list")}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition",
                          listingView === "list" ? "bg-white text-[#101828] shadow-sm" : "text-[#667085]"
                        )}
                      >
                        <List className="h-4 w-4" />
                        列表
                      </button>
                    </div>
                  </div>

                  {listingView === "timeline" ? (
                    <div className="relative mx-auto max-w-[980px] py-4">
                      <div className="absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-[#d6deea] lg:block" />
                      <div className="space-y-8">
                        {listingTimelineItems.map(item => (
                          <div
                            key={item.id}
                            className={cn(
                              "relative grid gap-4 lg:grid-cols-2 lg:items-start",
                              item.side === "right" && "lg:[&>div:first-child]:order-2 lg:[&>div:last-child]:order-1"
                            )}
                          >
                            <div className={cn("hidden lg:block", item.side === "left" ? "lg:pr-12" : "lg:pl-12")} />
                            <div className={cn(item.side === "left" ? "lg:pr-12" : "lg:pl-12")}>
                              <div className="rounded-[22px] border border-[#dbe3ef] bg-white p-5 shadow-[0_10px_24px_rgba(83,102,138,0.06)]">
                                <div className="flex items-center gap-3">
                                  <AssetLogo
                                    src={item.logoUrl}
                                    alt={item.exchange}
                                    fallback={item.logo}
                                    className="h-8 w-8"
                                  />
                                  <div className="text-[1.05rem] font-semibold leading-none text-[oklch(var(--crypto-ink))]">
                                    {item.exchange}
                                  </div>
                                  <Badge
                                    className={cn(
                                      "rounded-full px-2.5 py-0.5",
                                      item.isActivity
                                        ? "bg-[#fff4d6] text-[#b54708] hover:bg-[#fff4d6]"
                                        : "bg-[#e8f1ff] text-[#175cd3] hover:bg-[#e8f1ff]"
                                    )}
                                  >
                                    {item.tag}
                                  </Badge>
                                </div>
                                <div className="mt-4 text-sm text-[#475467]">{item.date}</div>
                                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                  <div>
                                    <div className="text-sm text-muted-foreground">{item.isActivity ? "奖励 / 数量" : "上线价格"}</div>
                                    <div className="mt-1 text-[1.05rem] font-semibold text-[oklch(var(--crypto-ink))]">{item.price}</div>
                                  </div>
                                  <div>
                                    <div className="text-sm text-muted-foreground">{item.isActivity ? "预估价值" : "上线时FDV"}</div>
                                    <div className="mt-1 text-[1.05rem] font-semibold text-[oklch(var(--crypto-ink))]">{item.fdv}</div>
                                  </div>
                                </div>
                                <div className="mt-4 text-sm leading-6 text-[#475467]">{item.title}</div>
                                {item.link ? (
                                  <a href={item.link} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm text-[#101828]">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                ) : null}
                              </div>
                            </div>
                            <span
                              className="absolute left-1/2 top-5 hidden h-3 w-3 -translate-x-1/2 rounded-full border-4 border-[#f4f7fb] lg:block"
                              style={{ backgroundColor: item.color }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                          <tr>
                            <th className="px-4 py-4">交易所</th>
                            <th className="px-4 py-4">类型</th>
                            <th className="px-4 py-4">时间</th>
                            <th className="px-4 py-4">价格 / 奖励</th>
                            <th className="px-4 py-4">FDV / 预估价值</th>
                            <th className="px-4 py-4">市值 / 说明</th>
                            <th className="px-4 py-4 text-right">公告</th>
                          </tr>
                        </thead>
                        <tbody>
                          {listingTimelineItems.map(item => (
                            <tr key={item.id} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-2 font-medium">
                                  <AssetLogo
                                    src={item.logoUrl}
                                    alt={item.exchange}
                                    fallback={item.logo}
                                    className="h-7 w-7"
                                  />
                                  <span>{item.exchange}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <Badge
                                  className={cn(
                                    "rounded-full px-2.5 py-0.5",
                                    item.isActivity
                                      ? "bg-[#fff4d6] text-[#b54708] hover:bg-[#fff4d6]"
                                      : "bg-[#e8f1ff] text-[#175cd3] hover:bg-[#e8f1ff]"
                                  )}
                                >
                                  {item.tag}
                                </Badge>
                              </td>
                              <td className="px-4 py-4">{item.date}</td>
                              <td className="px-4 py-4 font-medium">{item.price}</td>
                              <td className="px-4 py-4">{item.fdv}</td>
                              <td className="px-4 py-4">{item.isActivity ? item.title : item.marketCap}</td>
                              <td className="px-4 py-4 text-right">
                                {item.link ? (
                                  <a href={item.link} target="_blank" rel="noreferrer" className="inline-flex items-center text-[#101828] hover:text-[#0f66d8]">
                                    <ExternalLink className="h-4 w-4" />
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "unlock" && (
            <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
              <CardContent className="p-6">
                <div className="mb-5">
                  <h2 className="text-3xl font-semibold text-[oklch(var(--crypto-ink))]">代币解锁完整表</h2>
                  <div className="mt-2 text-muted-foreground">按日期汇总类别释放量、月度释放总量与累计占比</div>
                </div>
                {tokenUnlockQuery.isError ? (
                  <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
                    解锁数据加载失败：{tokenUnlockQuery.error.message}
                  </div>
                ) : null}
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                      <tr>
                        <th className="px-4 py-4">日期</th>
                        {unlockCategories.map(category => (
                          <th key={category.key} className="px-4 py-4">
                            {category.label} ({category.ratio.toFixed(2)}%)
                          </th>
                        ))}
                        <th className="px-4 py-4">Monthly Total Release</th>
                        <th className="px-4 py-4">Monthly Release %</th>
                        <th className="px-4 py-4">Cumulative Release</th>
                        <th className="px-4 py-4 text-right">Cumulative Release %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tokenUnlockQuery.isLoading ? (
                        <tr>
                          <td colSpan={1 + unlockCategories.length + 4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            正在加载真实解锁数据...
                          </td>
                        </tr>
                      ) : null}
                      {!tokenUnlockQuery.isLoading && unlockRows.length === 0 ? (
                        <tr>
                          <td colSpan={1 + unlockCategories.length + 4} className="px-4 py-10 text-center text-sm text-muted-foreground">
                            当前币种暂无解锁数据
                          </td>
                        </tr>
                      ) : null}
                      {unlockRows.map((row, index) => (
                        <tr key={`${row.unlockDate}-${index}`} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                          <td className="px-4 py-4 font-medium text-[oklch(var(--crypto-ink))]">
                            {formatUnlockDate(row.unlockDate)}
                          </td>
                          {unlockCategories.map(category => (
                            <td key={`${row.unlockDate}-${category.key}`} className="px-4 py-4 font-mono text-[oklch(var(--crypto-ink))]">
                              {formatUnlockAmount(row.categoryValues[category.key] ?? null)}
                            </td>
                          ))}
                          <td className="px-4 py-4 font-mono text-[oklch(var(--crypto-ink))]">
                            {formatUnlockAmount(row.monthlyTotalRelease)}
                          </td>
                          <td className="px-4 py-4 font-mono text-[oklch(var(--crypto-ink))]">
                            {formatUnlockPercent(row.monthlyReleaseRatio)}
                          </td>
                          <td className="px-4 py-4 font-mono text-[oklch(var(--crypto-ink))]">
                            {formatUnlockAmount(row.cumulativeRelease)}
                          </td>
                          <td className="px-4 py-4 text-right font-mono text-[oklch(var(--crypto-ink))]">
                            {formatUnlockPercent(row.cumulativeReleaseRatio)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === "holders" && (
            <>
              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <h2 className="text-[1.55rem] font-semibold text-[oklch(var(--crypto-ink))]">总仓位与资金费率</h2>
                      <div className="mt-2 text-muted-foreground">按不同时间颗粒度查看总仓位变化和资金费率趋势</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        更新于 {tokenHoldersQuery.data?.updatedAt ? formatListingDateTime(tokenHoldersQuery.data.updatedAt) : "—"}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {([
                        ["1h", "1H"],
                        ["4h", "4H"],
                        ["12h", "12H"],
                        ["1d", "1天"],
                      ] as Array<[PositionTimeframe, string]>).map(([value, label]) => (
                        <button
                          key={value}
                          onClick={() => setPositionTimeframe(value)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition",
                            positionTimeframe === value
                              ? "border-[#0f66d8] bg-[#0f66d8] text-white shadow-[0_10px_24px_rgba(15,102,216,0.18)]"
                              : "border-[#d8e0eb] bg-white text-[#344054] hover:border-[#b8c7da]"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {tokenHoldersQuery.isError ? (
                    <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
                      持仓与资金费率数据加载失败：{tokenHoldersQuery.error.message}
                    </div>
                  ) : null}

                  <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {[
                      ["总未平仓量", formatDepthMoney(holdersTotalOpenInterest || null)],
                      ["最新资金费率", latestFundingRate != null ? formatFundingRate(latestFundingRate) : "—"],
                      ["有未平仓合约数", `${holdersWithOpenInterestCount}`],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[22px] border border-[#e7edf4] bg-white/70 px-4 py-3">
                        <div className="text-xs text-muted-foreground">{label}</div>
                        <div className="mt-1 text-xl font-semibold text-[oklch(var(--crypto-ink))]">{value}</div>
                      </div>
                    ))}
                  </div>

                  <div className="h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={positionSeries} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
                        <CartesianGrid stroke="#e8edf4" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis
                          yAxisId="oi"
                          tick={{ fill: "#667085", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={formatCompactMoney}
                        />
                        <YAxis
                          yAxisId="funding"
                          orientation="right"
                          tick={{ fill: "#667085", fontSize: 12 }}
                          axisLine={false}
                          tickLine={false}
                          tickFormatter={formatFundingRate}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) =>
                            name === "总仓位" ? formatCompactMoney(value) : formatFundingRate(value)
                          }
                        />
                        <Line yAxisId="oi" type="monotone" dataKey="totalOpenInterest" name="总仓位" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 4 }} />
                        <Line yAxisId="funding" type="monotone" dataKey="fundingRate" name="资金费率" stroke="#10b981" strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5">
                    <h2 className="text-[1.55rem] font-semibold text-[oklch(var(--crypto-ink))]">交易所持仓信息</h2>
                    <div className="mt-2 text-muted-foreground">各交易所真实返回的交易对、价格、交易量、市场占比、资金费率和未平仓量</div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                        <tr>
                          <th className="px-3 py-4">#</th>
                          <th className="px-3 py-4">交易所</th>
                          <th className="px-3 py-4">市场</th>
                          <th className="px-3 py-4">交易对</th>
                          <th className="px-3 py-4">当前价格</th>
                          <th className="px-3 py-4">24h 交易量</th>
                          <th className="px-3 py-4">市场占比</th>
                          <th className="px-3 py-4">资金费率</th>
                          <th className="px-3 py-4">未平仓量</th>
                          <th className="px-3 py-4 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenHoldersQuery.isLoading ? (
                          <tr>
                            <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                              正在加载真实持仓数据...
                            </td>
                          </tr>
                        ) : null}
                        {!tokenHoldersQuery.isLoading && positionRows.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                              当前币种暂无合约持仓数据
                            </td>
                          </tr>
                        ) : null}
                        {positionRows.map((row, index) => (
                          <tr key={row.id} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                            <td className="px-3 py-4">{index + 1}</td>
                            <td className="px-3 py-4">
                              <div className="flex items-center gap-2 font-medium">
                                <AssetLogo
                                  src={row.exchangeLogoUrl}
                                  alt={row.exchange}
                                  fallback={row.exchange.slice(0, 1).toUpperCase()}
                                  className="h-6 w-6"
                                />
                                <span>{row.exchange}</span>
                              </div>
                            </td>
                            <td className="px-3 py-4">{row.marketType}</td>
                            <td className="px-3 py-4">{row.pair}</td>
                            <td className="px-3 py-4">{row.price != null ? formatCompactPrice(row.price) : "—"}</td>
                            <td className="px-3 py-4">{formatDepthMoney(row.volume24h)}</td>
                            <td className="px-3 py-4">{formatPercentValue(row.marketShare)}</td>
                            <td
                              className={cn(
                                "px-3 py-4 font-medium",
                                (row.fundingRate ?? 0) < 0 ? "text-[#ef4444]" : "text-[oklch(var(--crypto-green))]"
                              )}
                            >
                              {row.fundingRate != null ? formatFundingRate(row.fundingRate) : "—"}
                            </td>
                            <td className="px-3 py-4 font-medium">{formatDepthMoney(row.openInterest)}</td>
                            <td className="px-3 py-4 text-right">
                              <button
                                className="font-medium text-[#101828] hover:text-[#0f66d8]"
                                onClick={() => setLocation(`/positions/${row.exchangeId}/${normalizedId}`)}
                              >
                                查看
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {activeTab === "funding" && (
            <>
              <div className="grid gap-5 xl:grid-cols-3">
                {[
                  { label: "融资总额", value: formatMetricValue(fundingSummary?.totalRaised ?? null), sub: "" },
                  {
                    label: "最近一轮",
                    value: fundingSummary?.latestRound ?? "—",
                    sub: fundingSummary?.latestRoundDate ? formatAnnouncementDate(fundingSummary.latestRoundDate) : "",
                  },
                  { label: "投资机构数", value: `${fundingSummary?.investorCount ?? 0}`, sub: "" },
                ].map(item => (
                  <Card
                    key={item.label}
                    className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]"
                  >
                    <CardContent className="p-6">
                      <div className="text-sm text-muted-foreground">{item.label}</div>
                      <div className="mt-3 text-4xl font-semibold text-[oklch(var(--crypto-ink))]">{item.value}</div>
                      {item.sub ? <div className="mt-2 text-base text-muted-foreground">{item.sub}</div> : null}
                    </CardContent>
                  </Card>
                ))}
              </div>

              {tokenFundingQuery.isError ? (
                <div className="rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
                  投融资 / 团队数据加载失败：{tokenFundingQuery.error.message}
                </div>
              ) : null}

              <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="mb-5">
                    <h2 className="text-3xl font-semibold text-[oklch(var(--crypto-ink))]">融资历史</h2>
                    <div className="mt-2 text-muted-foreground">各轮融资详情及参与机构</div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                        <tr>
                          <th className="px-4 py-4">轮次</th>
                          <th className="px-4 py-4">时间</th>
                          <th className="px-4 py-4">融资金额</th>
                          <th className="px-4 py-4">估值</th>
                          <th className="px-4 py-4">投资机构</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tokenFundingQuery.isLoading ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              正在加载真实融资数据...
                            </td>
                          </tr>
                        ) : null}
                        {!tokenFundingQuery.isLoading && fundingRounds.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              当前币种暂无融资历史数据
                            </td>
                          </tr>
                        ) : null}
                        {fundingRounds.map(row => (
                          <tr key={row.id} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                            <td className="px-4 py-4">
                              <Badge
                                variant="secondary"
                                className="rounded-full border border-[#d8e0eb] bg-white px-3 py-1 text-[13px] font-medium text-[oklch(var(--crypto-ink))]"
                              >
                                {row.roundType ?? row.kind ?? "—"}
                              </Badge>
                            </td>
                            <td className="px-4 py-4 text-[15px] text-[oklch(var(--crypto-ink))]">
                              {row.roundDate ? formatAnnouncementDate(row.roundDate) : "—"}
                            </td>
                            <td className="px-4 py-4 font-mono text-[17px] font-semibold text-[oklch(var(--crypto-ink))]">
                              {formatMetricValue(row.raise)}
                            </td>
                            <td className="px-4 py-4 text-[15px] text-muted-foreground">{formatMetricValue(row.valuation)}</td>
                            <td className="px-4 py-4">
                              {row.roundType === "IEO" ? (
                                <div className="flex flex-wrap gap-2">
                                  {row.ieoPlatform ? (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-[13px] font-medium text-[oklch(var(--crypto-ink))]"
                                    >
                                      Platform: {row.ieoPlatform}
                                    </Badge>
                                  ) : null}
                                  {row.priceUsd != null ? (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-[13px] font-medium text-[oklch(var(--crypto-ink))]"
                                    >
                                      Price: {formatMetricValue(row.priceUsd)}
                                    </Badge>
                                  ) : null}
                                  {row.tokensForSale != null ? (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-[13px] font-medium text-[oklch(var(--crypto-ink))]"
                                    >
                                      Sale: {formatPlainNumber(row.tokensForSale)}
                                    </Badge>
                                  ) : null}
                                  {row.lockupPeriod ? (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-[13px] font-medium text-[oklch(var(--crypto-ink))]"
                                    >
                                      {row.lockupPeriod}
                                    </Badge>
                                  ) : null}
                                  {!row.ieoPlatform && row.priceUsd == null && row.tokensForSale == null && !row.lockupPeriod ? (
                                    <span className="text-sm text-muted-foreground">—</span>
                                  ) : null}
                                </div>
                              ) : row.investors.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {row.investors.map(investor => (
                                    <Badge
                                      key={investor}
                                      variant="secondary"
                                      className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1.5 text-[13px] font-medium text-[oklch(var(--crypto-ink))]"
                                    >
                                      {investor}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              <div className="grid gap-5 xl:grid-cols-3">
                {tokenFundingQuery.isLoading ? (
                  <div className="col-span-full rounded-[28px] border border-white/70 bg-white/78 px-6 py-10 text-center text-sm text-muted-foreground shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                    正在加载真实团队数据...
                  </div>
                ) : null}
                {!tokenFundingQuery.isLoading && teamMembers.length === 0 ? (
                  <div className="col-span-full rounded-[28px] border border-white/70 bg-white/78 px-6 py-10 text-center text-sm text-muted-foreground shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                    当前币种暂无团队成员数据
                  </div>
                ) : null}
                {teamMembers.map(member => (
                  <Card
                    key={member.id}
                    className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]"
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(145deg,#c6dbf7,#9fbfe8)] text-lg font-semibold text-[oklch(var(--crypto-ink))]">
                          {member.name
                            .split(/\s+/)
                            .filter(Boolean)
                            .slice(0, 2)
                            .map(part => part[0]?.toUpperCase() ?? "")
                            .join("") || "?"}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[1.75rem] font-semibold leading-tight text-[oklch(var(--crypto-ink))]">
                            {member.name}
                          </div>
                          <div className="mt-1 text-base text-[oklch(var(--crypto-ink))]">
                            {member.jobs.join(" / ") || (member.isFormer ? "Former Team Member" : "Team Member")}
                          </div>
                          <div className="mt-3 text-sm leading-6 text-muted-foreground">
                            {member.isFormer ? "Former team member" : "Active team member"}
                          </div>
                          <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
                            {member.links.length > 0 ? (
                              member.links.slice(0, 3).map(link => (
                                <a key={`${member.id}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="hover:text-[oklch(var(--crypto-ink))]">
                                  {link.label}
                                </a>
                              ))
                            ) : (
                              <span>—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </main>
          </>
        )}
      </div>
    </div>
  );
}
