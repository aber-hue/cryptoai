import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mockCryptoAiDataSource } from "@/features/crypto-ai/data-source";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Clock3, RefreshCw, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

type SignalStatus = "new" | "active" | "muted" | "expired";

function signalTypeLabel(signalType: string) {
  return signalType.replaceAll("_", " ");
}

function severityTone(severity: "low" | "medium" | "high") {
  if (severity === "high") return "bg-[#fff0f0] text-[#d92d20]";
  if (severity === "medium") return "bg-[#fff6e8] text-[#b54708]";
  return "bg-[#eef9f3] text-[#067647]";
}

function statusTone(status: SignalStatus) {
  if (status === "active") return "bg-[#eef4ff] text-[#1558c0]";
  if (status === "muted") return "bg-[#f2f4f7] text-[#475467]";
  if (status === "expired") return "bg-[#fef3f2] text-[#b42318]";
  return "bg-[#ecfdf3] text-[#027a48]";
}

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMetricValue(value: string | null | undefined, unit?: string | null) {
  if (!value) return unit || "—";
  if (unit === "%") return `${value}%`;
  return unit ? `${value} ${unit}` : value;
}

function getUnlockDate(payloadJson: string | null | undefined) {
  if (!payloadJson) return null;

  try {
    const parsed = JSON.parse(payloadJson) as { unlockDate?: string | null };
    return parsed.unlockDate?.trim() || null;
  } catch {
    return null;
  }
}

