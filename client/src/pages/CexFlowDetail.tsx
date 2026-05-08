import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseUtcDateLike, SHANGHAI_TIME_ZONE } from "@/lib/time";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowLeft, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";

function compactNumber(value: number | null, fractionDigits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(fractionDigits)}亿`;
  if (Math.abs(value) >= 10_000) return `${(value / 10_000).toFixed(fractionDigits)}万`;
  return value.toFixed(fractionDigits);
}

function formatAddressDisplay(address: string) {
  if (!address) return "—";
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatBscScanAddress(address: string) {
  return `https://bscscan.com/address/${address}`;
}

function formatBscScanTx(txhash: string) {
  return `https://bscscan.com/tx/${txhash}`;
}

function formatBlockTime(blockTime: string | null) {
  if (!blockTime) return "—";
  const date = parseUtcDateLike(blockTime);
  if (!date) return blockTime;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

export default function CexFlowDetail() {
  const { symbol } = useParams<{ symbol: string }>();
  const [, setLocation] = useLocation();
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const search = typeof window !== "undefined" ? window.location.search : "";
  const searchParams = useMemo(() => new URLSearchParams(search), [search]);

  const requestedDate = searchParams.get("date") ?? "";
  const requestedExchange = searchParams.get("exchange") ?? "";
  const requestedDirection =
    searchParams.get("direction") === "outflow"
      ? "outflow"
      : searchParams.get("direction") === "inflow"
        ? "inflow"
        : "all";
  const returnTab = searchParams.get("returnTab") ?? "cex-flows";
  const expandDate = searchParams.get("expandDate") ?? requestedDate;
  const normalizedSymbol = (symbol ?? "").trim().toUpperCase();
  const [selectedDate, setSelectedDate] = useState(requestedDate);
  const [selectedExchangeState, setSelectedExchangeState] = useState(requestedExchange);
  const [selectedDirection, setSelectedDirection] = useState<"all" | "inflow" | "outflow">(requestedDirection);

  const cexFlowsQuery = trpc.onchain.getCexFlows.useQuery(
    { symbol: normalizedSymbol },
    {
      enabled: Boolean(normalizedSymbol),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

  const selectedDay = useMemo(() => {
    if (!cexFlowsQuery.data) return null;
    return cexFlowsQuery.data.days.find(day => day.date === selectedDate) ?? cexFlowsQuery.data.days[0] ?? null;
  }, [cexFlowsQuery.data, selectedDate]);

  const availableExchanges = selectedDay?.exchanges.map(item => item.exchange) ?? [];
  const selectedExchange =
    selectedExchangeState && availableExchanges.includes(selectedExchangeState) ? selectedExchangeState : "";

  useEffect(() => {
    if (!normalizedSymbol || !selectedDay) return;
    if (!selectedDate || selectedDate !== selectedDay.date) {
      setSelectedDate(selectedDay.date);
    }
    if (selectedExchangeState && !availableExchanges.includes(selectedExchangeState)) {
      setSelectedExchangeState("");
    }
  }, [normalizedSymbol, selectedDay, selectedDate, selectedExchangeState, availableExchanges]);

  useEffect(() => {
    if (!normalizedSymbol || !selectedDay) return;
    setLocation(
      `/onchain/cex-flow/${normalizedSymbol}?date=${encodeURIComponent(selectedDay.date)}${selectedExchange ? `&exchange=${encodeURIComponent(selectedExchange)}` : ""}&direction=${selectedDirection}&returnTab=${encodeURIComponent(returnTab)}&expandDate=${encodeURIComponent(expandDate || selectedDay.date)}`
    );
  }, [
    normalizedSymbol,
    selectedDay,
    selectedExchange,
    selectedDirection,
    returnTab,
    expandDate,
    setLocation,
  ]);

  const detailQuery = trpc.onchain.getCexFlowTransfers.useQuery(
    {
      symbol: normalizedSymbol,
      date: selectedDay?.date ?? "",
      exchange: selectedExchange,
      direction: selectedDirection,
    },
    {
      enabled: Boolean(normalizedSymbol && selectedDay?.date),
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );

  const backHref = `/onchain?tab=${encodeURIComponent(returnTab)}&symbol=${encodeURIComponent(normalizedSymbol)}${expandDate ? `&expandDate=${encodeURIComponent(expandDate)}` : ""}`;

  const handleCopyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      window.setTimeout(() => setCopiedAddress(current => (current === address ? null : current)), 1200);
    } catch {
      setCopiedAddress(null);
    }
  };

  return (
    <div className="space-y-6">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        返回 CEX 流入流出列表
      </Link>

      <div className="space-y-4 rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold tracking-[-0.03em] text-[#0F172A]">
              {normalizedSymbol} · CEX Transfer 明细
            </h1>
            <div className="mt-2 text-sm text-[#64748B]">
              查看指定日期、指定交易所下的流入 / 流出 transfer 原始明细。
            </div>
          </div>
          {detailQuery.data?.tokenAddress ? (
            <div className="flex items-center gap-2">
              <a
                href={formatBscScanAddress(detailQuery.data.tokenAddress)}
                target="_blank"
                rel="noreferrer"
                className="max-w-[280px] truncate rounded-full border border-[#DBEAFE] bg-white px-3 py-2 text-sm font-medium text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
              >
                {formatAddressDisplay(detailQuery.data.tokenAddress)}
              </a>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {selectedDay ? (
            <div className="rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-3 py-2 text-sm font-medium text-[#1D4ED8]">
              日期：{selectedDay.date}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() =>
              setSelectedExchangeState("")
            }
            className={cn(
              "rounded-full border px-3 py-2 text-sm font-medium transition",
              !selectedExchange
                ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                : "border-[#DBEAFE] bg-white text-[#1D4ED8] hover:bg-[#EFF6FF]"
            )}
          >
            全部交易所
          </button>
          {availableExchanges.map(exchange => (
            <button
              key={exchange}
              type="button"
              onClick={() => setSelectedExchangeState(exchange)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm font-medium transition",
                exchange === selectedExchange
                  ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                  : "border-[#DBEAFE] bg-white text-[#1D4ED8] hover:bg-[#EFF6FF]"
              )}
            >
              {exchange}
            </button>
          ))}
          {(["all", "inflow", "outflow"] as const).map(direction => (
            <button
              key={direction}
              type="button"
              onClick={() => setSelectedDirection(direction)}
              className={cn(
                "rounded-full border px-3 py-2 text-sm font-medium transition",
                direction === selectedDirection
                  ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                  : "border-[#DBEAFE] bg-white text-[#1D4ED8] hover:bg-[#EFF6FF]"
              )}
            >
              {direction === "all" ? "全部方向" : direction === "inflow" ? "流入明细" : "流出明细"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">当前交易所</div>
              <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedExchange || "全部交易所"}</div>
            </CardContent>
          </Card>
          <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">记录数</div>
              <div className="mt-1 text-base font-semibold text-[#0F172A]">
                {detailQuery.data ? detailQuery.data.transferCount.toLocaleString() : "—"}
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
            <CardContent className="p-3.5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">总数量</div>
              <div className="mt-1 text-base font-semibold text-[#0F172A]">
                {detailQuery.data ? compactNumber(detailQuery.data.totalAmount) : "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>From</TableHead>
                <TableHead>From 标签</TableHead>
                <TableHead>To</TableHead>
                <TableHead>To 标签</TableHead>
                <TableHead className="text-right">数量</TableHead>
                <TableHead className="text-right">占总量</TableHead>
                <TableHead className="text-right">Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cexFlowsQuery.isLoading || detailQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    正在加载 transfer 明细...
                  </TableCell>
                </TableRow>
              ) : cexFlowsQuery.error || detailQuery.error ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    transfer 明细加载失败
                  </TableCell>
                </TableRow>
              ) : !detailQuery.data || detailQuery.data.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="px-4 py-10 text-center text-sm text-[#64748B]">
                    当前筛选条件下暂无 transfer 明细
                  </TableCell>
                </TableRow>
              ) : (
                detailQuery.data.items.map(item => (
                  <TableRow key={`${item.txhash}-${item.logIndex ?? "na"}`}>
                    <TableCell className="whitespace-nowrap">{formatBlockTime(item.blockTime)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="font-medium text-[#1D4ED8] hover:underline"
                          onClick={() => window.open(formatBscScanAddress(item.fromAddress), "_blank", "noopener,noreferrer")}
                        >
                          {formatAddressDisplay(item.fromAddress)}
                        </button>
                        <button
                          type="button"
                          className="text-[#64748B] transition hover:text-[#1D4ED8]"
                          onClick={() => handleCopyAddress(item.fromAddress)}
                          title={copiedAddress === item.fromAddress ? "已复制" : "复制地址"}
                        >
                          {copiedAddress === item.fromAddress ? "✓" : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>{item.fromLabel}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="font-medium text-[#1D4ED8] hover:underline"
                          onClick={() => window.open(formatBscScanAddress(item.toAddress), "_blank", "noopener,noreferrer")}
                        >
                          {formatAddressDisplay(item.toAddress)}
                        </button>
                        <button
                          type="button"
                          className="text-[#64748B] transition hover:text-[#1D4ED8]"
                          onClick={() => handleCopyAddress(item.toAddress)}
                          title={copiedAddress === item.toAddress ? "已复制" : "复制地址"}
                        >
                          {copiedAddress === item.toAddress ? "✓" : <Copy className="h-4 w-4" />}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>{item.toLabel}</TableCell>
                    <TableCell className="text-right">{item.amount != null ? compactNumber(item.amount) : "—"}</TableCell>
                    <TableCell className="text-right">{item.ratioOfSupply != null ? `${item.ratioOfSupply.toFixed(2)}%` : "—"}</TableCell>
                    <TableCell className="text-right">
                      <a
                        href={formatBscScanTx(item.txhash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-[#1D4ED8] hover:underline"
                      >
                        {item.txhash.slice(0, 10)}...
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
