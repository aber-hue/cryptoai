import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { PositionTimeframe } from "@/features/crypto-ai/market-data";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link, useParams } from "wouter";

function formatMetricValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function formatCompactPrice(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return value >= 1 ? `$${value.toFixed(2)}` : `$${value.toFixed(4)}`;
}

function formatFundingRate(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${value.toFixed(3)}%`;
}

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";

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

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    ...options,
  })
    .format(date)
    .replace(/\//g, "/");
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

function formatSeriesLabel(value: string) {
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
  const hasTime = !(hour === "00" && minute === "00");
  return hasTime ? `${month}/${day} ${hour}:00` : `${month}/${day}`;
}

function formatMarketTypeLabel(value: string | null) {
  switch (value) {
    case "perps":
      return "合约";
    case "spot":
      return "现货";
    case "alpha":
      return "Alpha";
    default:
      return value ? value.toUpperCase() : "—";
  }
}

export default function ExchangeStrategy() {
  const { exchangeId, coinId } = useParams<{ exchangeId: string; coinId: string }>();
  const normalizedSymbol = (coinId ?? "").toUpperCase();
  const exchangeSlug = (exchangeId ?? "").toLowerCase();
  const [timeframe, setTimeframe] = useState<PositionTimeframe>("1d");

  const tokenProfileQuery = trpc.token.getProfile.useQuery(
    { symbol: normalizedSymbol },
    { enabled: Boolean(normalizedSymbol) }
  );
  const exchangeHoldersQuery = trpc.token.getExchangeHoldersView.useQuery(
    { symbol: normalizedSymbol, exchangeSlug, timeframe },
    { enabled: Boolean(normalizedSymbol && exchangeSlug) }
  );

  const tokenProfile = tokenProfileQuery.data;
  const detail = exchangeHoldersQuery.data;
  const series = detail?.series ?? [];
  const latestFirstRows = [...series].sort(
    (left, right) => new Date(right.snapshotDate).getTime() - new Date(left.snapshotDate).getTime()
  );
  const chartData = series.map(point => ({
    label: formatSeriesLabel(point.snapshotDate),
    openInterest: point.openInterest ?? 0,
    fundingRate: point.fundingRate ?? 0,
  }));

  return (
    <div className="space-y-6">
      <Link
        href={`/coin/${normalizedSymbol.toLowerCase()}?tab=holders`}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        返回币种详情
      </Link>

      <div className="flex items-start gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#dbeafe] text-xl font-semibold text-[#1d4ed8]">
          {(tokenProfile?.symbol?.[0] || normalizedSymbol[0] || "?").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title text-[oklch(var(--crypto-ink))]">
              {detail?.exchangeName ?? "交易所详情"}
            </h1>
            {detail?.marketType ? (
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                {formatMarketTypeLabel(detail.marketType)}
              </Badge>
            ) : null}
          </div>
          <div className="mt-2 text-base text-muted-foreground md:text-lg">
            {tokenProfile?.symbol ?? normalizedSymbol} 合约持仓与资金费率正式数据
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            更新于 {detail?.updatedAt ? formatListingDateTime(detail.updatedAt) : "—"}
          </div>
        </div>
      </div>

      {exchangeHoldersQuery.isError ? (
        <div className="rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
          持仓详情加载失败：{exchangeHoldersQuery.error.message}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["当前价格", formatCompactPrice(detail?.latestPrice ?? null)],
          ["24h 交易量", formatMetricValue(detail?.latestVolume24h ?? null)],
          ["未平仓量", formatMetricValue(detail?.latestOpenInterest ?? null)],
          ["最新资金费率", formatFundingRate(detail?.latestFundingRate ?? null)],
        ].map(([label, value]) => (
          <Card
            key={label}
            className="rounded-[22px] border border-white/70 bg-white/78 shadow-[0_12px_28px_rgba(83,102,138,0.08)]"
          >
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="metric-value mt-1 text-[oklch(var(--crypto-ink))]">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <CardContent className="p-6">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="section-title text-[oklch(var(--crypto-ink))]">仓位与资金费率趋势</h2>
              <div className="mt-2 text-muted-foreground">按不同颗粒度查看该交易所的未平仓量与资金费率变化</div>
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
                  onClick={() => setTimeframe(value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm font-medium transition",
                    timeframe === value
                      ? "border-[#0f66d8] bg-[#0f66d8] text-white shadow-[0_10px_24px_rgba(15,102,216,0.18)]"
                      : "border-[#d8e0eb] bg-white text-[#344054] hover:border-[#b8c7da]"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {exchangeHoldersQuery.isLoading ? (
            <div className="rounded-[24px] border border-[#e7edf4] bg-white/70 px-5 py-10 text-center text-sm text-muted-foreground">
              正在加载正式持仓趋势...
            </div>
          ) : chartData.length === 0 ? (
            <div className="rounded-[24px] border border-[#e7edf4] bg-white/70 px-5 py-10 text-center text-sm text-muted-foreground">
              当前交易所暂无可用的持仓趋势数据
            </div>
          ) : (
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e8edf4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: "#667085", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    yAxisId="position"
                    tick={{ fill: "#667085", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => formatMetricValue(value)}
                  />
                  <YAxis
                    yAxisId="funding"
                    orientation="right"
                    tick={{ fill: "#667085", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(value: number) => formatFundingRate(value)}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "未平仓量" ? formatMetricValue(value) : formatFundingRate(value)
                    }
                  />
                  <Line yAxisId="position" type="monotone" dataKey="openInterest" name="未平仓量" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 4 }} />
                  <Line yAxisId="funding" type="monotone" dataKey="fundingRate" name="资金费率" stroke="#10b981" strokeWidth={2.5} dot={{ r: 0 }} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <CardContent className="p-6">
          <div className="mb-5">
            <h2 className="section-title text-[oklch(var(--crypto-ink))]">日度持仓明细</h2>
            <div className="mt-2 text-muted-foreground">按时间倒序展示该交易所每日未平仓量和资金费率</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                <tr>
                  <th className="px-4 py-4">日期</th>
                  <th className="px-4 py-4">未平仓量</th>
                  <th className="px-4 py-4 text-right">资金费率</th>
                </tr>
              </thead>
              <tbody>
                {exchangeHoldersQuery.isLoading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      正在加载正式明细数据...
                    </td>
                  </tr>
                ) : null}
                {!exchangeHoldersQuery.isLoading && latestFirstRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      当前交易所暂无日度持仓明细
                    </td>
                  </tr>
                ) : null}
                {latestFirstRows.map(row => (
                  <tr key={row.snapshotDate} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                    <td className="px-4 py-4 font-medium text-[oklch(var(--crypto-ink))]">
                      {formatListingDateTime(row.snapshotDate)}
                    </td>
                    <td className="px-4 py-4 font-mono text-[oklch(var(--crypto-ink))]">
                      {formatMetricValue(row.openInterest)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-4 text-right font-mono",
                        (row.fundingRate ?? 0) < 0 ? "text-[#ef4444]" : "text-[oklch(var(--crypto-ink))]"
                      )}
                    >
                      {formatFundingRate(row.fundingRate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
