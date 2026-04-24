import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildTemplateOpportunities,
  opportunityTemplates,
  type SignalEventView,
} from "@/features/crypto-ai/template-lab";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowLeft, Beaker, Clock3, RefreshCw, Target } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

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

function biasTone(bias: "long-lean" | "short-lean" | "observe") {
  if (bias === "long-lean") return "bg-[#ecfdf3] text-[#027a48]";
  if (bias === "short-lean") return "bg-[#fff1f3] text-[#c01048]";
  return "bg-[#eef4ff] text-[#1558c0]";
}

type SimPosition = {
  symbol: string;
  side: "long" | "short";
  entryPrice: string;
  stopLoss: string;
  takeProfit: string;
  note: string;
};

export default function StrategyTemplateDetail() {
  const { strategyId } = useParams<{ strategyId: string }>();
  const [keyword, setKeyword] = useState("");
  const [positions, setPositions] = useState<Record<string, SimPosition>>({});
  const utils = trpc.useUtils();

  const eventsQuery = trpc.signal.listEvents.useQuery({ limit: 120 });
  const runScanMutation = trpc.signal.runScan.useMutation({
    async onSuccess(result) {
      await utils.signal.listEvents.invalidate();
      toast.success(`扫描完成：${result.summary.triggered} 条命中，新增 ${result.summary.created} 条`);
    },
    onError(error) {
      toast.error(error.message || "重新扫描失败");
    },
  });

  const template = opportunityTemplates.find(item => item.id === strategyId) ?? opportunityTemplates[0];
  const opportunities = useMemo(() => {
    const events = (eventsQuery.data ?? []) as SignalEventView[];
    return buildTemplateOpportunities(events).filter(item => item.templateId === template.id);
  }, [eventsQuery.data, template.id]);

  const filteredOpportunities = useMemo(() => {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized) return opportunities;
    return opportunities.filter(item => {
      return (
        item.symbol.toLowerCase().includes(normalized) ||
        item.summary.toLowerCase().includes(normalized) ||
        item.supportingPoints.some(point => point.toLowerCase().includes(normalized))
      );
    });
  }, [keyword, opportunities]);

  const averageConfidence = opportunities.length
    ? Math.round((opportunities.reduce((sum, item) => sum + item.confidence, 0) / opportunities.length) * 100)
    : 0;

  function updatePosition(symbol: string, field: keyof SimPosition, value: string) {
    setPositions(prev => ({
      ...prev,
      [symbol]: {
        symbol,
        side: prev[symbol]?.side ?? "long",
        entryPrice: prev[symbol]?.entryPrice ?? "",
        stopLoss: prev[symbol]?.stopLoss ?? "",
        takeProfit: prev[symbol]?.takeProfit ?? "",
        note: prev[symbol]?.note ?? "",
        [field]: value,
      },
    }));
  }

  return (
    <div className="space-y-6">
      <Link href="/analysis" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        返回策略列表
      </Link>

      <section className="rounded-[30px] border border-white/75 bg-white/92 px-6 py-6 shadow-[0_18px_48px_rgba(82,101,138,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#eef4ff] px-3 py-1 text-xs font-semibold tracking-[0.18em] text-[#1558c0]">
              <Target className="h-3.5 w-3.5" />
              STRATEGY DETAIL
            </div>
            <h1 className="page-title mt-4 text-[oklch(var(--crypto-ink))]">{template.name}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-[#475467]">{template.description}</p>
          </div>

          <Button
            variant="secondary"
            className="h-11 rounded-full px-5"
            onClick={() => runScanMutation.mutate({ limit: 80 })}
            disabled={runScanMutation.isPending}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", runScanMutation.isPending && "animate-spin")} />
            刷新命中结果
          </Button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-[22px] bg-[#f8fafc] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">命中币种</div>
            <div className="metric-value mt-2 text-[oklch(var(--crypto-ink))]">{opportunities.length}</div>
          </div>
          <div className="rounded-[22px] bg-[#f8fafc] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">平均置信度</div>
            <div className="metric-value mt-2 text-[oklch(var(--crypto-ink))]">{averageConfidence}%</div>
          </div>
          <div className="rounded-[22px] bg-[#f8fafc] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">最低触发分</div>
            <div className="metric-value mt-2 text-[oklch(var(--crypto-ink))]">{template.minimumScore}</div>
          </div>
          <div className="rounded-[22px] bg-[#f8fafc] p-4">
            <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">模拟仓位</div>
            <div className="metric-value mt-2 text-[oklch(var(--crypto-ink))]">{Object.keys(positions).length}</div>
          </div>
        </div>
      </section>

      <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={keyword}
              onChange={event => setKeyword(event.target.value)}
              placeholder="按 symbol 或证据搜索"
              className="h-12 min-w-[240px] flex-1 rounded-2xl border border-[#d8e0eb] bg-white px-4 text-sm text-[#344054] outline-none transition focus:border-[#0f66d8]"
            />
            <div className="inline-flex h-12 items-center rounded-2xl border border-[#d8e0eb] bg-white px-4 text-sm text-[#475467]">
              当前命中 {filteredOpportunities.length} 个币
            </div>
          </div>
        </CardContent>
      </Card>

      {eventsQuery.isLoading ? (
        <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
          <CardContent className="p-8 text-sm text-[#667085]">正在加载策略详情...</CardContent>
        </Card>
      ) : filteredOpportunities.length === 0 ? (
        <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
          <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
            <Clock3 className="h-10 w-10 text-[#98a2b3]" />
            <div className="text-lg font-semibold text-[oklch(var(--crypto-ink))]">这个策略当前没有命中币种</div>
            <div className="max-w-xl text-sm leading-6 text-[#667085]">等新的基础信号写入后，这里会自动出现符合条件的币和对应证据。</div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredOpportunities.map(item => {
            const position = positions[item.symbol] ?? {
              symbol: item.symbol,
              side: item.bias === "short-lean" ? "short" : "long",
              entryPrice: "",
              stopLoss: "",
              takeProfit: "",
              note: "",
            };

            return (
              <Card key={item.id} className="rounded-[30px] border border-white/80 bg-white/94 shadow-[0_18px_44px_rgba(83,102,138,0.08)]">
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="metric-value-strong text-[oklch(var(--crypto-ink))]">
                          {item.symbol}
                        </div>
                        <Badge className={cn("rounded-full px-3 py-1", biasTone(item.bias))}>{item.bias}</Badge>
                      </div>
                      <div className="mt-2 text-lg font-medium text-[oklch(var(--crypto-ink))]">{item.summary}</div>
                      <div className="mt-2 text-sm text-[#667085]">最近触发：{formatDateTime(item.lastTriggeredAt)}</div>
                    </div>

                    <div className="grid min-w-[180px] gap-3 sm:grid-cols-2">
                      <div className="rounded-[20px] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">Score</div>
                        <div className="mt-1 text-xl font-semibold text-[oklch(var(--crypto-ink))]">{item.score}</div>
                      </div>
                      <div className="rounded-[20px] bg-[#f8fafc] px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">Confidence</div>
                        <div className="mt-1 text-xl font-semibold text-[oklch(var(--crypto-ink))]">
                          {(item.confidence * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-4">
                      <div className="rounded-[24px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                        <div className="text-sm font-semibold text-[oklch(var(--crypto-ink))]">命中证据</div>
                        <div className="mt-3 space-y-3">
                          {item.supportingPoints.map(point => (
                            <div key={point} className="rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[#344054]">
                              {point}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                        <div className="text-sm font-semibold text-[oklch(var(--crypto-ink))]">底层信号</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.matchedSignals.map(signal => (
                            <Badge key={signal.id} variant="secondary" className="rounded-full bg-white px-3 py-1 text-[#344054]">
                              {signal.signalType}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[24px] border border-[#f2e4e7] bg-[#fff8f8] p-4">
                        <div className="text-sm font-semibold text-[#b42318]">风险提醒</div>
                        <div className="mt-3 space-y-3">
                          {item.riskPoints.map(point => (
                            <div key={point} className="rounded-[18px] bg-white px-4 py-3 text-sm leading-6 text-[#475467]">
                              {point}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-[#d6e4ff] bg-[linear-gradient(180deg,#f9fbff_0%,#eef5ff_100%)] p-5">
                      <div className="flex items-center gap-2">
                        <Beaker className="h-4 w-4 text-[#1558c0]" />
                        <div className="text-base font-semibold text-[oklch(var(--crypto-ink))]">模拟仓位</div>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="mb-2 text-sm font-medium text-[#344054]">方向</div>
                          <div className="flex gap-2">
                            {(["long", "short"] as const).map(side => (
                              <button
                                key={side}
                                onClick={() => updatePosition(item.symbol, "side", side)}
                                className={cn(
                                  "flex-1 rounded-2xl border px-4 py-3 text-sm font-medium transition",
                                  position.side === side
                                    ? "border-[#0f66d8] bg-[#0f66d8] text-white"
                                    : "border-[#d8e0eb] bg-white text-[#344054]"
                                )}
                              >
                                {side}
                              </button>
                            ))}
                          </div>
                        </div>

                        {[
                          ["entryPrice", "模拟开仓价"],
                          ["stopLoss", "止损价"],
                          ["takeProfit", "止盈价"],
                        ].map(([field, label]) => (
                          <div key={field}>
                            <div className="mb-2 text-sm font-medium text-[#344054]">{label}</div>
                            <input
                              value={position[field as keyof SimPosition] as string}
                              onChange={event => updatePosition(item.symbol, field as keyof SimPosition, event.target.value)}
                              className="h-12 w-full rounded-2xl border border-[#d8e0eb] bg-white px-4 text-sm text-[#344054] outline-none transition focus:border-[#0f66d8]"
                              placeholder={`输入${label}`}
                            />
                          </div>
                        ))}

                        <div>
                          <div className="mb-2 text-sm font-medium text-[#344054]">备注</div>
                          <textarea
                            value={position.note}
                            onChange={event => updatePosition(item.symbol, "note", event.target.value)}
                            className="min-h-[112px] w-full rounded-2xl border border-[#d8e0eb] bg-white px-4 py-3 text-sm text-[#344054] outline-none transition focus:border-[#0f66d8]"
                            placeholder="写下你为什么想开这个模拟仓位"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
