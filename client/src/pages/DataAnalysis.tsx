import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mockCryptoAiDataSource } from "@/features/crypto-ai/data-source";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronRight,
  Clock3,
  History,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Wrench,
} from "lucide-react";
import { useMemo, useState } from "react";

type TemplateCategory = {
  key: string;
  title: string;
  items: Array<{
    id: string;
    name: string;
    description: string;
    count: number;
  }>;
};

const templateCategories: TemplateCategory[] = [
  {
    key: "event",
    title: "事件驱动类",
    items: [
      { id: "unlock_analysis", name: "解锁分析", description: "评估未来解锁窗口与潜在抛压。", count: 18 },
      { id: "event_analysis", name: "活动影响", description: "评估活动发放与奖励释放对价格的影响。", count: 12 },
    ],
  },
  {
    key: "anomaly",
    title: "异动诊断类",
    items: [
      { id: "oi_analysis", name: "OI 异动", description: "结合 OI、资金费率与价格做诊断。", count: 21 },
    ],
  },
  {
    key: "health",
    title: "状态体检类",
    items: [
      { id: "full_checkup", name: "全维度体检", description: "输出基础面、流动性与事件的综合报告。", count: 26 },
    ],
  },
];

const recentUsedTemplateIds = ["unlock_analysis", "oi_analysis", "full_checkup"];

function riskTone(riskLevel: "conservative" | "moderate" | "aggressive") {
  if (riskLevel === "aggressive") return "bg-[#fff1f2] text-[#be123c]";
  if (riskLevel === "moderate") return "bg-[#fff7ed] text-[#c2410c]";
  return "bg-[#ecfdf3] text-[#047857]";
}

function formatTemplateName(id: string) {
  return id.replaceAll("_", " ").replace(/\b\w/g, match => match.toUpperCase());
}

