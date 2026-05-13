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
  intent: Record<string, unknown> | null;
  detectedSymbol: string | null;
  taskType: string;
  usedTools: string[];
  researchPlan: ResearchPlan | null;
};

type ResearchPlan = {
  subQuestions: string[];
  plannedTools: Array<{
    name: string;
    rationale: string;
  }>;
  rationale: string;
};

const workspace = mockCryptoAiDataSource.getFreeChatWorkspace();
const TASKS_STORAGE_KEY = "crypto-ai-free-chat-tasks";
const ACTIVE_TASK_STORAGE_KEY = "crypto-ai-free-chat-active-task-id";
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
    intent: null,
    detectedSymbol: null,
    taskType: "general",
    usedTools: [],
    researchPlan: null,
  };
}

function getDefaultTasks() {
  return [createTask("新建分析任务")];
}

function loadPersistedTasks() {
  if (typeof window === "undefined") {
    return getDefaultTasks();
  }

  try {
    const raw = window.localStorage.getItem(TASKS_STORAGE_KEY);
    if (!raw) {
      return getDefaultTasks();
    }

    const parsed = JSON.parse(raw) as WorkspaceTask[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return getDefaultTasks();
    }

    return parsed.map(task => ({
      ...task,
      messages: Array.isArray(task.messages) && task.messages.length > 0 ? task.messages : [introMessage],
      citations: Array.isArray(task.citations) ? task.citations : [],
      artifacts: Array.isArray(task.artifacts) ? task.artifacts : [],
      executionSteps: Array.isArray(task.executionSteps) ? task.executionSteps : [],
      intent: task.intent ?? null,
      detectedSymbol: task.detectedSymbol ?? null,
      taskType: task.taskType ?? "general",
      usedTools: Array.isArray(task.usedTools) ? task.usedTools : [],
      researchPlan: isResearchPlan(task.researchPlan) ? task.researchPlan : null,
    }));
  } catch {
    return getDefaultTasks();
  }
}

function loadPersistedActiveTaskId(tasks: WorkspaceTask[]) {
  if (typeof window === "undefined") {
    return tasks[0]?.id ?? "";
  }

  const persisted = window.localStorage.getItem(ACTIVE_TASK_STORAGE_KEY);
  if (persisted && (tasks.length === 0 || tasks.some(task => task.id === persisted))) {
    return persisted;
  }

  return tasks[0]?.id ?? "";
}

