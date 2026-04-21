import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "wouter";

function formatDepth(value: number | null) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${month}/${day}`;
}

function formatTableDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

export default function ExchangeDepth() {
  const { exchangeId, coinId } = useParams<{ exchangeId: string; coinId?: string }>();
  const searchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const returnTab = searchParams.get("tab") ?? "depth";
  const returnDepthRange = searchParams.get("depthRange");
  const returnDepthMarket = searchParams.get("depthMarket");
  const normalizedSymbol = (coinId ?? "").toUpperCase();

  const depthQuery = trpc.token.getExchangeDepthView.useQuery(
    { symbol: normalizedSymbol, exchangeSlug: exchangeId ?? "" },
    { enabled: Boolean(coinId && exchangeId) }
  );

  const exchangeName =
    depthQuery.data?.exchangeName ||
    (exchangeId ?? "exchange")
      .split("-")
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const depthTrendData = (depthQuery.data?.points ?? []).map(item => ({
    date: formatDateLabel(item.snapshotDate),
    rawDate: item.snapshotDate,
    buyDepth: item.buyDepth,
    sellDepth: item.sellDepth,
    totalDepth: item.totalDepth,
    spread: item.spread,
  }));
  const latestFirstDepthRows = [...depthTrendData].sort(
    (left, right) => new Date(right.rawDate).getTime() - new Date(left.rawDate).getTime()
  );

  const backHref = coinId
    ? `/coin/${coinId}?tab=${returnTab}${returnDepthRange ? `&depthRange=${returnDepthRange}` : ""}${returnDepthMarket ? `&depthMarket=${returnDepthMarket}` : ""}`
    : "/market";

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        返回币种详情
      </Link>

      <div className="flex items-start gap-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[oklch(var(--crypto-panel-soft))] text-xl font-semibold text-[oklch(var(--crypto-ink))]">
          {exchangeName.slice(0, 1)}
        </div>
        <div>
          <h1 className="text-5xl font-semibold tracking-tight text-[oklch(var(--crypto-ink))]">
            {exchangeName}
          </h1>
          <div className="mt-2 text-2xl text-muted-foreground">市场深度分析</div>
        </div>
      </div>

      <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <CardContent className="p-6">
          <div className="mb-5">
            <h2 className="text-[1.55rem] font-semibold text-[oklch(var(--crypto-ink))]">深度趋势图</h2>
          </div>
          {depthQuery.isError ? (
            <div className="mb-4 rounded-2xl border border-[#fecaca] bg-[#fff1f2] px-4 py-3 text-sm text-[#b42318]">
              交易所深度数据加载失败：{depthQuery.error.message}
            </div>
          ) : null}
          <div className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={depthTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#dbe4ee" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fill: "#667085", fontSize: 12 }} />
                <YAxis tick={{ fill: "#667085", fontSize: 12 }} tickFormatter={value => formatDepth(typeof value === "number" ? value : null)} />
                <Tooltip formatter={(value: unknown) => (typeof value === "number" ? formatDepth(value) : "—")} />
                <Legend />
                <Line type="monotone" dataKey="buyDepth" stroke="#00c389" strokeWidth={2.2} name="买盘深度" dot={false} connectNulls />
                <Line type="monotone" dataKey="sellDepth" stroke="#ff4d4f" strokeWidth={2.2} name="卖盘深度" dot={false} connectNulls />
                <Line type="monotone" dataKey="totalDepth" stroke="#3b78ff" strokeWidth={2.4} name="总深度" dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-[28px] border border-white/70 bg-white/78 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <CardContent className="p-6">
          <div className="mb-5">
            <h2 className="text-[1.55rem] font-semibold text-[oklch(var(--crypto-ink))]">日均深度列表</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-[#d8e0eb] text-left text-[15px] font-semibold text-[#344054]">
                <tr>
                  <th className="px-4 py-4">日期</th>
                  <th className="px-4 py-4 text-right">买盘深度 (+2%)</th>
                  <th className="px-4 py-4 text-right">卖盘深度 (-2%)</th>
                  <th className="px-4 py-4 text-right">总深度</th>
                  <th className="px-4 py-4 text-right">价差 (%)</th>
                </tr>
              </thead>
              <tbody>
                {depthQuery.isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      正在加载交易所深度数据...
                    </td>
                  </tr>
                ) : latestFirstDepthRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                      当前交易所暂无日级深度数据
                    </td>
                  </tr>
                ) : (
                  latestFirstDepthRows.map(item => (
                    <tr key={item.rawDate} className="border-b border-[#e7edf4] hover:bg-[#f8fafc]">
                      <td className="px-4 py-4">{formatTableDate(item.rawDate)}</td>
                      <td className="px-4 py-4 text-right font-mono text-[#00a86b]">{formatDepth(item.buyDepth)}</td>
                      <td className="px-4 py-4 text-right font-mono text-[#ff4d4f]">{formatDepth(item.sellDepth)}</td>
                      <td className="px-4 py-4 text-right font-mono font-semibold">{formatDepth(item.totalDepth)}</td>
                      <td className="px-4 py-4 text-right font-mono">{item.spread != null ? `${item.spread.toFixed(2)}%` : "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