export default function DataAnalysis() {
  const workspace = mockCryptoAiDataSource.getAnalysisWorkspace();

  const initialToken =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("symbol") ?? workspace.selectedRun.symbol
      : workspace.selectedRun.symbol;

  const [selectedTemplateId, setSelectedTemplateId] = useState(workspace.selectedRun.templateId);
  const [tokenInput, setTokenInput] = useState(initialToken);
  const [backlookWindow, setBacklookWindow] = useState("30天");
  const [benchmark, setBenchmark] = useState("同板块均值");
  const [preset, setPreset] = useState("默认");
  const [configCollapsed, setConfigCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [openCategories, setOpenCategories] = useState<string[]>(["event", "anomaly", "health"]);

  const activeTemplate =
    workspace.templates.find(template => template.id === selectedTemplateId) ?? workspace.templates[0];

  const recentUsed = useMemo(() => {
    const byId = new Map(
      [...workspace.templates, ...templateCategories.flatMap(category => category.items)].map(item => [item.id, item])
    );
    return recentUsedTemplateIds.map(id => byId.get(id)).filter(Boolean) as Array<{
      id: string;
      name: string;
      description?: string;
    }>;
  }, [workspace.templates]);

  return (
    <div className="space-y-6">
      <section className="rounded-[26px] border border-white/75 bg-white/72 px-5 py-3 shadow-[0_10px_28px_rgba(90,112,153,0.06)]">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[#475467]">
          <div className="inline-flex items-center gap-2 font-medium text-[oklch(var(--crypto-ink))]">
            <Clock3 className="h-4 w-4" />
            11:25
          </div>
          <div>模板 4</div>
          <div>最近运行 3</div>
          <div>刷新于 1 分钟前</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)_280px]">
        <aside className="space-y-5">
          <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-[#344054]">
                <BookOpen className="h-4 w-4" />
                最近使用
              </div>
              <div className="mt-4 space-y-3">
                {recentUsed.map(template => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={cn(
                      "w-full rounded-[20px] border px-4 py-3 text-left transition",
                      selectedTemplateId === template.id
                        ? "border-[#0f66d8] bg-[#eef5ff]"
                        : "border-[#e7edf4] bg-[#f8fafc]"
                    )}
                  >
                    <div className="font-medium text-[oklch(var(--crypto-ink))]">{template.name}</div>
                    {template.description ? (
                      <div className="mt-1 text-sm leading-6 text-muted-foreground">{template.description}</div>
                    ) : null}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="space-y-3">
                {templateCategories.map(category => {
                  const open = openCategories.includes(category.key);
                  return (
                    <div key={category.key} className="rounded-[22px] border border-[#e7edf4] bg-[#fbfcfe]">
                      <button
                        onClick={() =>
                          setOpenCategories(prev =>
                            prev.includes(category.key)
                              ? prev.filter(item => item !== category.key)
                              : [...prev, category.key]
                          )
                        }
                        className="flex w-full items-center justify-between px-4 py-4 text-left"
                      >
                        <span className="font-medium text-[oklch(var(--crypto-ink))]">{category.title}</span>
                        <ChevronDown className={cn("h-4 w-4 text-[#667085] transition", open && "rotate-180")} />
                      </button>
                      {open ? (
                        <div className="space-y-2 border-t border-[#e7edf4] px-3 py-3">
                          {category.items.map(item => (
                            <button
                              key={item.id}
                              onClick={() => setSelectedTemplateId(item.id)}
                              className={cn(
                                "flex w-full items-start justify-between gap-3 rounded-[18px] px-3 py-3 text-left transition",
                                selectedTemplateId === item.id ? "bg-[#eef5ff]" : "bg-white"
                              )}
                            >
                              <div>
                                <div className="font-medium text-[oklch(var(--crypto-ink))]">{item.name}</div>
                                <div className="mt-1 text-sm leading-6 text-muted-foreground">{item.description}</div>
                              </div>
                              <span className="shrink-0 text-sm text-[#98a2b3]">{item.count}</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <Button variant="secondary" className="mt-5 h-11 w-full rounded-full">
                <Plus className="mr-2 h-4 w-4" />
                新建模板
              </Button>
            </CardContent>
          </Card>
        </aside>

        <main className="space-y-6">
          <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              {!configCollapsed ? (
                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <div className="text-sm font-medium text-[#344054]">Token</div>
                      <input
                        value={tokenInput}
                        onChange={event => setTokenInput(event.target.value)}
                        placeholder="支持模糊搜索"
                        className="mt-2 h-12 w-full rounded-2xl border border-[#d8e0eb] bg-white px-4 text-sm text-[#344054] outline-none transition focus:border-[#0f66d8]"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#344054]">Template</div>
                      <div className="mt-2 flex h-12 items-center rounded-2xl border border-[#d8e0eb] bg-white px-4 text-sm font-medium text-[oklch(var(--crypto-ink))]">
                        {activeTemplate.name}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <div className="text-sm font-medium text-[#344054]">回看窗口</div>
                      <div className="mt-2 flex h-12 items-center rounded-2xl border border-[#d8e0eb] bg-white px-4">
                        <select
                          value={backlookWindow}
                          onChange={event => setBacklookWindow(event.target.value)}
                          className="w-full bg-transparent text-sm outline-none"
                        >
                          <option>7天</option>
                          <option>30天</option>
                          <option>90天</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#344054]">对照基准</div>
                      <div className="mt-2 flex h-12 items-center rounded-2xl border border-[#d8e0eb] bg-white px-4">
                        <select
                          value={benchmark}
                          onChange={event => setBenchmark(event.target.value)}
                          className="w-full bg-transparent text-sm outline-none"
                        >
                          <option>同板块均值</option>
                          <option>历史样本</option>
                          <option>无对照</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-[#344054]">配置预设</div>
                      <div className="mt-2 flex h-12 items-center rounded-2xl border border-[#d8e0eb] bg-white px-4">
                        <select
                          value={preset}
                          onChange={event => setPreset(event.target.value)}
                          className="w-full bg-transparent text-sm outline-none"
                        >
                          <option>默认</option>
                          <option>保守</option>
                          <option>激进</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#d6e4ff] bg-[linear-gradient(180deg,#f7fbff_0%,#eef5ff_100%)] px-4 py-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="rounded-full bg-white px-3 py-1 text-[#175cd3] hover:bg-white">
                        {activeTemplate.outputFormat}
                      </Badge>
                      {activeTemplate.requiredData.map(item => (
                        <Badge key={item} variant="secondary" className="rounded-full bg-white px-3 py-1 text-[#344054]">
                          {item}
                        </Badge>
                      ))}
                    </div>
                    <div className="mt-3 text-sm leading-6 text-[#475467]">{activeTemplate.description}</div>
                  </div>
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Button className="h-11 rounded-full bg-[#0f66d8] px-5 hover:bg-[#0d59bf]">
                    <Play className="mr-2 h-4 w-4" />
                    运行模板
                  </Button>
                  <Button variant="secondary" className="h-11 rounded-full px-5">
                    <Save className="mr-2 h-4 w-4" />
                    保存配置
                  </Button>
                  <Button variant="secondary" className="h-11 rounded-full px-5" onClick={() => setConfigCollapsed(prev => !prev)}>
                    <ChevronRight className={cn("mr-2 h-4 w-4 transition", !configCollapsed && "rotate-90")} />
                    {configCollapsed ? "展开配置" : "收起配置"}
                  </Button>
                </div>

                <Button variant="ghost" className="h-11 rounded-full px-4 text-[#667085]">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  重新拉数
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-[#0f66d8]" />
                    <h2 className="text-xl font-semibold text-[oklch(var(--crypto-ink))]">分析结果</h2>
                  </div>
                  <div className="mt-2 max-w-3xl text-sm leading-6 text-[#475467]">
                    {workspace.selectedRun.verdict}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={cn("rounded-full px-3 py-1", riskTone(workspace.selectedRun.riskLevel))}>
                    风险 {workspace.selectedRun.riskLevel}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full bg-[#eef2ff] px-3 py-1 text-[#4338ca]">
                    置信度 {(workspace.selectedRun.confidence * 100).toFixed(0)}%
                  </Badge>
                </div>
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="grid gap-4 md:grid-cols-2">
                  {workspace.selectedRun.keyFindings.map(finding => (
                    <div key={finding} className="rounded-[22px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                      <div className="text-xs uppercase tracking-[0.16em] text-[#175cd3]">Key Finding</div>
                      <div className="mt-2 text-sm leading-6 text-[#344054]">{finding}</div>
                    </div>
                  ))}
                </div>

                <div className="rounded-[24px] border border-[#d6e4ff] bg-[linear-gradient(180deg,#f9fbff_0%,#eef5ff_100%)] p-4">
                  <div className="text-sm font-semibold text-[#0f172a]">信号雷达替代视图</div>
                  <div className="mt-4 space-y-3">
                    {workspace.selectedRun.chartSeries.map(item => (
                      <div key={item.label}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-[#475467]">{item.label}</span>
                          <span className="font-medium text-[#0f172a]">{item.value}</span>
                        </div>
                        <div className="h-2 rounded-full bg-white">
                          <div className="h-2 rounded-full bg-[#0f66d8]" style={{ width: `${item.value}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => setDetailsOpen(prev => !prev)}
                className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-[#175cd3]"
              >
                <ChevronRight className={cn("h-4 w-4 transition", detailsOpen && "rotate-90")} />
                {detailsOpen ? "收起执行细节" : "展开执行细节"}
              </button>

              {detailsOpen ? (
                <div className="mt-4 rounded-[22px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    {activeTemplate.steps.map((step, index) => (
                      <div key={step} className="rounded-[18px] bg-white px-4 py-3 text-sm text-[#344054]">
                        <span className="mr-2 font-semibold text-[#0f66d8]">{index + 1}.</span>
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/80 bg-white/92 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-[#0f66d8]" />
                <h2 className="text-xl font-semibold text-[oklch(var(--crypto-ink))]">分析对话</h2>
              </div>

              <div className="mt-5 space-y-4">
                {workspace.conversation.map(message => (
                  <div
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-[22px] px-4 py-3 text-sm leading-6",
                        message.role === "assistant" && "bg-[#f5f8ff] text-[#344054]",
                        message.role === "user" && "bg-[#0f66d8] text-white",
                        message.role === "tool" && "bg-[#f8fafc] text-[#667085] font-mono text-xs"
                      )}
                    >
                      <div>{message.content}</div>
                      <div
                        className={cn(
                          "mt-2 text-xs",
                          message.role === "user" ? "text-white/70" : "text-[#98a2b3]"
                        )}
                      >
                        {message.timestamp}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>

        <aside className="space-y-5">
          <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-[#344054]">
                <History className="h-4 w-4" />
                最近运行
              </div>
              <div className="mt-4 space-y-3">
                {workspace.recentRuns.map(run => (
                  <div key={run.id} className="rounded-[20px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-[oklch(var(--crypto-ink))]">{run.symbol}</div>
                      <Badge
                        className={cn(
                          "rounded-full px-2.5 py-0.5",
                          run.status === "completed"
                            ? "bg-[#ecfdf3] text-[#047857]"
                            : "bg-[#eef2ff] text-[#4338ca]"
                        )}
                      >
                        {run.status}
                      </Badge>
                    </div>
                    <div className="mt-1 text-sm text-[#475467]">{run.templateName}</div>
                    <div className="mt-2 text-xs text-[#98a2b3]">{run.runAt}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-sm font-medium text-[#344054]">
                <Wrench className="h-4 w-4" />
                可用工具
              </div>
              <div className="mt-4 space-y-3">
                {workspace.tools.map(tool => (
                  <div key={tool.name} className="rounded-[20px] border border-[#e7edf4] bg-[#fbfcfe] p-4">
                    <div className="font-medium text-[oklch(var(--crypto-ink))]">{tool.name}</div>
                    <div className="mt-1 text-sm leading-6 text-[#475467]">{tool.description}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[28px] border border-white/80 bg-white/90 shadow-[0_16px_40px_rgba(83,102,138,0.08)]">
            <CardContent className="p-5">
              <div className="text-sm font-medium text-[#344054]">当前模板</div>
              <div className="mt-3 text-lg font-semibold text-[oklch(var(--crypto-ink))]">
                {activeTemplate.name}
              </div>
              <div className="mt-2 text-sm leading-6 text-[#475467]">
                {activeTemplate.description}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {activeTemplate.requiredData.map(item => (
                  <Badge key={item} variant="secondary" className="rounded-full bg-[#f2f4f7] px-3 py-1 text-[#475467]">
                    {formatTemplateName(item)}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </aside>
      </section>
    </div>
  );
}