export default function ComponentsShowcase() {
  const [tasks, setTasks] = useState<WorkspaceTask[]>(() => loadPersistedTasks());
  const [activeTaskId, setActiveTaskId] = useState<string>(() => loadPersistedActiveTaskId([]));
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null);
  const [hasHydratedRemote, setHasHydratedRemote] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
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

  const activeTask = useMemo(
    () => tasks.find(task => task.id === activeTaskId) ?? tasks[0] ?? null,
    [tasks, activeTaskId]
  );
  const visibleExecutionSteps = useMemo(
    () => activeTask?.executionSteps.filter(step => step.status !== "pending") ?? [],
    [activeTask]
  );

  const liveStatus = useMemo(() => {
    if (!isStreaming) return undefined;
    const running = activeTask?.executionSteps.findLast(s => s.status === "running");
    return running?.label;
  }, [isStreaming, activeTask?.executionSteps]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeTaskId) return;
    window.localStorage.setItem(ACTIVE_TASK_STORAGE_KEY, activeTaskId);
  }, [activeTaskId]);

  useEffect(() => {
    if (tasks.length === 0) return;
    if (!tasks.some(task => task.id === activeTaskId)) {
      setActiveTaskId(tasks[0]?.id ?? "");
    }
  }, [tasks, activeTaskId]);

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
      intent: null,
      detectedSymbol: item.detectedSymbol ?? null,
      taskType: item.taskType,
      usedTools: [],
      researchPlan: null,
    }));

    setTasks(prev => {
      const localOnlyTasks = prev.filter(task => task.id.startsWith("task-"));
      return [...remoteTasks, ...localOnlyTasks];
    });
    setActiveTaskId(currentId => {
      if (remoteTasks.some(task => task.id === currentId)) {
        return currentId;
      }
      return remoteTasks[0]?.id ?? currentId;
    });
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
      intent: (detail.intent as Record<string, unknown> | null) ?? null,
      detectedSymbol: detail.detectedSymbol,
      taskType: detail.taskType,
      usedTools: detail.usedTools,
      researchPlan: isResearchPlan(detail.researchPlan) ? detail.researchPlan : null,
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
    if (!activeTask || isStreaming) return;

    const userMessage: ChatMessage = { role: "user", content };
    const baseMessages = [...activeTask.messages, userMessage];
    const taskId = activeTask.id;
    const conversationId = activeTask.id.startsWith("task-") ? undefined : activeTask.id;

    updateActiveTask(task => ({
      ...task,
      title: deriveTaskTitle(task.title, content),
      messages: baseMessages,
      executionSteps: [],
      researchPlan: null,
    }));

    setIsStreaming(true);

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          title: deriveTaskTitle(activeTask.title, content),
          persist: true,
          messages: baseMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Stream request failed: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const liveSteps: WorkspaceTask["executionSteps"] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          let event: Record<string, unknown>;
          try {
            event = JSON.parse(json) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event.type === "step") {
            const step = event.step as WorkspaceTask["executionSteps"][number];
            const idx = liveSteps.findIndex(s => s.id === step.id);
            if (idx >= 0) {
              liveSteps[idx] = step;
            } else {
              liveSteps.push(step);
            }
            updateTaskById(taskId, task => ({ ...task, executionSteps: [...liveSteps] }));
          } else if (event.type === "plan") {
            const plan = event.plan;
            if (isResearchPlan(plan)) {
              updateTaskById(taskId, task => ({ ...task, researchPlan: plan }));
            }
          } else if (event.type === "tool_call") {
            const toolStep: WorkspaceTask["executionSteps"][number] = {
              id: `tool-${String(event.name)}-${Date.now()}`,
              label: String(event.label ?? event.name),
              status: "running",
            };
            liveSteps.push(toolStep);
            updateTaskById(taskId, task => ({ ...task, executionSteps: [...liveSteps] }));
          } else if (event.type === "tool_result") {
            const name = String(event.name);
            const idx = [...liveSteps].reverse().findIndex(s => s.id.startsWith(`tool-${name}`));
            const realIdx = idx >= 0 ? liveSteps.length - 1 - idx : -1;
            if (realIdx >= 0) {
              liveSteps[realIdx] = {
                ...liveSteps[realIdx],
                status: event.ok ? "completed" : "failed",
                detail: String(event.summary ?? ""),
              };
            }
            updateTaskById(taskId, task => ({ ...task, executionSteps: [...liveSteps] }));
          } else if (event.type === "answer") {
            const payload = event.payload as {
              message: string;
              keyFindings: string[];
              suggestedNextActions: string[];
              detectedSymbol?: string | null;
              taskType?: string;
              citations?: WorkspaceTask["citations"];
              artifacts?: WorkspaceTask["artifacts"];
              executionSteps?: WorkspaceTask["executionSteps"];
              usedTools?: string[];
              usedFallback?: boolean;
              intent?: Record<string, unknown> | null;
            };

            const fallbackBadge = payload.usedFallback
              ? "> ⚠ 本次回答未引用工具数据，请谨慎参考。\n\n"
              : "";

            const assistantContent = [
              fallbackBadge + payload.message,
              payload.keyFindings?.length > 0 ? "" : null,
              payload.keyFindings?.length > 0 ? "**关键发现**" : null,
              ...(payload.keyFindings ?? []).map(item => `- ${item}`),
              payload.suggestedNextActions?.length > 0 ? "" : null,
              payload.suggestedNextActions?.length > 0 ? "**下一步建议**" : null,
              ...(payload.suggestedNextActions ?? []).map(item => `- ${item}`),
            ]
              .filter(Boolean)
              .join("\n");

            updateTaskById(taskId, task => ({
              ...task,
              title: deriveTaskTitle(task.title, content, payload.detectedSymbol ?? null),
              messages: [...baseMessages, { role: "assistant", content: assistantContent }],
              citations: payload.citations ?? [],
              artifacts: payload.artifacts ?? [],
              executionSteps: payload.executionSteps ?? liveSteps,
              intent: (payload.intent as Record<string, unknown> | null) ?? null,
              detectedSymbol: payload.detectedSymbol ?? null,
              taskType: payload.taskType ?? "general",
              usedTools: payload.usedTools ?? [],
            }));
          } else if (event.type === "conversation_saved") {
            const newConversationId = String(event.conversationId);
            updateTaskById(taskId, task => ({ ...task, id: newConversationId }));
            setActiveTaskId(newConversationId);
            void conversationListQuery.refetch();
          } else if (event.type === "error") {
            toast.error(String(event.message ?? "分析过程出错"));
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "发送失败，请稍后重试");
    } finally {
      setIsStreaming(false);
    }
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
    const nextTasks = remaining.length > 0 ? remaining : getDefaultTasks();
    setTasks(nextTasks);
    if (activeTaskId === taskId) {
      setActiveTaskId(nextTasks[0]?.id ?? "");
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
    <div className="mx-auto h-[calc(100vh-132px)] w-full max-w-[1600px] overflow-hidden rounded-[30px] border border-[#dfe7f1] bg-white shadow-[0_18px_44px_rgba(83,102,138,0.08)]">
      <div className="grid h-full min-w-0 grid-cols-1 lg:grid-cols-[240px_minmax(0,1fr)_minmax(280px,320px)]">
        <aside className="flex h-full min-w-0 flex-col overflow-hidden border-r border-[#e8eef6] bg-[#f8fbff]">
          <div className="shrink-0 p-4">
            <Button className="h-12 w-full rounded-xl bg-[#1558c0] hover:bg-[#124ca6]" onClick={handleCreateTask}>
              <Plus className="mr-2 h-4 w-4" />
              新建任务
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto space-y-1 px-2 pb-4">
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

        <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          <div className="flex h-16 min-w-0 items-center justify-between gap-3 border-b border-[#e8eef6] px-5">
            <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-[oklch(var(--crypto-ink))]">
              <Bot className="h-4 w-4 shrink-0 text-[#1558c0]" />
              Free Chat
              <span className="min-w-0 truncate text-[#98a2b3]">· {activeTask.title}</span>
            </div>

            <div className="flex shrink-0 items-center gap-2">
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

          <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-hidden px-4 pb-4 pt-3">
            <AIChatBox
              messages={activeTask.messages}
              onSendMessage={handleSendMessage}
              isLoading={isStreaming}
              liveStatus={liveStatus}
              placeholder="直接问：分析 BTC 的解锁压力 / 看 ETH 深度变化 / 看 SOL 链上 holder"
              emptyStateMessage="开始一轮基于内部数据源的分析"
              suggestedPrompts={workspace.suggestedPrompts}
              className="min-w-0 rounded-[24px] border-[#dfe7f1] bg-white"
            />
          </div>
        </main>

        <aside className="free-chat-side-panel flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-l border-[#e8eef6] bg-white">
          <ScrollArea className="h-full min-w-0 max-w-full overflow-hidden">
            <div className="min-w-0 max-w-full space-y-4 p-4">
              <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <FileText className="h-4 w-4 text-[#1558c0]" />
                    输出文件
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3">
                  {activeTask.artifacts.length === 0 ? (
                    <div className="break-words text-sm text-muted-foreground">当前回答还没有生成文件型产物。</div>
                  ) : (
                    activeTask.artifacts.map(file => (
                      <div key={file.id} className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
                        <div className="flex min-w-0 max-w-full items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 break-all text-sm font-medium leading-5 text-[oklch(var(--crypto-ink))]">{file.name}</div>
                          <div className="flex shrink-0 items-center gap-1">
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
                        <div className="mt-2 break-words text-sm leading-6 text-muted-foreground">{file.summary}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">数据引用</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3">
                  {activeTask.citations.length === 0 ? (
                    <div className="break-words text-sm text-muted-foreground">当前还没有引用数据块。</div>
                  ) : (
                    activeTask.citations.map(citation => (
                      <div key={citation.id} className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-3">
                        <div className="break-words text-sm font-medium leading-5 text-[oklch(var(--crypto-ink))]">{citation.title}</div>
                        <div className="mt-1 break-all text-xs leading-5 text-[#667085]">{citation.source}</div>
                        <div className="mt-2 break-words text-sm leading-6 text-muted-foreground">{citation.summary}</div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">意图识别</CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-2">
                  {!activeTask.intent ? (
                    <div className="break-words text-sm text-muted-foreground">发送问题后会展示系统识别到的查询意图。</div>
                  ) : (
                    renderIntentSummary(activeTask.intent)
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Workflow className="h-4 w-4 text-[#1558c0]" />
                    研究计划
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-3">
                  {!activeTask.researchPlan ? (
                    <div className="break-words text-sm text-muted-foreground">发送问题后会展示模型的研究计划。</div>
                  ) : (
                    <>
                      <div className="min-w-0 max-w-full overflow-hidden break-words rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5 text-sm leading-6 text-muted-foreground">
                        {activeTask.researchPlan.rationale}
                      </div>
                      <div className="space-y-2">
                        {activeTask.researchPlan.subQuestions.map((item, index) => (
                          <div key={`${item}-${index}`} className="min-w-0 max-w-full overflow-hidden break-words rounded-xl border border-[#edf2f7] bg-white px-3 py-2 text-sm leading-6 text-[oklch(var(--crypto-ink))]">
                            {index + 1}. {item}
                          </div>
                        ))}
                      </div>
                      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                        {activeTask.researchPlan.plannedTools.length === 0 ? (
                          <Badge variant="outline" className="border-[#dfe7f1] bg-[#fbfdff] text-[#667085]">
                            无需工具
                          </Badge>
                        ) : (
                          activeTask.researchPlan.plannedTools.map(tool => (
                            <Badge key={tool.name} variant="outline" className="max-w-full break-all border-[#d6e3f4] bg-[#f7fbff] text-[#1558c0]" title={tool.rationale}>
                              {tool.name}
                            </Badge>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Workflow className="h-4 w-4 text-[#1558c0]" />
                    执行步骤
                  </CardTitle>
                </CardHeader>
                <CardContent className="min-w-0 space-y-2">
                  {visibleExecutionSteps.length === 0 ? (
                    <div className="break-words text-sm text-muted-foreground">发送问题后会展示编排步骤。</div>
                  ) : (
                    visibleExecutionSteps.map(step => (
                      <div key={step.id} className="min-w-0 max-w-full overflow-hidden rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <div className="min-w-0 flex-1 break-words text-sm font-medium leading-5 text-[oklch(var(--crypto-ink))]">{step.label}</div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "shrink-0 capitalize",
                              step.status === "completed" && "border-[#ccebd7] bg-[#ecfdf3] text-[#047857]",
                              step.status === "running" && "border-[#d6e3f4] bg-[#eef5ff] text-[#1558c0]",
                              step.status === "failed" && "border-[#ffd8d5] bg-[#fff3f2] text-[#b42318]"
                            )}
                          >
                            {step.status}
                          </Badge>
                        </div>
                        {step.detail ? (
                          <div className="mt-1 break-words text-xs leading-5 text-muted-foreground line-clamp-2">{step.detail}</div>
                        ) : null}
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#dfe7f1] bg-white shadow-[0_8px_20px_rgba(83,102,138,0.06)]">
                <CardHeader className="pb-3">
                  <CardTitle className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4 text-[#1558c0]" />
                    已用工具
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex min-w-0 max-w-full flex-wrap gap-2">
                  {activeTask.usedTools.length === 0 ? (
                    <div className="break-words text-sm text-muted-foreground">等待首次执行。</div>
                  ) : (
                    activeTask.usedTools.map(tool => (
                      <Badge key={tool} variant="outline" className="max-w-full break-all border-[#d6e3f4] bg-[#f7fbff] text-[#1558c0]">
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

function renderIntentSummary(intent: Record<string, unknown>) {
  const kind = typeof intent.kind === "string" ? intent.kind : "unknown";

  if (kind === "exchange_listing_filter") {
    const includeExchanges = Array.isArray(intent.includeExchanges)
      ? intent.includeExchanges.map(item => String(item)).join(", ")
      : "无";
    const excludeExchanges = Array.isArray(intent.excludeExchanges)
      ? intent.excludeExchanges.map(item => String(item)).join(", ")
      : "无";
    const days = typeof intent.days === "number" ? `${intent.days} 天` : "未知";
    const marketType =
      intent.marketType === "spot"
        ? "现货"
        : intent.marketType === "perps"
          ? "合约"
          : "未限定";

    return (
      <>
        <IntentRow label="类型" value="交易所上币筛选" />
        <IntentRow label="包含" value={includeExchanges} />
        <IntentRow label="排除" value={excludeExchanges} />
        <IntentRow label="时间" value={days} />
        <IntentRow label="市场" value={marketType} />
      </>
    );
  }

  return (
    <>
      <IntentRow label="类型" value={typeof intent.taskType === "string" ? intent.taskType : "general"} />
      <IntentRow label="模式" value="通用问答/分析" />
    </>
  );
}

function IntentRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-[#edf2f7] bg-[#fbfdff] px-3 py-2.5">
      <div className="text-xs font-medium text-[#667085]">{label}</div>
      <div className="text-right text-sm text-[oklch(var(--crypto-ink))]">{value}</div>
    </div>
  );
}

function isResearchPlan(value: unknown): value is ResearchPlan {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.subQuestions) &&
    Array.isArray(record.plannedTools) &&
    typeof record.rationale === "string"
  );
}
