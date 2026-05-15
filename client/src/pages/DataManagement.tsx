import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Input } from "@/components/ui/input";
import { exchangeOptions, type MarketType } from "@/features/crypto-ai/market-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { parseUtcDateLike, SHANGHAI_TIME_ZONE } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import {
  Bell,
  ChevronDown,
  ExternalLink,
  Gift,
  List,
  ListFilter,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Star,
  TrendingUp,
} from "lucide-react";

type BoardTab = "coins" | "announcements";
type CoinScope = "all" | "watchlist";
type SortDirection = "asc" | "desc";
type SortField =
  | "rank"
  | "symbol"
  | "listedAt"
  | "price"
  | "totalSupply"
  | "circulatingSupply"
  | "fdv"
  | "marketCap"
  | "volume24h";

type Announcement = {
  id: string;
  title: string;
  exchangeSlug: string | null;
  exchange: string;
  exchangeLabel: string;
  publishedAt: string | null;
  relativeTime: string;
  summary: string;
  url: string | null;
  type: "listing" | "delisting" | "event" | "other";
};

type ListingAnnouncement = {
  id: string;
  symbol: string;
  tokenName: string;
  exchangeName: string;
  exchangeSlug: string | null;
  marketType: string | null;
  pairName: string | null;
  depositTime: string | null;
  listingTime: string | null;
  announcementTitle: string | null;
  announcementUrl: string | null;
  publishedAt: string | null;
};

function formatPrice(value: number) {
  return value >= 1 ? value.toFixed(5) : value.toFixed(6);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = parseUtcDateLike(value);
  if (!date) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("year")}/${get("month")}/${get("day")} ${get("hour")}:${get("minute")}`;
}

function formatCompactAmount(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(digits)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(digits)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(digits)}K`;
  return value.toFixed(digits);
}

function formatCompactCurrency(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function parseDisplayNumber(value: string) {
  if (value === "$0.00" || value === "0") return 0;
  const normalized = value.replace(/[$,]/g, "").trim();
  const suffix = normalized.slice(-1);
  const base =
    suffix === "B" || suffix === "M"
      ? Number.parseFloat(normalized.slice(0, -1))
      : Number.parseFloat(normalized);

  if (Number.isNaN(base)) return 0;
  if (suffix === "B") return base * 1_000_000_000;
  if (suffix === "M") return base * 1_000_000;
  return base;
}

function normalizeExchangeName(value: string) {
  return value.replace(/\s+(Spot|Perps|Tradfi)$/i, "").trim().toLowerCase();
}

function getExchangeDisplayName(value: string) {
  return value.replace(/\s+(Spot|Perps|Tradfi)$/i, "").trim();
}

function getExchangeMarketBadge(rawType: string | null | undefined) {
  const normalized = (rawType ?? "").trim().toLowerCase();
  if (normalized === "perps") return "Perps";
  if (normalized === "spot") return "Spot";
  if (normalized === "alpha") return "Alpha";
  if (normalized === "boost") return "Boost";
  if (normalized === "xlaunch") return "XLaunch";
  if (normalized === "tradfi") return "TradFi";
  return normalized || "Spot";
}

function getExchangeChipLabel(exchange: {
  displayName: string;
  rawType?: string | null;
}) {
  const badge = getExchangeMarketBadge(exchange.rawType);
  if ((exchange.rawType ?? "").trim().toLowerCase() === "perps") {
    return `${exchange.displayName} ${badge}`;
  }
  return exchange.displayName;
}

function getExchangeCompactLabel(rawType: string | null | undefined) {
  return getExchangeMarketBadge(rawType);
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
    <div className={cn("flex items-center justify-center rounded-full bg-white font-semibold text-[#344054]", className)}>
      {fallback}
    </div>
  );
}

function formatAnnouncementExchangeName(exchangeSlug: string | null) {
  const normalized = (exchangeSlug ?? "").trim().toLowerCase();
  if (normalized === "binance") return "Binance";
  if (normalized === "coinbase") return "Coinbase";
  if (normalized === "bitget") return "Bitget";
  if (normalized === "bybit") return "Bybit";
  if (normalized === "gate") return "Gate";
  if (normalized === "kucoin") return "KuCoin";
  if (normalized === "okx") return "OKX";
  if (normalized === "upbit") return "Upbit";
  if (normalized === "bithumb") return "Bithumb";
  if (normalized === "x") return "X";
  if (!normalized) return "未知来源";
  return normalized
    .split(/[-_]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatAnnouncementDateTime(value: string | null) {
  if (!value) return "—";
  const date = parseUtcDateLike(value);
  if (!date) return value;
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`;
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function formatRelativeTime(value: string | null) {
  if (!value) return "—";
  const date = parseUtcDateLike(value);
  if (!date) return "—";

  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes}分钟前`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}小时前`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}天前`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}个月前`;

  return `${Math.floor(diffMonths / 12)}年前`;
}

function formatCountdownOrDateTime(value: string | null) {
  if (!value) return "—";
  const date = parseUtcDateLike(value);
  if (!date) return value;

  const diffMs = date.getTime() - Date.now();
  if (diffMs > 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours >= 24) {
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}天${diffHours % 24}小时后`;
    }
    return `${diffHours}小时${diffMins}分钟后`;
  }

  return formatAnnouncementDateTime(value);
}