export default function Home() {
  const dashboard = mockCryptoAiDataSource.getDashboard();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SignalStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const utils = trpc.useUtils();

  const templatesQuery = trpc.signal.listTemplates.useQuery({ enabledOnly: true });
  const eventsQuery = trpc.signal.listEvents.useQuery({
    limit: 100,
    status: statusFilter === "all" ? undefined : statusFilter,
    category: categoryFilter === "all" ? undefined : categoryFilter,
  });

  const runScanMutation = trpc.signal.runScan.useMutation({
    async onSuccess(result) {
      await utils.signal.listEvents.invalidate();
      toast.success(`扫描完成：${result.summary.triggered} 条命中，新增 ${result.summary.created} 条`);
    },
    onError(error) {
      toast.error(error.message || "Signal 扫描失败");
    },
  });

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    templatesQuery.data?.forEach(item => values.add(item.category));
    return Array.from(values).sort();
  }, [templatesQuery.data]);

  const filteredEvents = useMemo(() => {
    const items = eventsQuery.data ?? [];
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) return items;

    return items.filter(item => {
      return (
        item.symbol.toLowerCase().includes(normalizedKeyword) ||
        item.title.toLowerCase().includes(normalizedKeyword) ||
        item.signalType.toLowerCase().includes(normalizedKeyword) ||
        (item.summary ?? "").toLowerCase().includes(normalizedKeyword)
      );
    });
  }, [eventsQuery.data, keyword]);

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-white/75 bg-white/72 px-5 py-3 shadow-[0_10px_28px_rgba(90,112,153,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#475467]">
            <div className="inline-flex items-center gap-2 font-medium text-[oklch(var(--crypto-ink))]">
              <Clock3 className="h-4 w-4" />
              Signal Board
            </div>
            <div>模板 {templatesQuery.data?.length ?? 0}</div>
            <div>事件 {eventsQuery.data?.length ?? 0}</div>
            <div>最后更新时间 {dashboard.headline.refreshedAt}</div>
          </div>

          <Button
            className="h-11 rounded-full bg-[#1558c0] px-5 hover:bg-[#124ca6]"
            onClick={() => runScanMutation.mutate({ limit: 80 })}
            disabled={runScanMutation.isPending}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", runScanMutation.isPending && "animate-spin")} />
            运行扫描
          </Button>
        </div>
      </section>

      <Card className="rounded-[28px] border border-white/80 bg-white/88 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
              <input
                value={keyword}
                onChange={event => setKeyword(event.target.value)}
                placeholder="按 Symbol、标题或 signal type 搜索"
                className="h-11 w-full rounded-full border border-[#d8e0eb] bg-white pl-11 pr-4 text-sm text-[#344054] outline-none transition focus:border-[#0f66d8]"
              />
            </div>

            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as "all" | SignalStatus)}
              className="h-11 rounded-full border border-[#d8e0eb] bg-white px-4 text-sm text-[#344054]"
            >
              <option value="all">全部状态</option>
              <option value="new">new</option>
              <option value="active">active</option>
              <option value="muted">muted</option>
              <option value="expired">expired</option>
            </select>

            <select
              value={categoryFilter}
              onChange={event => setCategoryFilter(event.target.value)}
              className="h-11 rounded-full border border-[#d8e0eb] bg-white px-4 text-sm text-[#344054]"
            >
              <option value="all">全部分类</option>
              {categoryOptions.map(item => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <section className="space-y-4">
          {eventsQuery.isLoading ? (
            <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
              <CardContent className="p-6 text-sm text-muted-foreground">正在加载 signal 事件...</CardContent>
            </Card>
          ) : filteredEvents.length === 0 ? (
            <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
              <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
                <Sparkles className="h-10 w-10 text-[#98a2b3]" />
                <div className="text-base font-medium text-[oklch(var(--crypto-ink))]">当前还没有 signal event</div>
                <div className="max-w-xl text-sm leading-6 text-muted-foreground">
                  先点右上角的“运行扫描”，系统会基于当前模板扫描一批 token，并把命中的基础异动写入 signal event。
                </div>
              </CardContent>
            </Card>
          ) : (
            filteredEvents.map(event => {
              const unlockDate = getUnlockDate(event.payloadJson);

              return (
                <Card key={event.id} className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
                  <CardContent className="p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-[1.6rem] font-semibold leading-none text-[oklch(var(--crypto-ink))]">{event.symbol}</div>
                          <Badge className="rounded-full bg-[oklch(var(--crypto-panel-soft))] px-3 py-1 text-[#344054] hover:bg-[oklch(var(--crypto-panel-soft))]">
                            {signalTypeLabel(event.signalType)}
                          </Badge>
                          <Badge className={cn("rounded-full px-3 py-1 capitalize", severityTone(event.severity))}>
                            {event.severity}
                          </Badge>
                          <Badge className={cn("rounded-full px-3 py-1 capitalize", statusTone(event.status))}>
                            {event.status}
                          </Badge>
                        </div>
                        <div className="text-lg font-medium text-[oklch(var(--crypto-ink))]">{event.title}</div>
                        <div className="text-sm text-[#475467]">
                          {formatDateTime(event.triggeredAt)} · {event.category} · {event.source}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Link
                          href={`/coin/${event.symbol.toLowerCase()}`}
                          className="inline-flex h-8 items-center gap-1 rounded-full border border-[#d6e3f4] bg-white px-3 text-sm font-medium text-[#1558c0] transition hover:border-[#b8d0ee] hover:bg-[#f7fbff]"
                        >
                          查看详情
                          <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                        <Badge variant="secondary" className="rounded-full bg-[#eef4ff] text-[#1558c0]">
                          {event.window ?? "now"}
                        </Badge>
                        {unlockDate ? (
                          <Badge variant="secondary" className="rounded-full bg-[#fff3e8] text-[#b54708]">
                            解锁日期 {unlockDate}
                          </Badge>
                        ) : null}
                        {event.changePct ? (
                          <Badge variant="secondary" className="rounded-full bg-[#edf3ff] text-[#175cd3]">
                            {event.changePct}%
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <p className="mt-4 text-[15px] leading-7 text-[oklch(var(--crypto-ink))]">{event.summary ?? "暂无摘要"}</p>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-[20px] border border-[#e7edf4] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">当前值</div>
                        <div className="mt-1 text-base font-semibold text-[oklch(var(--crypto-ink))]">
                          {formatMetricValue(event.latestMetricValue, null)}
                        </div>
                      </div>
                      <div className="rounded-[20px] border border-[#e7edf4] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">基线值</div>
                        <div className="mt-1 text-base font-semibold text-[oklch(var(--crypto-ink))]">
                          {formatMetricValue(event.baselineValue, null)}
                        </div>
                      </div>
                      <div className="rounded-[20px] border border-[#e7edf4] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">阈值</div>
                        <div className="mt-1 text-base font-semibold text-[oklch(var(--crypto-ink))]">
                          {formatMetricValue(event.thresholdValue, null)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
      </section>
    </div>
  );
}
