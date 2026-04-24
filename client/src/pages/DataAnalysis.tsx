import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildTemplateOpportunities,
  opportunityTemplates,
  type SignalEventView,
} from "@/features/crypto-ai/template-lab";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowRight, BrainCircuit, RefreshCw, Sparkles, Target } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Link } from "wouter";

function categoryTone(category: string) {
  if (category === "trend") return "bg-[#eff8ff] text-[#175cd3]";
  if (category === "event") return "bg-[#fff7ed] text-[#c2410c]";
  if (category === "flow") return "bg-[#f5f3ff] text-[#6d28d9]";
  return "bg-[#f4f3ff] text-[#5b21b6]";
}

export default function DataAnalysis() {
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

  const opportunities = useMemo(() => {
    const events = (eventsQuery.data ?? []) as SignalEventView[];
    return buildTemplateOpportunities(events);
  }, [eventsQuery.data]);

  const templateSummaries = useMemo(() => {
    return Object.fromEntries(
      opportunityTemplates.map(template => {
        const hits = opportunities.filter(item => item.templateId === template.id);
        const topSymbols = hits.slice(0, 4).map(item => item.symbol);
        const avgScore = hits.length
          ? Number((hits.reduce((sum, item) => sum + item.score, 0) / hits.length).toFixed(1))
          : 0;

        return [
          template.id,
          {
            count: hits.length,
            topSymbols,
            avgScore,
            bestScore: hits[0]?.score ?? 0,
          },
        ];
      })
    ) as Record<string, { count: number; topSymbols: string[]; avgScore: number; bestScore: number }>;
  }, [opportunities]);

  const totalSignals = eventsQuery.data?.length ?? 0;
  const coveredSymbols = new Set(opportunities.map(item => item.symbol)).size;

  return (
    <div className="space-y-6">
      <section className="rounded-[30px] border border-white/75 bg-[linear-gradient(135deg,rgba(15,102,216,0.96),rgba(10,160,140,0.88))] px-6 py-6 text-white shadow-[0_18px_48px_rgba(24,93,181,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/14 px-3 py-1 text-xs font-semibold tracking-[0.18em]">
              <BrainCircuit className="h-3.5 w-3.5" />
              TEMPLATE LAB
            </div>
            <h1 className="page-title mt-4">把基础异动，组装成可复用的机会模板</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/82">
              这里先看策略，不讲方法论。每个策略点进去后，会看到当前命中的币种、证据强度，以及可手动开的模拟仓位。
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-[22px] bg-white/12 p-4 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.16em] text-white/65">Templates</div>
            <div className="metric-value mt-2">{opportunityTemplates.length}</div>
          </div>
          <div className="rounded-[22px] bg-white/12 p-4 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.16em] text-white/65">Signals</div>
            <div className="metric-value mt-2">{totalSignals}</div>
          </div>
          <div className="rounded-[22px] bg-white/12 p-4 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.16em] text-white/65">Opportunities</div>
            <div className="metric-value mt-2">{opportunities.length}</div>
          </div>
          <div className="rounded-[22px] bg-white/12 p-4 backdrop-blur">
            <div className="text-xs uppercase tracking-[0.16em] text-white/65">Covered Symbols</div>
            <div className="metric-value mt-2">{coveredSymbols}</div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        {eventsQuery.isLoading ? (
          <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)] lg:col-span-2 2xl:col-span-3">
            <CardContent className="p-8 text-sm text-[#667085]">正在读取策略命中结果...</CardContent>
          </Card>
        ) : opportunityTemplates.map(template => {
          const summary = templateSummaries[template.id];
          return (
            <Link key={template.id} href={`/analysis/${template.id}`}>
              <Card className="group h-full rounded-[30px] border border-white/80 bg-white/94 shadow-[0_18px_44px_rgba(83,102,138,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_24px_54px_rgba(56,88,144,0.12)]">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-[#1558c0]" />
                        <CardTitle className="section-title">{template.name}</CardTitle>
                      </div>
                      <div className="mt-2 text-sm leading-6 text-[#475467]">{template.description}</div>
                    </div>
                    <Badge className={cn("rounded-full px-2.5 py-0.5", categoryTone(template.category))}>
                      {template.category}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[20px] bg-[#f8fafc] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">命中币种</div>
                      <div className="metric-value mt-1 text-[oklch(var(--crypto-ink))]">{summary?.count ?? 0}</div>
                    </div>
                    <div className="rounded-[20px] bg-[#f8fafc] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">平均分</div>
                      <div className="metric-value mt-1 text-[oklch(var(--crypto-ink))]">{summary?.avgScore ?? 0}</div>
                    </div>
                    <div className="rounded-[20px] bg-[#f8fafc] px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-[#667085]">最高分</div>
                      <div className="metric-value mt-1 text-[oklch(var(--crypto-ink))]">{summary?.bestScore ?? 0}</div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-[oklch(var(--crypto-ink))]">当前命中币种</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {summary?.topSymbols?.length ? (
                        summary.topSymbols.map(symbol => (
                          <Badge key={symbol} variant="secondary" className="rounded-full bg-[#eef4ff] px-3 py-1 text-[#1558c0]">
                            {symbol}
                          </Badge>
                        ))
                      ) : (
                        <div className="text-sm text-[#98a2b3]">当前暂无命中</div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                    <div className="text-sm font-medium text-[oklch(var(--crypto-ink))]">策略说明</div>
                    <div className="mt-2 text-sm leading-6 text-[#475467]">{template.objective}</div>
                  </div>

                  <div className="flex items-center justify-between text-sm font-medium text-[#1558c0]">
                    <span>进入策略详情</span>
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {!eventsQuery.isLoading && opportunities.length === 0 ? (
          <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)] lg:col-span-2 2xl:col-span-3">
            <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
              <Sparkles className="h-10 w-10 text-[#98a2b3]" />
              <div className="text-lg font-semibold text-[oklch(var(--crypto-ink))]">当前还没有策略命中</div>
              <div className="max-w-xl text-sm leading-6 text-[#667085]">
                先去 Signal Board 运行扫描，或者点击右上角的刷新基础信号，等基础事件进来后这里会自动出现策略卡片。
              </div>
              <button
                onClick={() => runScanMutation.mutate({ limit: 80 })}
                className="inline-flex items-center gap-2 rounded-full bg-[#1558c0] px-5 py-3 text-sm font-medium text-white"
                disabled={runScanMutation.isPending}
              >
                <RefreshCw className={cn("h-4 w-4", runScanMutation.isPending && "animate-spin")} />
                刷新基础信号
              </button>
            </CardContent>
          </Card>
        ) : null}
      </section>
    </div>
  );
}
