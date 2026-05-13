import { useEffect, useMemo, useState } from "react";
import {
  BookOpenText,
  CheckCircle2,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type RunStatus = "running" | "success" | "failed";
type ProposalStatus = "pending" | "approved" | "rejected";
type LabelStage = "bootstrap" | "downstream" | "behavior" | "sink" | "cluster";
type RunListItem = {
  runId: string;
  chain: string;
  symbol: string;
  proposalCount: number;
  pendingCount: number;
  approvedCount: number;
  status: RunStatus;
};
type ReviewQueueItem = {
  id: string;
  address: string;
  displayName: string;
  stage: LabelStage;
  detector: string;
  reasonSummary: string;
  confidence: number;
  evidence: string[];
  subtype?: string;
  tags?: string[];
  reviewNote?: string;
};
type ActiveLabelItem = {
  id: string;
  tokenId: number;
  chain: string;
  address: string;
  label: string;
  displayName: string;
  subtype: string | null;
  tags: string[];
  confidence: number;
  approvedBy: string;
  approvedAt: string | null;
};

function stageLabel(stage: LabelStage) {
  if (stage === "bootstrap") return "初始分配";
  if (stage === "downstream") return "下游继承";
  if (stage === "behavior") return "行为识别";
  return "终点地址";
}

function statusTone(status: RunStatus | ProposalStatus) {
  if (status === "success" || status === "approved") return "bg-[#ecfdf3] text-[#027a48]";
  if (status === "failed" || status === "rejected") return "bg-[#fef3f2] text-[#b42318]";
  return "bg-[#eef4ff] text-[#175cd3]";
}

function compactAddress(address: string) {
  return address.length <= 14 ? address : `${address.slice(0, 8)}...${address.slice(-4)}`;
}

export default function Workbench() {
  const [activeRunId, setActiveRunId] = useState("");
  const [symbol, setSymbol] = useState("PRL");
  const [chain, setChain] = useState("BSC");
  const [preWindowDays, setPreWindowDays] = useState("7");
  const [claimWindowDays, setClaimWindowDays] = useState("14");
  const [tolerancePct, setTolerancePct] = useState("0.5");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [queueKeyword, setQueueKeyword] = useState("");
  const utils = trpc.useUtils();

  const dictionaryQuery = trpc.labels.getLabelDictionary.useQuery();
  const runsQuery = trpc.labels.listRuns.useQuery();
  const runDetailQuery = trpc.labels.getRun.useQuery(
    { runId: activeRunId },
    { enabled: Boolean(activeRunId) }
  );
  const reviewQueueQuery = trpc.labels.getReviewQueue.useQuery(
    {
      runId: activeRunId,
      status: "pending",
      keyword: queueKeyword.trim() || undefined,
    },
    { enabled: Boolean(activeRunId) }
  );

  const startAnalysisMutation = trpc.labels.startAnalysis.useMutation({
    onSuccess: async result => {
      await utils.labels.listRuns.invalidate();
      await utils.labels.getRun.invalidate();
      await utils.labels.getReviewQueue.invalidate();
      setActiveRunId(result.runId);
      toast.success(`${result.run.symbol} 标签分析已加入工作台，已生成首批 proposal`);
    },
    onError: error => {
      toast.error(error.message || "发起分析失败");
    },
  });

  const reviewProposalMutation = trpc.labels.reviewProposal.useMutation({
    onSuccess: async result => {
      await utils.labels.listRuns.invalidate();
      await utils.labels.getRun.invalidate({ runId: result.runId });
      await utils.labels.getReviewQueue.invalidate({ runId: result.runId, status: "pending", keyword: queueKeyword.trim() || undefined });
      if (activeRun?.tokenId) {
        await utils.labels.getActiveLabels.invalidate({
          tokenId: Number(activeRun.tokenId),
          chain: activeRun.chain,
        });
      }
    },
    onError: error => {
      toast.error(error.message || "审核失败");
    },
  });

  useEffect(() => {
    if (!activeRunId && runsQuery.data && runsQuery.data.length > 0) {
      setActiveRunId(runsQuery.data[0].runId);
    }
  }, [activeRunId, runsQuery.data]);

  const activeRun = useMemo(
    () => runDetailQuery.data?.run ?? null,
    [runDetailQuery.data]
  );
  const activeLabelsQuery = trpc.labels.getActiveLabels.useQuery(
    {
      tokenId: Number(activeRun?.tokenId ?? 0),
      chain: activeRun?.chain,
    },
    { enabled: Boolean(activeRun?.tokenId) }
  );

  const summary = useMemo(() => {
    const allRuns = runsQuery.data ?? [];
    return {
      runs: allRuns.length,
      proposals: allRuns.reduce((sum: number, item: RunListItem) => sum + item.proposalCount, 0),
      pending: allRuns.reduce((sum: number, item: RunListItem) => sum + item.pendingCount, 0),
      approved: allRuns.reduce((sum: number, item: RunListItem) => sum + item.approvedCount, 0),
    };
  }, [runsQuery.data]);

  const reviewQueue = useMemo(() => {
    return reviewQueueQuery.data?.items ?? [];
  }, [reviewQueueQuery.data]);

  const stageCounts = useMemo(() => {
    return runDetailQuery.data?.proposalsByStage ?? [];
  }, [runDetailQuery.data]);

  function handleStartAnalysis() {
    const normalizedSymbol = symbol.trim().toUpperCase();
    if (!normalizedSymbol) {
      toast.error("请先输入代币 Symbol");
      return;
    }

    startAnalysisMutation.mutate({
      symbol: normalizedSymbol,
      chain,
      preWindowDays: Number(preWindowDays) || 7,
      claimWindowDays: Number(claimWindowDays) || 14,
      tolerancePct: Number(tolerancePct) || 0.5,
    });
  }

  function approveProposal(proposalId: string) {
    reviewProposalMutation.mutate(
      { proposalId, action: "approve", reviewNote: reviewNotes[proposalId]?.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Proposal 已批准并进入生产标签候选集");
        },
      }
    );
  }

  function rejectProposal(proposalId: string) {
    const note = reviewNotes[proposalId]?.trim();
    if (!note) {
      toast.error("拒绝时请填写审核备注");
      return;
    }
    reviewProposalMutation.mutate(
      { proposalId, action: "reject", reviewNote: note },
      {
        onSuccess: () => {
          toast.success("Proposal 已拒绝");
        },
      }
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[32px] border border-white/75 bg-[linear-gradient(135deg,rgba(14,66,164,0.97),rgba(14,120,102,0.92))] text-white shadow-[0_20px_60px_rgba(24,70,150,0.24)]">
        <div className="grid gap-6 px-6 py-7 md:grid-cols-[1.6fr_1fr] md:px-8">
          <div className="space-y-4">
            <Badge className="rounded-full border-white/25 bg-white/12 px-3 py-1 text-white">工作台 / Address Labeling</Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight">把标签分析、审核和入库放到同一个工作台里</h1>
              <p className="max-w-3xl text-sm leading-7 text-white/82">
                这版先做清晰主链路：选代币、生成 proposal、人工审核、沉淀 active labels。页面先用前端可交互流程承载，
                后续再平滑接入真实 detector 和 tRPC。
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-white/14 bg-white/10 py-5 text-white shadow-none">
              <CardContent className="px-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">运行任务</div>
                <div className="mt-2 text-3xl font-semibold">{summary.runs}</div>
              </CardContent>
            </Card>
            <Card className="border-white/14 bg-white/10 py-5 text-white shadow-none">
              <CardContent className="px-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">总提案</div>
                <div className="mt-2 text-3xl font-semibold">{summary.proposals}</div>
              </CardContent>
            </Card>
            <Card className="border-white/14 bg-white/10 py-5 text-white shadow-none">
              <CardContent className="px-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">待审核</div>
                <div className="mt-2 text-3xl font-semibold">{summary.pending}</div>
              </CardContent>
            </Card>
            <Card className="border-white/14 bg-white/10 py-5 text-white shadow-none">
              <CardContent className="px-5">
                <div className="text-xs uppercase tracking-[0.16em] text-white/60">已批准</div>
                <div className="mt-2 text-3xl font-semibold">{summary.approved}</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Tabs defaultValue="runs" className="space-y-5">
        <TabsList className="grid h-auto w-full grid-cols-4 rounded-[18px] bg-white/70 p-1">
          <TabsTrigger value="runs" className="h-11 rounded-[14px]">
            <LayoutDashboard className="h-4 w-4" />
            运行中心
          </TabsTrigger>
          <TabsTrigger value="review" className="h-11 rounded-[14px]">
            <ClipboardCheck className="h-4 w-4" />
            审核队列
          </TabsTrigger>
          <TabsTrigger value="dictionary" className="h-11 rounded-[14px]">
            <BookOpenText className="h-4 w-4" />
            字典总览
          </TabsTrigger>
          <TabsTrigger value="labels" className="h-11 rounded-[14px]">
            <Database className="h-4 w-4" />
            生产标签
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="space-y-6">
          <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
            <Card className="rounded-[28px] border-white/80 bg-white/92">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-[oklch(var(--crypto-ink))]">
                  <Play className="h-4 w-4 text-[#175cd3]" />
                  发起标签分析
                </CardTitle>
                <CardDescription>先用轻量参数发起一次 token scoped run，把 proposal 放进工作台。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#344054]">Symbol</label>
                  <Input value={symbol} onChange={event => setSymbol(event.target.value)} placeholder="例如 PRL / SHARE" />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#344054]">Chain</label>
                  <Select value={chain} onValueChange={setChain}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择链" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BSC">BSC</SelectItem>
                      <SelectItem value="Ethereum">Ethereum</SelectItem>
                      <SelectItem value="Base">Base</SelectItem>
                      <SelectItem value="Solana">Solana</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-[#667085]">pre_window</label>
                    <Input value={preWindowDays} onChange={event => setPreWindowDays(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-[#667085]">claim_window</label>
                    <Input value={claimWindowDays} onChange={event => setClaimWindowDays(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium uppercase tracking-[0.14em] text-[#667085]">tolerance_pct</label>
                    <Input value={tolerancePct} onChange={event => setTolerancePct(event.target.value)} />
                  </div>
                </div>

                <div className="rounded-[20px] border border-dashed border-[#c8d7ee] bg-[#f8fbff] p-4 text-sm leading-6 text-[#52607a]">
                  当前实现先承载工作流体验：点击后会生成一批 demo proposals，方便演示 run、review、dictionary 三段主链路。
                </div>

                <Button className="h-11 w-full rounded-full bg-[#175cd3] hover:bg-[#124fb3]" onClick={handleStartAnalysis}>
                  <Sparkles className="h-4 w-4" />
                  {startAnalysisMutation.isPending ? "分析中..." : "开始分析"}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-white/80 bg-white/92">
              <CardHeader>
                <CardTitle className="text-[oklch(var(--crypto-ink))]">最近运行</CardTitle>
                <CardDescription>用 run 维度串起“发起、查看、审核”三件事。</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Token</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead className="text-right">提案数</TableHead>
                      <TableHead className="text-right">待审</TableHead>
                      <TableHead className="text-right">已批</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(runsQuery.data ?? []).map((run: RunListItem) => {
                      const active = activeRunId === run.runId;

                      return (
                        <TableRow key={run.runId} data-state={active ? "selected" : undefined}>
                          <TableCell className="font-medium">{run.runId}</TableCell>
                          <TableCell>{run.symbol} / {run.chain}</TableCell>
                          <TableCell>
                            <Badge className={cn("rounded-full border-0", statusTone(run.status))}>{run.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">{run.proposalCount}</TableCell>
                          <TableCell className="text-right">{run.pendingCount}</TableCell>
                          <TableCell className="text-right">{run.approvedCount}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant={active ? "secondary" : "outline"}
                              size="sm"
                              onClick={() => setActiveRunId(run.runId)}
                            >
                              选中
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {runsQuery.data?.length ? null : (
                  <div className="py-8 text-center text-sm text-[#667085]">当前还没有 run，先发起一次标签分析。</div>
                )}
              </CardContent>
            </Card>
          </div>

          {activeRun ? (
            <Card className="rounded-[28px] border-white/80 bg-white/92">
              <CardHeader>
                <CardTitle className="text-[oklch(var(--crypto-ink))]">Run 详情</CardTitle>
                <CardDescription>
                  当前选中 {activeRun.symbol} / {activeRun.chain}，按 stage 看 proposal 分布，方便决定先审哪一层。
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                  <div className="rounded-[22px] border border-[#e7edf4] bg-[#f8fafc] p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">Run 配置</div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <div>
                        <div className="text-xs text-[#667085]">Triggered By</div>
                        <div className="mt-1 font-medium text-[#101828]">{activeRun.triggeredBy}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#667085]">Started At</div>
                        <div className="mt-1 font-medium text-[#101828]">{activeRun.startedAt}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#667085]">Pre Window</div>
                        <div className="mt-1 font-medium text-[#101828]">{activeRun.config.preWindowDays}d</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#667085]">Tolerance</div>
                        <div className="mt-1 font-medium text-[#101828]">{activeRun.config.tolerancePct}%</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-[#e7edf4] bg-[#f8fafc] p-4">
                    <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">审核进度</div>
                    <div className="mt-3 text-2xl font-semibold text-[#101828]">
                      {reviewQueueQuery.data?.progress.reviewed ?? 0}/{reviewQueueQuery.data?.progress.total ?? activeRun.proposals.length}
                    </div>
                    <Progress
                      className="mt-3 h-2.5 bg-[#dbe7fb]"
                      value={
                        (reviewQueueQuery.data?.progress.total ?? activeRun.proposals.length) === 0
                          ? 0
                          : ((reviewQueueQuery.data?.progress.reviewed ?? 0) /
                              (reviewQueueQuery.data?.progress.total ?? activeRun.proposals.length)) *
                            100
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {stageCounts.map(item => (
                    <div key={item.stage} className="rounded-[22px] border border-[#e7edf4] bg-white p-4">
                      <div className="text-sm font-medium text-[#101828]">{stageLabel(item.stage)}</div>
                      <div className="mt-2 text-3xl font-semibold text-[#175cd3]">{item.total}</div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#667085]">
                        <span>待审 {item.pending}</span>
                        <span>已批 {item.approved}</span>
                        <span>已拒 {item.rejected}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="review" className="space-y-6">
          <Card className="rounded-[28px] border-white/80 bg-white/92">
            <CardHeader>
              <CardTitle className="text-[oklch(var(--crypto-ink))]">审核队列</CardTitle>
              <CardDescription>先按 run 选择上下文，再逐条批准或拒绝 proposal。拒绝时必须写清楚原因。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#344054]">当前 Run</label>
                  <Select value={activeRunId} onValueChange={setActiveRunId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择 run" />
                    </SelectTrigger>
                    <SelectContent>
                      {(runsQuery.data ?? []).map((run: RunListItem) => (
                        <SelectItem key={run.runId} value={run.runId}>
                          {run.symbol} / {run.chain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-[#344054]">搜索 Proposal</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a2b3]" />
                    <Input
                      value={queueKeyword}
                      onChange={event => setQueueKeyword(event.target.value)}
                      placeholder="按地址、标签或理由搜索"
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              {reviewQueue.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#c8d7ee] bg-[#f8fbff] p-8 text-center text-sm text-[#667085]">
                  当前筛选下没有待审核 proposal。
                </div>
              ) : (
                <div className="space-y-4">
                  {reviewQueue.map((item: ReviewQueueItem) => (
                    <div key={item.id} className="rounded-[24px] border border-[#e7edf4] bg-white p-5 shadow-[0_12px_30px_rgba(88,107,142,0.06)]">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-lg font-semibold text-[#101828]">{compactAddress(item.address)}</div>
                            <Badge className="rounded-full bg-[#edf3ff] text-[#175cd3]">{item.displayName}</Badge>
                            <Badge variant="outline" className="rounded-full">
                              {stageLabel(item.stage)}
                            </Badge>
                            <Badge variant="outline" className="rounded-full">
                              {item.detector}
                            </Badge>
                          </div>
                          <p className="max-w-3xl text-sm leading-6 text-[#475467]">{item.reasonSummary}</p>
                        </div>
                        <div className="min-w-[130px] rounded-[20px] border border-[#dbe4f2] bg-[#f8fafc] px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">Confidence</div>
                          <div className="mt-1 text-2xl font-semibold text-[#101828]">{Math.round(item.confidence * 100)}%</div>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                        <div className="rounded-[20px] border border-[#e7edf4] bg-[#f8fafc] p-4">
                          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[#101828]">
                            <ShieldCheck className="h-4 w-4 text-[#175cd3]" />
                            Evidence
                          </div>
                          <ul className="space-y-2 text-sm leading-6 text-[#475467]">
                            {item.evidence.map((line: string) => (
                              <li key={line} className="rounded-[14px] bg-white px-3 py-2">
                                {line}
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="space-y-4 rounded-[20px] border border-[#e7edf4] bg-[#f8fafc] p-4">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[16px] bg-white px-3 py-3">
                              <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">Subtype</div>
                              <div className="mt-1 text-sm font-medium text-[#101828]">{item.subtype || "—"}</div>
                            </div>
                            <div className="rounded-[16px] bg-white px-3 py-3">
                              <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">Tags</div>
                              <div className="mt-1 text-sm font-medium text-[#101828]">{(item.tags ?? []).join(", ") || "—"}</div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium text-[#344054]">审核备注</label>
                            <Textarea
                              value={reviewNotes[item.id] ?? item.reviewNote ?? ""}
                              onChange={event =>
                                setReviewNotes(current => ({
                                  ...current,
                                  [item.id]: event.target.value,
                                }))
                              }
                              placeholder="拒绝时写明原因；批准时也可以补充解释。"
                              className="min-h-[120px] bg-white"
                            />
                          </div>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              className="rounded-full bg-[#175cd3] hover:bg-[#124fb3]"
                              onClick={() => approveProposal(item.id)}
                              disabled={reviewProposalMutation.isPending}
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              批准
                            </Button>
                            <Button
                              variant="destructive"
                              className="rounded-full"
                              onClick={() => rejectProposal(item.id)}
                              disabled={reviewProposalMutation.isPending}
                            >
                              <XCircle className="h-4 w-4" />
                              拒绝
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dictionary" className="space-y-6">
          <Card className="rounded-[28px] border-white/80 bg-white/92">
            <CardHeader>
              <CardTitle className="text-[oklch(var(--crypto-ink))]">标签字典总览</CardTitle>
              <CardDescription>先把 label 术语统一到同一页，方便产品、运营和研发一起对齐。</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              {(dictionaryQuery.data ?? []).map(item => (
                <div key={item.key} className="rounded-[24px] border border-[#e7edf4] bg-[#f8fafc] p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-lg font-semibold text-[#101828]">{item.displayName}</div>
                    <Badge className="rounded-full bg-[#edf3ff] text-[#175cd3]">{item.key}</Badge>
                    <Badge variant="outline" className="rounded-full">
                      {stageLabel(item.stage)}
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-[#475467]">{item.description}</p>
                  <div className="mt-4 rounded-[16px] bg-white px-4 py-3 text-sm leading-6 text-[#344054]">
                    <div className="text-xs uppercase tracking-[0.14em] text-[#667085]">检测规则</div>
                    <div className="mt-1">{item.rule}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[#667085]">
                    <span>主 Detector:</span>
                    <Badge variant="outline" className="rounded-full bg-white">
                      {item.detector}
                    </Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.conflictsWith.map(conflict => (
                      <Badge key={conflict} variant="outline" className="rounded-full bg-[#fff7ed] text-[#b54708]">
                        冲突: {conflict}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="labels" className="space-y-6">
          <Card className="rounded-[28px] border-white/80 bg-white/92">
            <CardHeader>
              <CardTitle className="text-[oklch(var(--crypto-ink))]">已生效标签</CardTitle>
              <CardDescription>
                展示当前选中 run 对应 token / chain 下，已经写入 `addressLabels` 且 `is_active = true` 的记录。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!activeRun ? (
                <div className="rounded-[22px] border border-dashed border-[#c8d7ee] bg-[#f8fbff] p-8 text-center text-sm text-[#667085]">
                  先在运行中心选中一个 run。
                </div>
              ) : activeLabelsQuery.isLoading ? (
                <div className="rounded-[22px] border border-dashed border-[#c8d7ee] bg-[#f8fbff] p-8 text-center text-sm text-[#667085]">
                  正在加载生产标签...
                </div>
              ) : (activeLabelsQuery.data?.items.length ?? 0) === 0 ? (
                <div className="rounded-[22px] border border-dashed border-[#c8d7ee] bg-[#f8fbff] p-8 text-center text-sm text-[#667085]">
                  当前 token / chain 还没有已生效标签。先去审核队列批准 proposal。
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>标签</TableHead>
                      <TableHead>地址</TableHead>
                      <TableHead>链</TableHead>
                      <TableHead>Subtype</TableHead>
                      <TableHead>Tags</TableHead>
                      <TableHead className="text-right">置信度</TableHead>
                      <TableHead>批准人</TableHead>
                      <TableHead>批准时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activeLabelsQuery.data?.items ?? []).map((item: ActiveLabelItem) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{item.displayName}</span>
                            <Badge variant="outline" className="rounded-full">{item.label}</Badge>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono">{compactAddress(item.address)}</TableCell>
                        <TableCell>{item.chain}</TableCell>
                        <TableCell>{item.subtype || "—"}</TableCell>
                        <TableCell>{(item.tags ?? []).join(", ") || "—"}</TableCell>
                        <TableCell className="text-right">{Math.round(item.confidence * 100)}%</TableCell>
                        <TableCell>{item.approvedBy}</TableCell>
                        <TableCell>{item.approvedAt || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
