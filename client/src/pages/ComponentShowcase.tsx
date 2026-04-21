import { AIChatBox, type Message as ChatMessage } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { mockCryptoAiDataSource } from "@/features/crypto-ai/data-source";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Bot,
  Download,
  FileText,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Workflow,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type WorkspaceTask = {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
  citations: Array<{
    id: string;
    title: string;
    source: string;
    fetchedAt: string;
    summary: string;
  }>;
  artifacts: Array<{
    id: string;
    name: string;
    type: "report" | "table" | "csv";
    createdAt: string;
    status: "ready" | "generating";
    summary: string;
  }>;
  executionSteps: Array<{
    id: string;
    label: string;
    status: "pending" | "running" | "completed" | "failed";
    detail?: string;
  }>;
  detectedSymbol: string | null;
  taskType: string;
  usedTools: string[];
};

const workspace = mockCryptoAiDataSource.getFreeChatWorkspace();
const introMessage: ChatMessage = {
  role: "assistant",
  content:
    "我是 Free Chat 分析助手。你可以直接问我某个 token 的基础面、深度、解锁、上线活动、链上 holder 或链上资金流，我会优先用你们自己的数据源来回答。",
};

function createTask(title = "新对话"): WorkspaceTask {
  return {
    id: `task-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    title,
    createdAt: new Date().toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    messages: [introMessage],
    citations: [],
    artifacts: [],
    executionSteps: [],
    detectedSymbol: null,
    taskType: "general",
    usedTools: [],
  };
}

export default function ComponentsShowcase() {
  const [tasks, setTasks] = useState<WorkspaceTask[]>([createTask("新建分析任务")]);
  const [activeTaskId, setActiveTaskId] = useState<string>(() => tasks[0]?.id ?? "");
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const utils = trpc.useUtils();

  const conversationListQuery = trpc.chat.listConversations.useQuery();
  const conversationDetailQuery = trpc.chat.getConversation.useQuery(
    { id: activeTaskId },
    {
      enabled:
        activeTaskId.length > 0 &&
        tasks.some(task => task.id === activeTaskId && task.messages.length === 0),
    }
  );

  const sendMessageMutation = trpc.chat.sendMessage.useMutation({
    onError(error) {
      toast.error(error.message || "发送失败，请稍后重试");
    },
  });

  const activeTask = useMemo(
    () => tasks.find(task => task.id === activeTaskId) ?? tasks[0] ?? null,
    [tasks, activeTaskId]
  );
  const visibleExecutionSteps = useMemo(
    () => activeTask?.executionSteps.filter(step => step.status !== "pending") ?? [],
    [activeTask]
  );

  useEffect(() => {
    if (hasHydratedRemote || !conversationListQuery.data || conversationListQuery.data.length === 0) {
      return;
    }

    const remoteTasks: WorkspaceTask[] = conversationListQuery.data.map(item => ({
      id: item.id,
      title: item.title,
      createdAt: new Date(item.updatedAt ?? item.createdAt ?? Date.now()).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      messages: [],
      citations: [],
      artifacts: [],
      executionSteps: [],
      detectedSymbol: item.detectedSymbol ?? null,
      taskType: item.taskType,
      usedTools: [],
    }));

    setTasks(remoteTasks);
    setActiveTaskId(remoteTasks[0]?.id ?? "");
    setHasHydratedRemote(true);
  }, [conversationListQuery.data, hasHydratedRemote]);

  useEffect(() => {
    const detail = conversationDetailQuery.data;
    if (!detail) return;

    updateTaskById(detail.id, task => ({
      ...task,
      title: detail.title,
      createdAt: new Date(detail.updatedAt ?? detail.createdAt ?? Date.now()).toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }),
      messages: detail.messages.map(message => ({
        role: message.role,
        content: message.content,
      })),
      citations: detail.citations,
      artifacts: detail.artifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        type: artifact.type,
        status: artifact.status,
        summary: artifact.summary ?? "",
        createdAt: String(artifact.createdAt ?? ""),
      })),
      executionSteps: detail.executionSteps,
      detectedSymbol: detail.detectedSymbol,
      taskType: detail.taskType,
      usedTools: detail.usedTools,
    }));
  }, [conversationDetailQuery.data]);

  function updateActiveTask(updater: (task: WorkspaceTask) => WorkspaceTask) {
    setTasks(prev =>
      prev.map(task => (task.id === activeTaskId ? updater(task) : task))
    );
  }

  function updateTaskById(taskId: string, updater: (task: WorkspaceTask) => WorkspaceTask) {
    setTasks(prev =>
      prev.map(task => (task.id === taskId ? updater(task) : task))
    );
  }

  async function handleSendMessage(content: string) {
    if (!activeTask) return;

    const userMessage: ChatMessage = {
      role: "user",
      content,
    };

    const baseMessages = [...activeTask.messages, userMessage];
    updateActiveTask(task => ({
      ...task,
      title: deriveTaskTitle(task.title, content),
      messages: baseMessages,
    }));

    const result = await sendMessageMutation.mutateAsync({
      conversationId: activeTask.id.startsWith("task-") ? undefined : activeTask.id,
      title: deriveTaskTitle(activeTask.title, content),
      persist: true,
      messages: baseMessages.map(message => ({
        role: message.role,
        content: message.content,
      })),
    });

    updateActiveTask(task => ({
      ...task,
      id: result.conversationId ?? task.id,
      title: deriveTaskTitle(task.title, content, result.detectedSymbol),
      messages: [
        ...baseMessages,
        {
          role: "assistant",
          content: [
            result.message,
            result.keyFindings.length > 0 ? "" : null,
            result.keyFindings.length > 0 ? "**关键发现**" : null,
            ...result.keyFindings.map(item => `- ${item}`),
            result.suggestedNextActions.length > 0 ? "" : null,
            result.suggestedNextActions.length > 0 ? "**下一步建议**" : null,
            ...result.suggestedNextActions.map(item => `- ${item}`),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      citations: result.citations,
      artifacts: result.artifacts,
      executionSteps: result.executionSteps,
      detectedSymbol: result.detectedSymbol,
      taskType: result.taskType,
      usedTools: result.usedTools,
    }));
    setActiveTaskId(result.conversationId ?? activeTask.id);

    void conversationListQuery.refetch();
  }

  function handleCreateTask() {
    const nextTask = createTask();
    setTasks(prev => [nextTask, ...prev]);
    setActiveTaskId(nextTask.id);
    setMenuTaskId(null);
  }

  function handleRename(taskId: string) {
    const task = tasks.find(item => item.id === taskId);
    if (!task) return;

    const nextTitle =
      typeof window !== "undefined" ? window.prompt("重命名任务", task.title) : task.title;
    if (!nextTitle?.trim()) return;

    setTasks(prev =>
      prev.map(item => (item.id === taskId ? { ...item, title: nextTitle.trim() } : item))
    );
    setMenuTaskId(null);
  }

  function handleDelete(taskId: string) {
    const remaining = tasks.filter(item => item.id !== taskId);
    if (remaining.length === 0) return;
    setTasks(remaining);
    if (activeTaskId === taskId) {
      setActiveTaskId(remaining[0].id);
    }
    setMenuTaskId(null);
  }

  async function handleDownloadArtifact(artifactId: string) {
    const artifact = await utils.chat.getArtifact.fetch({ id: artifactId });
    if (!artifact?.content) {
      toast.error("当前报告内容不可用");
      return;
    }

    const blob = new Blob([artifact.content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = artifact.name.endsWith(".md") ? artifact.name : `${artifact.name}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (!activeTask) {
    return null;
  }

  return (
    <div className="min-h-[calc(100vh-132px)] rounded-[30px] border border-white/80 bg-white/92 shadow-[0_18px_44px_rgba(83,102,138,0.08)]">
      <div className="grid min-h-[calc(100vh-132px)] xl:grid-cols-[260px_minmax(0,1fr)_320px]">
        <aside className="border-r border-[#e8eef6] bg-[#f8fbff]">
          <div className="p-4">
            <Button className="h-12 w-full rounded-xl bg-[#1558c0] hover:bg-[#124ca6]" onClick={handleCreateTask}>
              <Plus className="mr-2 h-4 w-4" />
              新建任务
            </Button>
          </div>

          <div className="space-y-1 px-2 pb-4">
            {tasks.map(task => (
              <div
                key={task.id}
                className={cn(
                  "relative w-full rounded-xl px-4 py-4 text-left transition",
                  activeTaskId === task.id ? "bg-[#dde4ec]" : "hover:bg-[#eef3f9]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <button className="min-w-0 flex-1 text-left" onClick={() => setActiveTaskId(task.id)}>
                    <div className="truncate font-medium text-[oklch(var(--crypto-ink))]">{task.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{task.createdAt}</div>
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-[#667085] transition hover:bg-white/80 hover:text-[oklch(var(--crypto-ink))]"
                    onClick={() => setMenuTaskId(prev => (prev === task.id ? null : task.id))}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>

                {menuTaskId === task.id ? (
                  <div className="absolute right-3 top-12 z-10 w-32 rounded-xl border border-[#dfe7f1] bg-white p-1 shadow-[0_10px_28px_rgba(83,102,138,0.12)]">
                    <button
                      onClick={() => handleRename(task.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#344054] transition hover:bg-[#f5f8fc]"
                    >
                      <Pencil className="h-4 w-4" />
                      重命名
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#d92d20] transition hover:bg-[#fff1f3]"
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </aside>

        <main className="flex min-h-[calc(100vh-132px)] flex-col">
          <div className="flex h-16 items-center justify-between border-b border-[#e8eef6] px-5">
            <div className="flex items-center gap-2 text-sm font-medium text-[oklch(var(--crypto-ink))]">
              <Bot className="h-4 w-4 text-[#1558c0]" />
              Free Chat
              <span className="text-[#98a2b3]">· {activeTask.title}</span>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-[#d6e3f4] bg-[#f7fbff] text-[#1558c0]">
                {activeTask.taskType}
              </Badge>
              {conversationListQuery.data && conversationListQuery.data.length > 0 ? (
                <Badge variant="outline" className="border-[#dfe7f1] bg-white text-[#667085]">
                  <History className="mr-1 h-3 w-3" />
                  已保存
                </Badge>
              ) : null}
              {activeTask.detectedSymbol ? (
                <Badge variant="secondary" className="bg-[#eef4ff] text-[#1558c0]">
                  {activeTask.detectedSymbol}
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-5">
            <AIChatBox
              messages={activeTask.messages}
              onSendMessage={handleSendMessage}
              isLoading={sendMessageMutation.isPending}
              height="100%"
              placeholder="直接问：分析 BTC 的解锁压力 / 看 ETH 深度变化 / 看 SOL 链上 holder"
              emptyStateMessage="开始一轮基于内部数据源的分析"
              suggestedPrompts={workspace.suggestedPrompts}
              className="h-full rounded-[24px] border-[#dfe7f1] bg-white"
            />
          </div>
        </main>

        <aside className="border-l border-[#e8eef6] bg-[#fcfdff]">
          <ScrollArea className="h-[calc(100vh-132px)]">
            <div className="space-y-4 p-4">
              <Card className="rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#1558c0]" />
                    输出文件
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeTask.artifacts.length === 0 ? (
                    <div className="text-sm text-muted-foreground">当前回答还没有生成文件型产物。</div>
                  ) : (
                    activeTask.artifacts.map(file => (
                      <div key={file.id} className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium text-[oklch(var(--crypto-ink))]">{file.name}</div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-[#eef4ff] text-[#1558c0]">
                              {file.type}
                            </Badge>
                            <button
                              className="text-[#667085] transition hover:text-[#1558c0]"
                              onClick={() => handleDownloadArtifact(file.id)}
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="mt-2 text-sm leading-6 text-muted-foreground">{file.summary}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">数据引用</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeTask.citations.length === 0 ? (
                    <div className="text-sm text-muted-foreground">当前还没有引用数据块。</div>
                  ) : (
                    activeTask.citations.map(citation => (
                      <div key={citation.id} className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
                        <div className="text-sm font-medium text-[oklch(var(--crypto-ink))]">{citation.title}</div>
                        <div className="mt-1 text-xs text-[#667085]">{citation.source}</div>
                        <div className="mt-2 text-sm leading-6 text-muted-foreground">{citation.summary}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Workflow className="h-4 w-4 text-[#1558c0]" />
                    执行步骤
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {visibleExecutionSteps.length === 0 ? (
                    <div className="text-sm text-muted-foreground">发送问题后会展示编排步骤。</div>
                  ) : (
                    visibleExecutionSteps.map(step => (
                      <div key={step.id} className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-medium leading-5 text-[oklch(var(--crypto-ink))]">{step.label}</div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "capitalize",
                              step.status === "completed" && "border-[#ccebd7] bg-[#ecfdf3] text-[#047857]",
                              step.status === "running" && "border-[#d6e3f4] bg-[#eef5ff] text-[#1558c0]",
                              step.status === "failed" && "border-[#ffd8d5] bg-[#fff3f2] text-[#b42318]"
                            )}
                          >
                            {step.status}
                          </Badge>
                        </div>
                        {step.detail ? (
                          <div className="mt-1 text-xs leading-5 text-muted-foreground line-clamp-2">{step.detail}</div>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-[#1558c0]" />
                    已用工具
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {activeTask.usedTools.length === 0 ? (
                    <div className="text-sm text-muted-foreground">等待首次执行。</div>
                  ) : (
                    activeTask.usedTools.map(tool => (
                      <Badge key={tool} variant="outline" className="border-[#d6e3f4] bg-[#f7fbff] text-[#1558c0]">
                        {tool}
                      </Badge>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </ScrollArea>
        </aside>
      </div>
    </div>
  );
}

function deriveTaskTitle(currentTitle: string, content: string, symbol?: string | null) {
  if (currentTitle !== "新对话" && currentTitle !== "新建分析任务") {
    return currentTitle;
  }

  if (symbol) {
    return `${symbol} 分析`;
  }

  return content.length > 18 ? `${content.slice(0, 18)}...` : content;
}
