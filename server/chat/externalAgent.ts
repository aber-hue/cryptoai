import { ENV } from "../_core/env";
import type {
  ChatAnswerPayload,
  ChatExecutionStep,
  ChatInputMessage,
  ChatTaskType,
} from "./types";
import type { AgentEvent } from "./agentLoop";

type ExternalAgentEvent = {
  type?: string;
  item?: {
    type?: string;
    name?: string;
    arguments?: string;
    output?: unknown;
    content?: unknown;
  };
  response?: {
    output?: unknown[];
    usage?: unknown;
  };
  delta?: string;
};

export function isExternalFreeChatAgentConfigured() {
  return Boolean(ENV.freeChatAgentApiUrl.trim() && ENV.freeChatAgentApiKey.trim());
}

export async function runExternalFreeChatAgent(
  messages: ChatInputMessage[],
  options: {
    signal?: AbortSignal;
    emit: (event: AgentEvent) => void;
  }
): Promise<ChatAnswerPayload> {
  const latestUserMessage = [...messages].reverse().find(message => message.role === "user")?.content ?? "";
  const executionSteps: ChatExecutionStep[] = [
    { id: "external-agent", label: "调用外部 Agent", status: "running" },
  ];
  const usedTools: string[] = [];
  let answerText = "";

  options.emit({ type: "step", step: executionSteps[0] });

  const response = await fetch(ENV.freeChatAgentApiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.freeChatAgentApiKey}`,
    },
    body: JSON.stringify({
      model: ENV.freeChatAgentModel,
      stream: true,
      input: buildExternalAgentInput(messages),
    }),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`External agent failed: ${response.status} ${response.statusText} ${errorText}`.trim());
  }

  const decoder = new TextDecoder();
  let buffer = "";

  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const event = parseSseEvent(part);
      if (!event) continue;

      const item = event.item;
      if (item?.type === "function_call" && item.name) {
        usedTools.push(item.name);
        options.emit({
          type: "tool_call",
          name: item.name,
          label: item.name,
          args: parseArguments(item.arguments),
        });
      }

      if (item?.type === "function_call_output" && usedTools.length > 0) {
        options.emit({
          type: "tool_result",
          name: usedTools[usedTools.length - 1] ?? "external_agent_tool",
          summary: summarizeToolOutput(item.output),
          ok: true,
        });
      }

      if (typeof event.delta === "string") {
        answerText += event.delta;
      }

      if (event.type === "response.completed") {
        const completedText = extractCompletedText(event.response?.output);
        if (completedText.trim()) {
          answerText = completedText;
        }
      }
    }
  }

  const completedSteps: ChatExecutionStep[] = [
    {
      id: "external-agent",
      label: "调用外部 Agent",
      status: "completed",
      detail: usedTools.length > 0 ? `外部 Agent 调用了 ${usedTools.length} 次工具` : "外部 Agent 已返回回答",
    },
  ];

  const payload: ChatAnswerPayload = {
    message: answerText.trim() || "外部 Agent 没有返回可展示的文本。",
    keyFindings: [],
    suggestedNextActions: [],
    intent: {
      kind: "general",
      taskType: inferTaskType(latestUserMessage),
      originalQuery: latestUserMessage,
    },
    taskType: inferTaskType(latestUserMessage),
    detectedSymbol: null,
    citations: [],
    executionSteps: completedSteps,
    artifacts: [],
    usedTools: Array.from(new Set(usedTools)),
    usedFallback: false,
    researchPlan: null,
  };

  options.emit({ type: "step", step: completedSteps[0] });
  options.emit({ type: "answer", payload });

  return payload;
}

function buildExternalAgentInput(messages: ChatInputMessage[]) {
  const conversation = messages
    .filter(message => message.role !== "system")
    .map(message => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n\n");

  return [
    "你是 Crypto AI 的 Free Chat 外部 Agent。",
    "请优先使用你可用的数据源、搜索、浏览器和工具来回答用户问题。",
    "如果问题涉及交易所上新、公告、链上、代币研究，请给出可执行、简洁、中文的结论。",
    "",
    conversation,
  ].join("\n");
}

function parseSseEvent(raw: string): ExternalAgentEvent | null {
  const data = raw
    .split("\n")
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n");

  if (!data || data === "[DONE]") return null;

  try {
    return JSON.parse(data) as ExternalAgentEvent;
  } catch {
    return null;
  }
}

function parseArguments(value: unknown) {
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { input: value };
  }
}

function summarizeToolOutput(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  if (!text) return "外部工具已返回";
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
}

function extractCompletedText(output: unknown) {
  if (!Array.isArray(output)) return "";
  const texts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const content = Array.isArray(record.content) ? record.content : [];

    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const partRecord = part as Record<string, unknown>;
      if (typeof partRecord.text === "string") {
        texts.push(partRecord.text);
      }
    }
  }

  return texts.join("\n").trim();
}

function inferTaskType(text: string): ChatTaskType {
  if (/解锁|unlock/i.test(text)) return "unlock_analysis";
  if (/holder|持仓|筹码/i.test(text)) return "onchain_holders";
  if (/链上.*资金|资金流|fund flow/i.test(text)) return "onchain_fund_flow";
  if (/深度|流动性|depth/i.test(text)) return "liquidity_analysis";
  if (/上线|上币|listing|alpha/i.test(text)) return "listing_research";
  if (/新闻|公告|news/i.test(text)) return "news_research";
  return "general";
}
