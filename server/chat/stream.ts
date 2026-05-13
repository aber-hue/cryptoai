import type { Application, Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { runAgentLoop, type AgentEvent } from "./agentLoop";
import { isExternalFreeChatAgentConfigured, runExternalFreeChatAgent } from "./externalAgent";
import { planResearch } from "./planner";
import type { ChatAnswerPayload, ChatInputMessage, ChatSignalContext, ResearchPlan } from "./types";
import * as db from "../db";

type StreamRequestBody = {
  conversationId?: string;
  title?: string;
  persist?: boolean;
  workspace?: "free_chat" | "signal";
  signalContext?: ChatSignalContext;
  messages: ChatInputMessage[];
};

// Outbound events sent to the client (superset of AgentEvent for persistence side-channel)
type OutboundEvent =
  | AgentEvent
  | { type: "plan"; plan: ResearchPlan }
  | { type: "conversation_saved"; conversationId: string };

function sendEvent(res: Response, event: OutboundEvent) {
  const data = JSON.stringify(event);
  res.write(`data: ${data}\n\n`);
  const r = res as unknown as { flush?: () => void };
  if (typeof r.flush === "function") {
    r.flush();
  }
}

export function registerChatStreamRoute(app: Application) {
  app.post("/api/chat/stream", async (req: Request, res: Response) => {
    // Optional auth — same approach as tRPC context
    let user: Awaited<ReturnType<typeof sdk.authenticateRequest>> | null = null;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      // allow unauthenticated (won't persist)
    }

    const body = req.body as StreamRequestBody;
    const { messages, workspace, signalContext, conversationId, title, persist } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: "messages array is required" });
      return;
    }

    // Set up SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    // AbortController stops the agent loop when the client disconnects.
    const controller = new AbortController();
    let closed = false;
    req.on("close", () => {
      closed = true;
      controller.abort();
    });

    const emit = (event: OutboundEvent) => {
      if (!closed) {
        sendEvent(res, event);
      }
    };

    try {
      let plan: ResearchPlan | null = null;
      const payload = isExternalFreeChatAgentConfigured()
        ? await runExternalFreeChatAgent(messages, {
            signal: controller.signal,
            emit: emit as (event: AgentEvent) => void,
          })
        : await (async () => {
            plan = await planResearch(messages, { signal: controller.signal });
            if (plan) {
              emit({ type: "plan", plan });
            }

            return await runAgentLoop(
              messages,
              { workspace, signalContext, signal: controller.signal, plan },
              emit as (event: AgentEvent) => void
            );
          })();

      // Skip persistence if client disconnected mid-stream
      if (closed) {
        res.end();
        return;
      }

      // Persist conversation if user is logged in and persist !== false
      if (persist !== false && user?.openId) {
        try {
          const summary = payload.keyFindings[0] ?? payload.message.slice(0, 240);
          const stateJson = JSON.stringify({
            citations: payload.citations,
            executionSteps: payload.executionSteps,
            detectedSymbol: payload.detectedSymbol,
            taskType: payload.taskType,
            intent: payload.intent ?? null,
            usedTools: payload.usedTools,
            researchPlan: payload.researchPlan ?? plan ?? null,
            suggestedNextActions: payload.suggestedNextActions,
            workspace: workspace ?? "free_chat",
            signalContext: signalContext ?? null,
          });

          const conversation = await db.upsertChatConversation({
            conversationId,
            ownerOpenId: user.openId,
            title: title ?? (payload.detectedSymbol ? `${payload.detectedSymbol} 分析` : "Free Chat"),
            detectedSymbol: payload.detectedSymbol,
            taskType: payload.taskType,
            summary,
            stateJson,
          });

          const assistantContent = buildAssistantMessage(payload);

          await db.replaceChatMessages({
            conversationId: conversation.id,
            messages: [
              ...messages,
              { role: "assistant", content: assistantContent },
            ],
          });

          // Persist artifacts with rendered markdown content (parity with tRPC path)
          const lastUserPrompt = messages.filter(m => m.role === "user").at(-1)?.content ?? "";
          await db.replaceChatArtifacts({
            conversationId: conversation.id,
            artifacts: payload.artifacts.map(artifact => ({
              id: artifact.id,
              name: artifact.name,
              type: artifact.type,
              status: artifact.status,
              summary: artifact.summary,
              content: buildReportMarkdown({
                title: artifact.name,
                prompt: lastUserPrompt,
                payload,
              }),
            })),
          });

          // Side-channel event: just the new conversationId, not a duplicate answer.
          emit({ type: "conversation_saved", conversationId: conversation.id });
        } catch (err) {
          // Persistence failure is non-fatal — the answer was already streamed.
          console.error("[stream] persistence failed:", err);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent loop failed";
      emit({ type: "error", message });
    }

    res.end();
  });
}

function buildAssistantMessage(payload: {
  message: string;
  keyFindings: string[];
  suggestedNextActions: string[];
}): string {
  return [
    payload.message,
    payload.keyFindings.length > 0 ? "" : null,
    payload.keyFindings.length > 0 ? "**关键发现**" : null,
    ...payload.keyFindings.map(item => `- ${item}`),
    payload.suggestedNextActions.length > 0 ? "" : null,
    payload.suggestedNextActions.length > 0 ? "**下一步建议**" : null,
    ...payload.suggestedNextActions.map(item => `- ${item}`),
  ]
    .filter(Boolean)
    .join("\n");
}

function buildReportMarkdown(input: {
  title: string;
  prompt: string;
  payload: ChatAnswerPayload;
}): string {
  const { title, prompt, payload } = input;
  return [
    `# ${title}`,
    "",
    `生成时间: ${new Date().toISOString()}`,
    payload.detectedSymbol ? `Symbol: ${payload.detectedSymbol}` : null,
    `任务类型: ${payload.taskType}`,
    "",
    "## 用户问题",
    prompt || "N/A",
    "",
    "## 分析结论",
    payload.message,
    "",
    "## 关键发现",
    ...(payload.keyFindings.length > 0 ? payload.keyFindings.map(item => `- ${item}`) : ["- 无"]),
    "",
    "## 建议动作",
    ...(payload.suggestedNextActions.length > 0
      ? payload.suggestedNextActions.map(item => `- ${item}`)
      : ["- 无"]),
    "",
    "## 数据引用",
    ...(payload.citations.length > 0
      ? payload.citations.map(
          item => `- ${item.title} | ${item.source} | ${item.fetchedAt}\n  ${item.summary}`
        )
      : ["- 无"]),
  ]
    .filter(Boolean)
    .join("\n");
}