function ExchangeSummaryList({
  items,
}: {
  items: Array<{
    name: string;
    displayName: string;
    logoUrl?: string | null;
    rawType?: string | null;
    listingTime?: string | null;
  }>;
}) {
  if (items.length === 0) {
    return <div className="text-xs text-muted-foreground">—</div>;
  }

  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>
        <div className="grid cursor-default grid-cols-2 gap-x-2 gap-y-1.5">
          {items.map(exchange => (
            <div
              key={`${exchange.name}-${exchange.rawType ?? "market"}-${exchange.listingTime ?? "na"}`}
              className="flex min-w-0 items-center gap-1.5 rounded-lg bg-[oklch(var(--crypto-panel-soft))] px-2 py-1.5"
              title={getExchangeChipLabel(exchange)}
            >
              <AssetLogo
                src={exchange.logoUrl}
                alt={exchange.displayName}
                fallback={exchange.displayName.slice(0, 1).toUpperCase()}
                className="h-4 w-4 shrink-0"
              />
              <span className="truncate text-[11px] font-medium text-[oklch(var(--crypto-ink))]">
                {getExchangeCompactLabel(exchange.rawType)}
              </span>
            </div>
          ))}
        </div>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-[320px] border border-[#d8e0eb] bg-white/98 p-3 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
        <div className="text-[12px] font-semibold text-[oklch(var(--crypto-ink))]">上线交易所</div>
        <div className="mt-1 text-[11px] text-muted-foreground">按上线时间倒序，时间展示为 UTC+8，精确到分钟</div>
        <div className="mt-3 space-y-2">
          {items.map(exchange => (
            <div
              key={`${exchange.name}-${exchange.rawType ?? "market"}-${exchange.listingTime ?? "na"}-tooltip`}
              className="flex items-center justify-between gap-3 rounded-lg bg-[#f8fafc] px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <AssetLogo
                  src={exchange.logoUrl}
                  alt={exchange.displayName}
                  fallback={exchange.displayName.slice(0, 1).toUpperCase()}
                  className="h-5 w-5 shrink-0"
                />
                <span className="truncate text-[12px] font-medium text-[oklch(var(--crypto-ink))]">
                  {getExchangeChipLabel(exchange)}
                </span>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-[#475467]">
                {formatDateTime(exchange.listingTime ?? null)}
              </span>
            </div>
          ))}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function matchesSelectedExchange(
  exchangeName: string,
  selectedExchange: string,
  exchangeMarketType: string | null,
  marketType: MarketType,
  strictMarketType = true
) {
  const matchesMarketType =
    !strictMarketType
      ? true
      : marketType === "all"
        ? true
        : marketType === "spot"
        ? ["spot", "alpha", "boost", "xlaunch"].includes(exchangeMarketType ?? "")
        : exchangeMarketType === marketType;

  return (
    normalizeExchangeName(exchangeName) === normalizeExchangeName(selectedExchange) &&
    matchesMarketType
  );
}

function dedupeTokensById(items: any[]) {
  const seen = new Set<number>();
  const deduped: any[] = [];

  for (const item of items) {
    const tokenId = Number(item?.tokenId);
    if (!Number.isFinite(tokenId) || seen.has(tokenId)) continue;
    seen.add(tokenId);
    deduped.push(item);
  }

  return deduped;
}

function getMarketSearchParams() {
  const params = new URLSearchParams(
    typeof window !== "undefined" ? window.location.search : ""
  );

  const tab = params.get("tab");
  const coinScope = params.get("scope");
  const marketType = params.get("marketType");
  const tokenQuery = params.get("query");
  const sortField = params.get("sortField");
  const sortDirection = params.get("sortDirection");
  const selectedExchanges = params
    .get("exchanges")
    ?.split(",")
    .map(item => decodeURIComponent(item).trim())
    .filter(Boolean);

  return {
    tab: tab === "announcements" ? "announcements" : "coins",
    coinScope: coinScope === "watchlist" ? "watchlist" : "all",
    marketType: marketType === "all" || marketType === "perps" ? marketType : "spot",
    tokenQuery: tokenQuery ?? "",
    sortField:
      sortField === "rank" ||
      sortField === "symbol" ||
      sortField === "listedAt" ||
      sortField === "price" ||
      sortField === "totalSupply" ||
      sortField === "circulatingSupply" ||
      sortField === "fdv" ||
      sortField === "marketCap" ||
      sortField === "volume24h"
        ? sortField
        : "listedAt",
    sortDirection: sortDirection === "asc" ? "asc" : "desc",
    selectedExchanges: selectedExchanges ?? [],
  } as const;
}

export default function DataManagement() {
  const [location, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const initialMarketParams = useMemo(() => getMarketSearchParams(), []);
  const [tab, setTab] = useState<BoardTab>(initialMarketParams.tab);
  const [coinScope, setCoinScope] = useState<CoinScope>(initialMarketParams.coinScope);
  const [announcementView, setAnnouncementView] = useState<"card" | "list">("card");
  const [announcementType, setAnnouncementType] = useState<
    "all" | "listing" | "delisting" | "event" | "other"
  >("all");
  const [announcementExchange, setAnnouncementExchange] = useState("全部交易所");
  const [marketType, setMarketType] = useState<MarketType>(initialMarketParams.marketType);
  const [selectedExchanges, setSelectedExchanges] = useState<string[]>(initialMarketParams.selectedExchanges);
  const [tokenQuery, setTokenQuery] = useState(initialMarketParams.tokenQuery);
  const [announcementQuery, setAnnouncementQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>(initialMarketParams.sortField);
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialMarketParams.sortDirection);
  const watchlistQuery = trpc.market.getWatchlist.useQuery();
  const watchlistSymbols = useMemo(
    () => (watchlistQuery.data?.items ?? []).map(item => item.symbol.trim().toUpperCase()).filter(Boolean),
    [watchlistQuery.data?.items]
  );
  const [allLoadedTokens, setAllLoadedTokens] = useState<any[]>([]);
  const [isLoadingMoreTokens, setIsLoadingMoreTokens] = useState(false);
  const [hasLoadedAllTokens, setHasLoadedAllTokens] = useState(false);
  const marketTokenBaseInput = useMemo(
    () => ({
      query: tokenQuery.trim() || undefined,
      symbols: coinScope === "watchlist" ? watchlistSymbols : undefined,
      marketType: coinScope === "watchlist" || marketType === "all" ? undefined : marketType,
      sortBy:
        sortField === "marketCap" || sortField === "volume24h" || sortField === "listedAt"
          ? sortField
          : "listedAt",
      sortOrder: sortDirection,
    }),
    [coinScope, marketType, sortDirection, sortField, tokenQuery, watchlistSymbols]
  );

  const marketTokensQuery = trpc.market.listTokens.useQuery({
    ...marketTokenBaseInput,
    page: 1,
    pageSize: 40,
  });
  const marketTokensErrorMessage =
    marketTokensQuery.error instanceof Error
      ? marketTokensQuery.error.message
      : "市场数据请求失败，请稍后重试。";

  const announcementsQuery = trpc.market.searchAnnouncements.useQuery({
    query: announcementQuery.trim() || undefined,
    limit: 100,
  });
  const announcementsErrorMessage =
    announcementsQuery.error instanceof Error
      ? announcementsQuery.error.message
      : "公告数据请求失败，请稍后重试。";
  const listingAnnouncementsQuery = trpc.market.listRecentListings.useQuery({
    query: announcementQuery.trim() || undefined,
    limit: 100,
  });
  const listingAnnouncementsErrorMessage =
    listingAnnouncementsQuery.error instanceof Error
      ? listingAnnouncementsQuery.error.message
      : "上币监控数据请求失败，请稍后重试。";

  const filteredTokens = useMemo(() => {
    const watchlistSymbolSet = new Set(watchlistSymbols);
    const filtered = allLoadedTokens
      .filter(token => {
        const matchesExchange =
          selectedExchanges.length === 0 ||
          selectedExchanges.every(selectedExchange =>
            token.exchanges.some((exchange: any) =>
              matchesSelectedExchange(
                exchange.exchangeName,
                selectedExchange,
                exchange.marketType,
                marketType,
                coinScope !== "watchlist"
              )
            )
          );

        const matchesScope =
          coinScope === "all" || watchlistSymbolSet.has(token.symbol.trim().toUpperCase());

        return matchesExchange && matchesScope;
      })
      .map((token, index) => ({
        rank: index + 1,
        symbol: token.symbol,
        name: token.name,
        logoUrl: token.logoUrl,
        listedAt: formatDateTime(token.listedAt),
        price: token.price ?? 0,
        totalSupply: formatCompactAmount(token.totalSupply),
        circulatingSupply: formatCompactAmount(token.circulatingSupply),
        fdv: formatCompactCurrency(token.fdv),
        marketCap: formatCompactCurrency(token.marketCap),
        volume24h: formatCompactCurrency(token.volume24h),
        exchanges: token.exchanges.map((exchange: any) => ({
          name: exchange.exchangeName,
          displayName: getExchangeDisplayName(exchange.exchangeName),
          logoUrl: exchange.exchangeLogoUrl,
          type: exchange.marketType === "perps" ? "perps" : "spot",
          rawType: exchange.marketType,
          listingTime: exchange.listingTime ?? null,
        })).sort((
          left: {
            listingTime?: string | null;
          },
          right: {
            listingTime?: string | null;
          }
        ) => {
          const leftTime = parseUtcDateLike(left.listingTime)?.getTime() ?? 0;
          const rightTime = parseUtcDateLike(right.listingTime)?.getTime() ?? 0;
          return rightTime - leftTime;
        }),
        recentVenue: token.recentVenue ?? "—",
        logoTone: "bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)] text-[#1d4ed8]",
        watched: watchlistSymbolSet.has(token.symbol.trim().toUpperCase()),
        raw: token,
      }));

    const sorted = [...filtered].sort((a, b) => {
      const direction = sortDirection === "asc" ? 1 : -1;

      switch (sortField) {
        case "rank":
          return (a.rank - b.rank) * direction;
        case "symbol":
          return a.symbol.localeCompare(b.symbol) * direction;
        case "listedAt":
          return ((parseUtcDateLike(a.listedAt)?.getTime() ?? 0) - (parseUtcDateLike(b.listedAt)?.getTime() ?? 0)) * direction;
        case "price":
          return (a.price - b.price) * direction;
        case "totalSupply":
          return (parseDisplayNumber(a.totalSupply) - parseDisplayNumber(b.totalSupply)) * direction;
        case "circulatingSupply":
          return (parseDisplayNumber(a.circulatingSupply) - parseDisplayNumber(b.circulatingSupply)) * direction;
        case "fdv":
          return (parseDisplayNumber(a.fdv) - parseDisplayNumber(b.fdv)) * direction;
        case "marketCap":
          return (parseDisplayNumber(a.marketCap) - parseDisplayNumber(b.marketCap)) * direction;
        case "volume24h":
          return (parseDisplayNumber(a.volume24h) - parseDisplayNumber(b.volume24h)) * direction;
        default:
          return 0;
      }
    });

    return sorted.map((token, index) => ({
      ...token,
      rank: index + 1,
    }));
  }, [allLoadedTokens, coinScope, marketType, selectedExchanges, sortDirection, sortField, watchlistSymbols]);

  useEffect(() => {
    if (!marketTokensQuery.data?.items) return;

    const initialItems = dedupeTokensById(marketTokensQuery.data.items);
    setAllLoadedTokens(initialItems);
    setHasLoadedAllTokens(initialItems.length < 40);
  }, [marketTokensQuery.data?.items]);

  useEffect(() => {
    if (marketTokensQuery.isLoading || marketTokensQuery.isError || !marketTokensQuery.data?.items) {
      return;
    }

    const firstPageItems = dedupeTokensById(marketTokensQuery.data.items);
    if (firstPageItems.length < 40) {
      setIsLoadingMoreTokens(false);
      setHasLoadedAllTokens(true);
      return;
    }

    let cancelled = false;

    const loadRemainingPages = async () => {
      setIsLoadingMoreTokens(true);

      try {
        let page = 2;
        let mergedItems = firstPageItems;

        while (!cancelled) {
          const nextPage = await utils.market.listTokens.fetch({
            ...marketTokenBaseInput,
            page,
            pageSize: 40,
          });
          const nextItems = dedupeTokensById(nextPage.items ?? []);

          if (cancelled) return;

          if (nextItems.length === 0) {
            setHasLoadedAllTokens(true);
            break;
          }

          mergedItems = dedupeTokensById([...mergedItems, ...nextItems]);
          setAllLoadedTokens(mergedItems);

          if (nextItems.length < 40) {
            setHasLoadedAllTokens(true);
            break;
          }

          page += 1;
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMoreTokens(false);
        }
      }
    };

    void loadRemainingPages();

    return () => {
      cancelled = true;
    };
  }, [marketTokenBaseInput, marketTokensQuery.data?.items, marketTokensQuery.isError, marketTokensQuery.isLoading, utils.market.listTokens]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    params.set("scope", coinScope);
    params.set("marketType", marketType);

    if (tokenQuery.trim()) {
      params.set("query", tokenQuery.trim());
    } else {
      params.delete("query");
    }

    params.set("sortField", sortField);
    params.set("sortDirection", sortDirection);

    if (selectedExchanges.length > 0) {
      params.set("exchanges", selectedExchanges.map(item => encodeURIComponent(item)).join(","));
    } else {
      params.delete("exchanges");
    }

    const nextUrl = `${location.split("?")[0]}?${params.toString()}`;
    const currentUrl = `${window.location.pathname}${window.location.search}`;
    if (nextUrl !== currentUrl) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [coinScope, location, marketType, selectedExchanges, sortDirection, sortField, tab, tokenQuery]);

  const filteredAnnouncements = useMemo(() => {
    return (announcementsQuery.data?.items ?? [])
      .map(item => {
        const exchangeLabel = formatAnnouncementExchangeName(item.exchangeSlug);
        return {
          id: String(item.id),
          title: item.title,
          exchangeSlug: item.exchangeSlug,
          exchange: exchangeLabel,
          exchangeLabel,
          publishedAt: item.publishedAt,
          relativeTime: formatRelativeTime(item.publishedAt),
          summary: item.summary?.trim() || "暂无摘要",
          url: item.url,
          type: item.type,
        } satisfies Announcement;
      })
      .filter(item => {
        const matchesType = announcementType === "all" || item.type === announcementType;
        const matchesExchange =
          announcementExchange === "全部交易所" ||
          item.exchangeLabel === announcementExchange;

        return matchesType && matchesExchange;
      });
  }, [announcementExchange, announcementType, announcementsQuery.data?.items]);

  const filteredListingAnnouncements = useMemo(() => {
    return (listingAnnouncementsQuery.data?.items ?? [])
      .map(item => ({
        id: item.id,
        symbol: item.symbol,
        tokenName: item.tokenName,
        exchangeName: item.exchangeName,
        exchangeSlug: item.exchangeSlug,
        marketType: item.marketType,
        pairName: item.pairName,
        depositTime: item.depositTime,
        listingTime: item.listingTime,
        announcementTitle: item.announcementTitle,
        announcementUrl: item.announcementUrl,
        publishedAt: item.publishedAt,
      } satisfies ListingAnnouncement))
      .filter(item => {
        const matchesExchange =
          announcementExchange === "全部交易所" ||
          item.exchangeName === announcementExchange ||
          formatAnnouncementExchangeName(item.exchangeSlug) === announcementExchange;

        return matchesExchange;
      });
  }, [announcementExchange, listingAnnouncementsQuery.data?.items]);

  const announcementExchangeOptions = useMemo(() => {
    const unique = new Map<string, string>();
    for (const item of announcementsQuery.data?.items ?? []) {
      const slug = item.exchangeSlug?.trim().toLowerCase();
      if (!slug || unique.has(slug)) continue;
      unique.set(slug, formatAnnouncementExchangeName(slug));
    }
    for (const item of listingAnnouncementsQuery.data?.items ?? []) {
      const slug = item.exchangeSlug?.trim().toLowerCase();
      if (!slug || unique.has(slug)) continue;
      unique.set(slug, formatAnnouncementExchangeName(slug));
    }

    return Array.from(unique.entries())
      .map(([slug, label]) => ({ slug, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [announcementsQuery.data?.items, listingAnnouncementsQuery.data?.items]);

  const toggleExchange = (exchange: string) => {
    setSelectedExchanges(current =>
      current.includes(exchange)
        ? current.filter(item => item !== exchange)
        : [...current, exchange]
    );
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(current => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortField(field);
    setSortDirection("desc");
  };

  const SortButton = ({
    field,
    label,
    align = "left",
  }: {
    field: SortField;
    label: string;
    align?: "left" | "right";
  }) => {
    const active = sortField === field;
    const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;

    return (
      <button
        className={cn(
          "flex items-center gap-1 text-[15px] font-semibold transition-colors",
          align === "right" && "ml-auto",
          active ? "text-[oklch(var(--crypto-blue))]" : "text-[oklch(var(--crypto-ink))]"
        )}
        onClick={() => handleSort(field)}
      >
        <span>{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  };

  const announcementCounts = useMemo(() => {
    const items = announcementsQuery.data?.items ?? [];
    const listingItems = filteredListingAnnouncements;
    return {
      all: items.filter(item => item.type !== "listing").length + listingItems.length,
      listing: listingItems.length,
      delisting: items.filter(item => item.type === "delisting").length,
      event: items.filter(item => item.type === "event").length,
      other: items.filter(item => item.type === "other").length,
    };
  }, [announcementsQuery.data?.items, filteredListingAnnouncements]);

  const announcementTabs = [
    { key: "all", label: `所有公告 (${announcementCounts.all})`, icon: ListFilter },
    { key: "listing", label: `上币监控 (${announcementCounts.listing})`, icon: TrendingUp },
    { key: "delisting", label: `下币监控 (${announcementCounts.delisting})`, icon: ArrowDown },
    { key: "event", label: `活动发现 (${announcementCounts.event})`, icon: Gift },
    { key: "other", label: `其他 (${announcementCounts.other})`, icon: List },
  ] as const;

  const badgeTone = (type: Announcement["type"]) => {
    if (type === "listing") return "bg-[#125dcc] text-white";
    if (type === "delisting") return "bg-[#e62938] text-white";
    if (type === "event") return "bg-[#eef2f7] text-[#344054]";
    return "bg-[#eef2f7] text-[#344054]";
  };

  const exchangeLogo = (exchange: string) => {
    if (exchange.includes("Binance")) {
      return <div className="text-[#f0b127]">✦</div>;
    }
    if (exchange.includes("Coinbase")) {
      return <div className="rounded-full bg-[#1652f0] px-1.5 py-0.5 text-[11px] font-bold text-white">CB</div>;
    }
    if (exchange.includes("OKX")) {
      return <div className="rounded-sm bg-black px-1.5 py-0.5 text-[11px] font-bold text-white">OKX</div>;
    }
    if (exchange.includes("Gate")) {
      return <div className="rounded-full bg-[#00b067] px-1.5 py-0.5 text-[11px] font-bold text-white">G</div>;
    }
    if (exchange.includes("KuCoin")) {
      return <div className="rounded-full bg-[#1abc9c] px-1.5 py-0.5 text-[11px] font-bold text-white">K</div>;
    }
    if (exchange.includes("Bitget")) {
      return <div className="rounded-full bg-[#00c2ff] px-1.5 py-0.5 text-[11px] font-bold text-white">BG</div>;
    }
    if (exchange.includes("Bybit")) {
      return <div className="rounded-full bg-[#f7a600] px-1.5 py-0.5 text-[11px] font-bold text-black">BB</div>;
    }
    if (exchange.includes("Upbit")) {
      return <div className="rounded-full bg-[#1849a9] px-1.5 py-0.5 text-[11px] font-bold text-white">UP</div>;
    }
    if (exchange.includes("Bithumb")) {
      return <div className="text-[#f97316] text-lg font-bold">b</div>;
    }
    return <div className="text-[#98a2b3]">•</div>;
  };

  const shouldShowListingCards = announcementType === "listing" || announcementType === "all";
  const genericAnnouncementItems =
    announcementType === "all" ? filteredAnnouncements.filter(item => item.type !== "listing") : filteredAnnouncements;
  const watchlistCount = watchlistQuery.data?.items.length ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 rounded-2xl border border-white/70 bg-white/92 p-1.5 shadow-[0_8px_22px_rgba(90,112,153,0.08)]">
          <button
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === "coins"
                ? "bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_10px_20px_rgba(49,102,187,0.22)]"
                : "text-muted-foreground"
            )}
            onClick={() => setTab("coins")}
          >
            <List className="h-4 w-4" />
            币种列表
          </button>
          <button
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all",
              tab === "announcements"
                ? "bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_10px_20px_rgba(49,102,187,0.22)]"
                : "text-muted-foreground"
            )}
            onClick={() => setTab("announcements")}
          >
            <Bell className="h-4 w-4" />
            公告
          </button>
          </div>
        </div>
      </div>

      {tab === "coins" && (
        <Card className="overflow-hidden rounded-[30px] border border-white/70 bg-white/72 shadow-[0_18px_50px_rgba(83,102,138,0.10)] backdrop-blur-xl">
        <CardContent className="p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="section-title text-[oklch(var(--crypto-ink))]">筛选交易所</h2>
              </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-[#d8e0eb] bg-white p-1">
                <button
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                    coinScope === "all"
                      ? "bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_10px_20px_rgba(49,102,187,0.22)]"
                      : "text-muted-foreground"
                  )}
                  onClick={() => setCoinScope("all")}
                >
                  全部币种
                </button>
                <button
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all",
                    coinScope === "watchlist"
                      ? "bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_10px_20px_rgba(49,102,187,0.22)]"
                      : "text-muted-foreground"
                  )}
                  onClick={() => setCoinScope("watchlist")}
                >
                  <Star className={cn("h-4 w-4", coinScope === "watchlist" && "fill-current")} />
                  关注列表
                  <span className="text-xs opacity-80">({watchlistCount})</span>
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-6">
            <div className="grid gap-3 md:grid-cols-[72px_1fr] md:items-center">
              <div className="text-base font-semibold text-muted-foreground">代币搜索</div>
              <div className="relative max-w-md">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={tokenQuery}
                  onChange={e => setTokenQuery(e.target.value)}
                  placeholder="输入代币名称或 Symbol 查询"
                  className="h-12 rounded-2xl border-[oklch(var(--crypto-border-strong))] bg-white pl-11 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[72px_1fr] md:items-center">
              <div className="text-base font-semibold text-muted-foreground">交易类型</div>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: "all", label: "全部" },
                  { key: "spot", label: "现货" },
                  { key: "perps", label: "合约" },
                ].map(item => (
                  <button
                    key={item.key}
                    onClick={() => setMarketType(item.key as MarketType)}
                    className={cn(
                      "rounded-full border px-5 py-2.5 text-sm font-semibold transition-all",
                      marketType === item.key
                        ? "border-transparent bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_12px_24px_rgba(49,102,187,0.24)]"
                        : "border-[oklch(var(--crypto-border-strong))]/80 bg-white/80 text-muted-foreground"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[72px_1fr]">
              <div className="pt-2 text-base font-semibold text-muted-foreground">交易所</div>
              <div className="flex flex-wrap gap-3">
                {exchangeOptions.map(exchange => (
                  <button
                    key={exchange}
                    onClick={() => toggleExchange(exchange)}
                    className={cn(
                      "rounded-full border px-5 py-2.5 text-sm font-medium transition-all",
                      selectedExchanges.includes(exchange)
                        ? "border-transparent bg-[linear-gradient(135deg,rgba(39,86,191,0.97),rgba(36,154,138,0.94))] text-white shadow-[0_10px_22px_rgba(49,102,187,0.18)]"
                        : "border-[oklch(var(--crypto-border-strong))]/80 bg-white text-[oklch(var(--crypto-ink))]"
                    )}
                  >
                    {exchange}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
        </Card>
      )}

      {tab === "coins" ? (
        <Card className="overflow-hidden rounded-[30px] border border-white/70 bg-white/78 shadow-[0_18px_50px_rgba(83,102,138,0.08)] backdrop-blur-xl">
          <CardContent className="p-0">
            {marketTokensQuery.isError ? (
              <div className="border-b border-[#fecaca] bg-[#fff1f2] px-5 py-4 text-sm text-[#b42318]">
                <div className="font-semibold">市场数据加载失败</div>
                <div className="mt-1 break-all text-[#7a271a]">{marketTokensErrorMessage}</div>
              </div>
            ) : null}
            {!marketTokensQuery.isError && !marketTokensQuery.isLoading ? (
              <div className="border-b border-[#eef2f6] bg-[#fbfcfe] px-5 py-3 text-xs text-muted-foreground">
                {isLoadingMoreTokens
                  ? `已加载 ${allLoadedTokens.length} 个代币，正在后台继续拉取剩余数据...`
                  : hasLoadedAllTokens
                    ? `已加载全部 ${allLoadedTokens.length} 个代币`
                    : `已加载 ${allLoadedTokens.length} 个代币`}
              </div>
            ) : null}
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#d8e0eb] text-left text-[13px] font-semibold text-[oklch(var(--crypto-ink))]">
                <tr>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="rank" label="#" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="symbol" label="币种" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="listedAt" label="上线时间" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="price" label="价格" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="totalSupply" label="总量" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="circulatingSupply" label="流通量" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="fdv" label="FDV" />
                  </th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">
                    <SortButton field="marketCap" label="流通市值" />
                  </th>
                  <th colSpan={2} className="px-3 pb-2 pt-4 text-left align-bottom">上线交易所</th>
                  <th rowSpan={2} className="px-3 py-4 align-middle">最近上所</th>
                  <th rowSpan={2} className="px-3 py-4 text-right align-middle">
                    <SortButton field="volume24h" label="24h交易量" align="right" />
                  </th>
                </tr>
                <tr className="border-t border-[#eef2f6]">
                  <th className="px-3 pb-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Spot</th>
                  <th className="px-3 pb-3 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Perps</th>
                </tr>
              </thead>
              <tbody>
                {filteredTokens.map(token => (
                  <tr
                    key={token.raw.tokenId}
                    className="cursor-pointer border-b border-[#e7edf4] text-[13px] text-[oklch(var(--crypto-ink))] transition-colors hover:bg-[#f8fafc]"
                    onClick={() => {
                      const currentMarketUrl =
                        typeof window !== "undefined"
                          ? `${window.location.pathname}${window.location.search}`
                          : `${location.split("?")[0]}`;
                      setLocation(`/coin/${token.raw.tokenId}?from=${encodeURIComponent(currentMarketUrl)}`);
                    }}
                  >
                    <td className="px-3 py-3 align-top">{token.rank}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-3">
                        <div className="relative h-8 w-8 shrink-0 overflow-visible">
                          {token.logoUrl ? (
                            <img
                              src={token.logoUrl}
                              alt={token.symbol}
                              className="h-8 w-8 rounded-full border border-[#d8e0eb] bg-white object-cover"
                            />
                          ) : (
                            <div className={cn("flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold", token.logoTone)}>
                              {(token.symbol?.[0] || token.name?.[0] || "?").slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          {token.watched ? (
                            <div className="absolute -right-1 -top-1 inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-white bg-[#fff3c4] text-[#d4a106] shadow-[0_4px_10px_rgba(244,176,0,0.18)]">
                              <Star className="h-[10px] w-[10px] fill-current" />
                            </div>
                          ) : null}
                        </div>
                        <div>
                          <div className="font-semibold leading-5">{token.symbol}</div>
                          <div className="line-clamp-1 text-[12px] leading-5 text-muted-foreground">{token.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top font-mono text-[12px]">{token.listedAt}</td>
                    <td className="px-3 py-3 align-top font-mono text-[12px]">{formatPrice(token.price)}</td>
                    <td className="px-3 py-3 align-top font-mono text-[12px]">{token.totalSupply}</td>
                    <td className="px-3 py-3 align-top font-mono text-[12px]">{token.circulatingSupply}</td>
                    <td className="px-3 py-3 align-top font-mono text-[12px]">{token.fdv}</td>
                    <td className="px-3 py-3 align-top font-mono text-[12px]">{token.marketCap}</td>
                    <td className="px-3 py-3 align-top">
                      <div className="min-w-[160px]">
                        <ExchangeSummaryList
                          items={token.exchanges.filter((exchange: any) => exchange.rawType !== "perps")}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <div className="min-w-[150px]">
                        <ExchangeSummaryList
                          items={token.exchanges.filter((exchange: any) => exchange.rawType === "perps")}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      {(() => {
                        const recentVenueExchange = token.exchanges.find((exchange: any) => exchange.name === token.recentVenue);

                        if (!recentVenueExchange) {
                          return token.recentVenue;
                        }

                        return (
                          <div className="flex items-center gap-2">
                            <AssetLogo
                              src={recentVenueExchange.logoUrl}
                              alt={recentVenueExchange.displayName}
                              fallback={recentVenueExchange.displayName.slice(0, 1).toUpperCase()}
                              className="h-5 w-5"
                            />
                            <span className="text-[12px]">{token.recentVenue}</span>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-3 text-right align-top font-mono text-[12px]">{token.volume24h}</td>
                  </tr>
                ))}
                {!marketTokensQuery.isLoading && filteredTokens.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-5 py-12 text-center text-sm text-muted-foreground">
                      {marketTokensQuery.isError
                        ? "市场数据加载失败，请查看上方错误信息"
                        : coinScope === "watchlist"
                          ? "当前关注列表为空"
                          : "暂无符合条件的币种"}
                    </td>
                  </tr>
                ) : null}
                {marketTokensQuery.isLoading ? (
                  <tr>
                    <td colSpan={12} className="px-5 py-12 text-center text-sm text-muted-foreground">
                      正在加载真实市场数据...
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-[30px] border border-white/70 bg-white/78 shadow-[0_18px_50px_rgba(83,102,138,0.08)] backdrop-blur-xl">
            <CardContent className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={announcementQuery}
                    onChange={e => setAnnouncementQuery(e.target.value)}
                    placeholder="搜索代币或活动..."
                    className="h-11 rounded-2xl border-[#d2dbe7] bg-white pl-11"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={announcementExchange} onValueChange={setAnnouncementExchange}>
                    <SelectTrigger className="h-11 min-w-[180px] rounded-2xl border border-[#d2dbe7] bg-white px-4 text-sm text-[oklch(var(--crypto-ink))]">
                      <SelectValue placeholder="全部交易所" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="全部交易所">全部交易所</SelectItem>
                      {announcementExchangeOptions.map(option => (
                        <SelectItem key={option.slug} value={option.label}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2 rounded-2xl border border-[#d2dbe7] bg-white p-1">
                    <button
                      className={cn(
                        "rounded-xl px-4 py-2 text-sm font-medium",
                        announcementView === "card" ? "bg-[#125dcc] text-white" : "text-[oklch(var(--crypto-ink))]"
                      )}
                      onClick={() => setAnnouncementView("card")}
                    >
                      卡片视图
                    </button>
                    <button
                      className={cn(
                        "rounded-xl px-4 py-2 text-sm font-medium",
                        announcementView === "list" ? "bg-[#125dcc] text-white" : "text-[oklch(var(--crypto-ink))]"
                      )}
                      onClick={() => setAnnouncementView("list")}
                    >
                      列表视图
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2 rounded-2xl bg-[#e9eef5] p-1">
            {announcementTabs.map(item => {
              const Icon = item.icon;
              const active = announcementType === item.key;

              return (
                <button
                  key={item.key}
                  onClick={() => setAnnouncementType(item.key)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
                    active ? "bg-white text-[oklch(var(--crypto-ink))] shadow-[0_2px_8px_rgba(16,24,40,0.06)]" : "text-[oklch(var(--crypto-ink))]"
                  )}
                >
                  <Icon className={cn("h-4 w-4", item.key === "delisting" && "text-[#e62938]")} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {announcementView === "card" ? (
            <>
              {announcementsQuery.isError || listingAnnouncementsQuery.isError ? (
                <Card className="rounded-[22px] border border-[#fecaca] bg-[#fff1f2] shadow-none">
                  <CardContent className="p-5 text-sm text-[#b42318]">
                    <div className="font-semibold">公告数据加载失败</div>
                    <div className="mt-1 break-all text-[#7a271a]">
                      {listingAnnouncementsQuery.isError ? listingAnnouncementsErrorMessage : announcementsErrorMessage}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {shouldShowListingCards
                ? filteredListingAnnouncements.map(item => (
                <Card
                  key={item.id}
                  className="rounded-[22px] border border-[#d8e0eb] bg-white shadow-[0_6px_18px_rgba(16,24,40,0.06)]"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {exchangeLogo(item.exchangeName)}
                        <Badge variant="secondary" className="rounded-full border border-[#d0d8e4] bg-white px-3 py-1 text-[#101828]">
                          {item.exchangeName}
                        </Badge>
                      </div>
                      <Badge className="rounded-full bg-[#eef2f7] px-3 py-1 font-medium text-[#344054]">
                        New Listing
                      </Badge>
                    </div>

                    <h3 className="metric-value-strong mt-4 text-[#101828]">
                      {item.symbol}
                    </h3>
                    <p className="mt-3 line-clamp-1 text-[15px] leading-8 text-[#475467]">{item.tokenName}</p>

                    <div className="mt-8 grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <div className="text-xs text-[#667085]">充值开启</div>
                        <div className="mt-1 font-semibold text-[#101828]">
                          {formatCountdownOrDateTime(item.depositTime)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-[#667085]">交易开启</div>
                        <div className="mt-1 font-semibold text-[#101828]">
                          {formatCountdownOrDateTime(item.listingTime)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full border-[#d0d8e4] text-xs text-[#344054]">
                        {item.pairName ?? `${item.symbol}/USDT`}
                      </Badge>
                    </div>

                    <div className="mt-5 flex items-center justify-between border-t border-[#e4eaf2] pt-4 text-sm text-[#667085]">
                      <span>{item.exchangeName}</span>
                      <div className="flex items-center gap-3">
                        {item.announcementUrl ? (
                          <a
                            href={item.announcementUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 font-medium text-[#475467]"
                          >
                            公告链接
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span>-</span>
                        )}
                        <span>{formatRelativeTime(item.publishedAt ?? item.listingTime)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
                : null}
              {genericAnnouncementItems.map(item => (
                <Card
                  key={item.id}
                  className="rounded-[22px] border border-[#d8e0eb] bg-white shadow-[0_6px_18px_rgba(16,24,40,0.06)]"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        {exchangeLogo(item.exchange)}
                        <Badge variant="secondary" className="rounded-full border border-[#d0d8e4] bg-white px-3 py-1 text-[#101828]">
                          {item.exchangeLabel}
                        </Badge>
                      </div>
                      <Badge className={cn("rounded-full px-3 py-1 font-medium", badgeTone(item.type))}>
                        {item.type === "listing" ? "上币" : item.type === "delisting" ? "下币" : item.type === "event" ? "活动" : "其他"}
                      </Badge>
                    </div>

                    <h3 className="mt-4 line-clamp-2 text-[18px] font-semibold leading-9 text-[#101828]">
                      {item.title}
                    </h3>
                    <p className="mt-6 line-clamp-3 text-[15px] leading-8 text-[#475467]">{item.summary}</p>

                    <div className="mt-5 flex items-center justify-between border-t border-[#e4eaf2] pt-4 text-sm text-[#667085]">
                      <span>{item.relativeTime}</span>
                      <a
                        href={item.url ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                        className={cn(
                          "flex items-center gap-1 font-medium text-[#475467]",
                          !item.url && "pointer-events-none opacity-50"
                        )}
                      >
                        查看原文
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {!announcementsQuery.isLoading && !listingAnnouncementsQuery.isLoading && filteredListingAnnouncements.length + genericAnnouncementItems.length === 0 ? (
                <Card className="rounded-[22px] border border-[#d8e0eb] bg-white shadow-none md:col-span-2 xl:col-span-3">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    暂无符合条件的公告
                  </CardContent>
                </Card>
              ) : null}
              {announcementsQuery.isLoading || listingAnnouncementsQuery.isLoading ? (
                <Card className="rounded-[22px] border border-[#d8e0eb] bg-white shadow-none md:col-span-2 xl:col-span-3">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    正在加载真实公告数据...
                  </CardContent>
                </Card>
              ) : null}
              </div>
            </>
          ) : (
            <Card className="overflow-hidden rounded-[30px] border border-white/70 bg-white/78 shadow-[0_18px_50px_rgba(83,102,138,0.08)] backdrop-blur-xl">
              <CardContent className="overflow-x-auto p-0">
                {announcementsQuery.isError || listingAnnouncementsQuery.isError ? (
                  <div className="border-b border-[#fecaca] bg-[#fff1f2] px-5 py-4 text-sm text-[#b42318]">
                    <div className="font-semibold">公告数据加载失败</div>
                    <div className="mt-1 break-all text-[#7a271a]">
                      {listingAnnouncementsQuery.isError ? listingAnnouncementsErrorMessage : announcementsErrorMessage}
                    </div>
                  </div>
                ) : null}
                <table className="min-w-full text-sm">
                  <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                    <tr>
                      <th className="px-5 py-5">交易所</th>
                      <th className="px-5 py-5">类型</th>
                      <th className="px-5 py-5">标题</th>
                      <th className="px-5 py-5">内容摘要</th>
                      <th className="px-5 py-5">发布时间</th>
                      <th className="px-5 py-5">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shouldShowListingCards
                      ? filteredListingAnnouncements.map(item => (
                      <tr key={item.id} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                        <td className="px-5 py-5 align-top">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">{exchangeLogo(item.exchangeName)}</div>
                            <div className="font-semibold leading-7 text-[#101828]">{item.exchangeName}</div>
                          </div>
                        </td>
                        <td className="px-5 py-5 align-top">
                          <Badge className="rounded-full bg-[#125dcc] px-3 py-1 font-medium text-white">
                            上币
                          </Badge>
                        </td>
                        <td className="max-w-[420px] px-5 py-5 align-top text-[15px] font-semibold leading-8 text-[#101828]">
                          <div className="line-clamp-2">
                            {item.announcementTitle ?? `${item.exchangeName} 上线 ${item.symbol}`}
                          </div>
                        </td>
                        <td className="max-w-[520px] px-5 py-5 align-top text-[15px] leading-7 text-[#475467]">
                          <div className="line-clamp-2">
                            {`${item.symbol} · ${item.tokenName} · ${item.pairName ?? `${item.symbol}/USDT`} · 充值开启 ${formatCountdownOrDateTime(item.depositTime)} · 交易开启 ${formatCountdownOrDateTime(item.listingTime)}`}
                          </div>
                        </td>
                        <td className="px-5 py-5 align-top text-[15px] text-[#475467]">
                          <div>{formatAnnouncementDateTime(item.publishedAt ?? item.listingTime)}</div>
                          <div className="mt-1 text-sm text-[#98a2b3]">{formatRelativeTime(item.publishedAt ?? item.listingTime)}</div>
                        </td>
                        <td className="px-5 py-5 align-top">
                          <button className="mr-4 font-semibold text-[#101828]">查看分析</button>
                          <a
                            href={item.announcementUrl ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className={cn("text-[#101828]", !item.announcementUrl && "pointer-events-none opacity-50")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    ))
                      : null}
                    {genericAnnouncementItems.map(item => (
                      <tr key={item.id} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                        <td className="px-5 py-5 align-top">
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">{exchangeLogo(item.exchange)}</div>
                            <div className="font-semibold leading-7 text-[#101828]">
                              {item.exchangeLabel.split(" ")[0]}
                              <br />
                              {item.exchangeLabel.split(" ").slice(1).join(" ")}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-5 align-top">
                          <Badge className={cn("rounded-full px-3 py-1 font-medium", badgeTone(item.type))}>
                            {item.type === "listing" ? "上币" : item.type === "delisting" ? "下币" : item.type === "event" ? "活动" : "其他"}
                          </Badge>
                        </td>
                        <td className="max-w-[420px] px-5 py-5 align-top text-[15px] font-semibold leading-8 text-[#101828]">
                          <div className="line-clamp-2">{item.title}</div>
                        </td>
                        <td className="max-w-[520px] px-5 py-5 align-top text-[15px] leading-7 text-[#475467]">
                          <div className="line-clamp-2">{item.summary}</div>
                        </td>
                        <td className="px-5 py-5 align-top text-[15px] text-[#475467]">
                          <div>{formatAnnouncementDateTime(item.publishedAt)}</div>
                          <div className="mt-1 text-sm text-[#98a2b3]">{item.relativeTime}</div>
                        </td>
                        <td className="px-5 py-5 align-top">
                          <button className="mr-4 font-semibold text-[#101828]">查看分析</button>
                          <a
                            href={item.url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className={cn("text-[#101828]", !item.url && "pointer-events-none opacity-50")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </td>
                      </tr>
                    ))}
                    {!announcementsQuery.isLoading && !listingAnnouncementsQuery.isLoading && filteredListingAnnouncements.length + genericAnnouncementItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                          暂无符合条件的公告
                        </td>
                      </tr>
                    ) : null}
                    {announcementsQuery.isLoading || listingAnnouncementsQuery.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-12 text-center text-sm text-muted-foreground">
                          正在加载真实公告数据...
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
