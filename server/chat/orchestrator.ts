import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import {
  runAnnouncementSearchTool,
  runDepthTrendTool,
  runDepthViewTool,
  runListingTool,
  runOnchainFundFlowTool,
  runOnchainHoldersTool,
  runProfileTool,
  runUnlockTool,
  runWebSearchTool,
} from "./tools";
import type {
  ChatAnswerPayload,
  ChatArtifact,
  ChatCitation,
  ChatExecutionStep,
  ChatInputMessage,
  ChatTaskType,
  ChatToolResult,
} from "./types";

const taskTypeSchema = z.enum([
  "general",
  "token_overview",
  "liquidity_analysis",
  "unlock_analysis",
  "listing_research",
  "news_research",
  "onchain_holders",
  "onchain_fund_flow",
  "full_checkup",
]);

const answerSchema = {
  name: "free_chat_answer",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["message", "keyFindings", "suggestedNextActions"],
    properties: {
      message: { type: "string" },
      keyFindings: {
        type: "array",
        items: { type: "string" },
      },
      suggestedNextActions: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
} as const;

export async function orchestrateChatMessage(
  messages: ChatInputMessage[]
): Promise<ChatAnswerPayload> {
  const latestUserMessage = [...messages].reverse().find(message => message.role === "user")?.content?.trim() ?? "";
  const detectedSymbol = extractSymbol(messages);
  const taskType = classifyTask(latestUserMessage);
  const executionSteps = buildExecutionSteps(taskType, detectedSymbol);

  if (!latestUserMessage) {
    return {
      message: "我还没收到具体问题。你可以直接说例如“分析一下 BTC 最近两周的深度和解锁压力”。",
      keyFindings: [],
      suggestedNextActions: ["给我一个 token symbol，比如 BTC、ETH、SOL"],
      taskType: "general",
      detectedSymbol: null,
      citations: [],
      executionSteps: executionSteps.map(step => ({ ...step, status: "completed" })),
      artifacts: [],
      usedTools: [],
      usedFallback: true,
    };
  }

  if (!detectedSymbol && taskType !== "general") {
    if (taskType === "news_research") {
      const stepMap = new Map(executionSteps.map(step => [step.id, { ...step }]));
      markStep(stepMap, "parse-intent", "completed", `任务类型: ${taskType}`);
      markStep(stepMap, "resolve-symbol", "completed", "未指定 symbol，按主题搜索");
      markStep(stepMap, "load-data", "running");

      const toolResults = (await Promise.all([
        runAnnouncementSearchTool(latestUserMessage),
        runWebSearchTool(latestUserMessage),
      ])).filter((item): item is ChatToolResult => Boolean(item));

      const citations = toolResults.map(toCitation);
      const artifacts = buildArtifacts(null, taskType, toolResults);
      const llmAnswer = await composeAnswer({
        latestUserMessage,
        taskType,
        symbol: null,
        toolResults,
      });

      markStep(
        stepMap,
        "load-data",
        toolResults.length > 0 ? "completed" : "failed",
        toolResults.length > 0 ? `已加载 ${toolResults.length} 个搜索结果块` : "没有取到公告或外部搜索结果"
      );
      markStep(stepMap, "compose-answer", "completed", llmAnswer.usedFallback ? "使用规则化降级回答" : "已生成结构化分析回答");
      markStep(stepMap, "produce-artifact", artifacts.length > 0 ? "completed" : "pending");

      return {
        message: llmAnswer.message,
        keyFindings: llmAnswer.keyFindings,
        suggestedNextActions: llmAnswer.suggestedNextActions,
        taskType,
        detectedSymbol: null,
        citations,
        executionSteps: Array.from(stepMap.values()),
        artifacts,
        usedTools: toolResults.map(tool => tool.toolName),
        usedFallback: llmAnswer.usedFallback,
      };
    }

    return {
      message: "这条任务我已经识别成数据分析类请求了，但还缺少明确的代币 symbol。你可以直接说“分析 BTC”或“看一下 ETH 的链上 holder”。",
      keyFindings: ["当前缺少可定位的数据实体，暂时没有调用内部数据源。"],
      suggestedNextActions: ["补充一个 symbol，比如 BTC、ETH、SOL、ENA"],
      taskType,
      detectedSymbol: null,
      citations: [],
      executionSteps: executionSteps.map(step => ({
        ...step,
        status: step.id === "parse-intent" ? "completed" : "failed",
        detail: step.id === "resolve-symbol" ? "未识别到代币 symbol" : step.detail,
      })),
      artifacts: [],
      usedTools: [],
      usedFallback: true,
    };
  }

  const symbol = detectedSymbol;
  const stepMap = new Map(executionSteps.map(step => [step.id, { ...step }]));
  markStep(stepMap, "parse-intent", "completed", `任务类型: ${taskType}`);
  markStep(stepMap, "resolve-symbol", "completed", `Symbol: ${symbol ?? "N/A"}`);
  markStep(stepMap, "load-data", "running");

  const toolResults = symbol ? await runPlannedTools(symbol, taskType, latestUserMessage) : [];
  const citations = toolResults.map(toCitation);
  const usedTools = toolResults.map(tool => tool.toolName);

  markStep(
    stepMap,
    "load-data",
    toolResults.length > 0 ? "completed" : "failed",
    toolResults.length > 0 ? `已加载 ${toolResults.length} 个数据块` : "没有取到内部数据"
  );
  markStep(stepMap, "compose-answer", "running");

  const artifacts = buildArtifacts(symbol, taskType, toolResults);
  const llmAnswer = await composeAnswer({
    latestUserMessage,
    taskType,
    symbol,
    toolResults,
  });

  markStep(
    stepMap,
    "compose-answer",
    "completed",
    llmAnswer.usedFallback ? "使用规则化降级回答" : "已生成结构化分析回答"
  );
  markStep(
    stepMap,
    "produce-artifact",
    artifacts.length > 0 ? "completed" : "pending",
    artifacts.length > 0 ? `生成 ${artifacts.length} 个产出物` : "本次未生成文件型产物"
  );

  return {
    message: llmAnswer.message,
    keyFindings: llmAnswer.keyFindings,
    suggestedNextActions: llmAnswer.suggestedNextActions,
    taskType,
    detectedSymbol: symbol,
    citations,
    executionSteps: Array.from(stepMap.values()),
    artifacts,
    usedTools,
    usedFallback: llmAnswer.usedFallback,
  };
}

async function runPlannedTools(
  symbol: string,
  taskType: ChatTaskType,
  latestUserMessage: string
): Promise<ChatToolResult[]> {
  const wantsPerps = /合约|perp|perps|永续|资金费率|oi|open interest/i.test(latestUserMessage);
  const wantsSearch = /最新|新闻|news|today|today's|近期|公告|搜|search|research/i.test(latestUserMessage);
  const marketType = wantsPerps ? "perps" : undefined;
  const results: Array<Promise<ChatToolResult | null>> = [];

  results.push(runProfileTool(symbol));
  if (wantsSearch || taskType === "listing_research" || taskType === "news_research") {
    results.push(runAnnouncementSearchTool(latestUserMessage, symbol));
    results.push(runWebSearchTool(`${symbol} ${latestUserMessage}`));
  }

  switch (taskType) {
    case "unlock_analysis":
      results.push(runUnlockTool(symbol));
      results.push(runDepthViewTool(symbol, marketType));
      break;
    case "listing_research":
      results.push(runListingTool(symbol));
      results.push(runDepthTrendTool(symbol, marketType));
      break;
    case "news_research":
      results.push(runListingTool(symbol));
      break;
    case "liquidity_analysis":
      results.push(runDepthViewTool(symbol, marketType));
      results.push(runDepthTrendTool(symbol, marketType));
      break;
    case "onchain_holders":
      results.push(runOnchainHoldersTool(symbol));
      break;
    case "onchain_fund_flow":
      results.push(runOnchainFundFlowTool(symbol));
      break;
    case "full_checkup":
      results.push(runUnlockTool(symbol));
      results.push(runListingTool(symbol));
      results.push(runDepthViewTool(symbol, marketType));
      results.push(runDepthTrendTool(symbol, marketType));
      results.push(runOnchainHoldersTool(symbol));
      results.push(runOnchainFundFlowTool(symbol));
      break;
    case "token_overview":
      results.push(runUnlockTool(symbol));
      results.push(runListingTool(symbol));
      results.push(runDepthViewTool(symbol, marketType));
      break;
    case "general":
      break;
  }

  const settled = await Promise.all(results);
  return settled.filter((item): item is ChatToolResult => Boolean(item));
}

function classifyTask(message: string): ChatTaskType {
  const normalized = message.toLowerCase();
  if (/最新|新闻|news|headline|research|最近公告|搜一下|search/.test(normalized)) return "news_research";
  if (/全维度|全面|综合|体检|full check|overview|完整看一下/.test(normalized)) return "full_checkup";
  if (/解锁|unlock/.test(normalized)) return "unlock_analysis";
  if (/上线|上币|公告|activity|listing|launchpool|活动/.test(normalized)) return "listing_research";
  if (/链上.*资金流|资金流|转账扩散|fund flow/.test(normalized)) return "onchain_fund_flow";
  if (/链上.*holder|holder|持币地址|大户|筹码分布/.test(normalized)) return "onchain_holders";
  if (/深度|流动性|买盘|卖盘|book|order book|depth/.test(normalized)) return "liquidity_analysis";
  if (/价格|市值|fdv|token|代币|项目|分析/.test(normalized)) return "token_overview";
  return "general";
}

function extractSymbol(messages: ChatInputMessage[]) {
  const ignore = new Set([
    "THE",
    "AND",
    "FOR",
    "WITH",
    "CHAT",
    "FREE",
    "THIS",
    "THAT",
    "WHAT",
    "LISTING",
    "DEPTH",
    "HOLDER",
    "FLOW",
  ]);

  for (const message of [...messages].reverse()) {
    const matches = message.content.toUpperCase().match(/\$?[A-Z][A-Z0-9]{1,9}/g) ?? [];
    for (const raw of matches) {
      const candidate = raw.replace(/^\$/, "");
      if (!ignore.has(candidate) && /\d/.test(candidate) === false) {
        return candidate;
      }
    }
  }

  return null;
}

function buildExecutionSteps(taskType: ChatTaskType, detectedSymbol: string | null): ChatExecutionStep[] {
  return [
    { id: "parse-intent", label: "理解任务", status: "pending", detail: taskType },
    { id: "resolve-symbol", label: "定位代币", status: "pending", detail: detectedSymbol ?? "待识别" },
    { id: "load-data", label: "加载数据源", status: "pending" },
    { id: "compose-answer", label: "生成分析结论", status: "pending" },
    { id: "produce-artifact", label: "整理产出物", status: "pending" },
  ];
}

function markStep(
  stepMap: Map<string, ChatExecutionStep>,
  id: string,
  status: ChatExecutionStep["status"],
  detail?: string
) {
  const current = stepMap.get(id);
  if (!current) return;
  stepMap.set(id, {
    ...current,
    status,
    detail: detail ?? current.detail,
  });
}

function toCitation(tool: ChatToolResult): ChatCitation {
  return {
    id: tool.toolName,
    title: tool.title,
    source: tool.source,
    fetchedAt: new Date().toISOString(),
    summary: tool.summary,
  };
}

function buildArtifacts(
  symbol: string | null,
  taskType: ChatTaskType,
  toolResults: ChatToolResult[]
): ChatArtifact[] {
  if (!symbol || toolResults.length === 0 || taskType === "general") {
    return [];
  }

  return [
    {
      id: `artifact-${symbol.toLowerCase()}-${taskType}`,
      name: `${symbol}_${taskType}_brief.md`,
      type: "report",
      createdAt: new Date().toISOString(),
      status: "ready",
      summary: `基于 ${toolResults.length} 个数据块整理的 ${symbol} ${taskLabel(taskType)}简报`,
    },
  ];
}

async function composeAnswer(params: {
  latestUserMessage: string;
  taskType: ChatTaskType;
  symbol: string | null;
  toolResults: ChatToolResult[];
}) {
  const fallback = buildFallbackAnswer(params);

  try {
    const result = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "你是 crypto research copilot。你只能根据提供的数据上下文作答，不要编造不存在的数据。输出要简洁、可执行、偏研究分析风格。",
        },
        {
          role: "user",
          content: [
            `用户问题: ${params.latestUserMessage}`,
            `任务类型: ${params.taskType}`,
            `Symbol: ${params.symbol ?? "N/A"}`,
            "数据上下文:",
            JSON.stringify(
              params.toolResults.map(tool => ({
                toolName: tool.toolName,
                title: tool.title,
                summary: tool.summary,
                data: tool.data,
              })),
              null,
              2
            ),
          ].join("\n\n"),
        },
      ],
      outputSchema: answerSchema,
    });

    const rawContent = result.choices[0]?.message.content;
    const text =
      typeof rawContent === "string"
        ? rawContent
        : Array.isArray(rawContent)
          ? rawContent.map(item => ("text" in item ? item.text : "")).join("")
          : "";

    if (!text.trim()) {
      return fallback;
    }

    const parsed = JSON.parse(text) as {
      message?: unknown;
      keyFindings?: unknown;
      suggestedNextActions?: unknown;
    };

    return {
      message: typeof parsed.message === "string" ? parsed.message : fallback.message,
      keyFindings: Array.isArray(parsed.keyFindings)
        ? parsed.keyFindings.filter(item => typeof item === "string").slice(0, 5)
        : fallback.keyFindings,
      suggestedNextActions: Array.isArray(parsed.suggestedNextActions)
        ? parsed.suggestedNextActions.filter(item => typeof item === "string").slice(0, 4)
        : fallback.suggestedNextActions,
      usedFallback: false,
    };
  } catch {
    return fallback;
  }
}

function buildFallbackAnswer(params: {
  latestUserMessage: string;
  taskType: ChatTaskType;
  symbol: string | null;
  toolResults: ChatToolResult[];
}) {
  if (params.toolResults.length === 0) {
    return {
      message:
        params.taskType === "general"
          ? "我可以直接进入分析，但最好给我一个更明确的方向，比如“分析 BTC 解锁压力”或“看 ETH 链上 holder 变化”。"
          : `我识别到了 ${params.symbol ?? "该 token"} 的分析需求，但这次没有成功取到可用数据。可以换一个 symbol，或告诉我更具体的分析方向。`,
      keyFindings: ["当前没有可用的数据块可支撑进一步结论。"],
      suggestedNextActions: ["补充更明确的 symbol 或分析目标"],
      usedFallback: true,
    };
  }

  const topSummaries = params.toolResults.slice(0, 4).map(tool => `- ${tool.summary}`).join("\n");

  return {
    message: [
      `${params.symbol ?? "该 token"} 这次我先基于内部数据做了一版 ${taskLabel(params.taskType)}结论。`,
      "",
      "已拿到的关键数据：",
      topSummaries,
      "",
      "如果你愿意，我下一轮可以继续往下钻，比如把深度、解锁和链上 holder 放到同一个结论里对照。 ",
    ].join("\n"),
    keyFindings: params.toolResults.map(tool => tool.summary).slice(0, 5),
    suggestedNextActions: suggestNextActions(params.taskType, params.symbol),
    usedFallback: true,
  };
}

function suggestNextActions(taskType: ChatTaskType, symbol: string | null) {
  const resolvedSymbol = symbol ?? "该 token";
  switch (taskType) {
    case "unlock_analysis":
      return [`继续看 ${resolvedSymbol} 解锁前后的成交深度变化`, `对比 ${resolvedSymbol} 最近上线事件和解锁窗口是否重叠`];
    case "listing_research":
      return [`继续分析 ${resolvedSymbol} 上线后 14 天深度变化`, `补一版 ${resolvedSymbol} 活动发放可能带来的抛压判断`];
    case "news_research":
      return [`继续追踪 ${resolvedSymbol} 最近 7 天公告和新闻主题`, `把 ${resolvedSymbol} 公告事件和深度变化放在一起看`];
    case "liquidity_analysis":
      return [`继续看 ${resolvedSymbol} 各交易所深度差异`, `结合 ${resolvedSymbol} 解锁节奏判断流动性承接能力`];
    case "onchain_holders":
      return [`继续看 ${resolvedSymbol} 前 20 holder 的增减变化`, `把 ${resolvedSymbol} holder 变化和价格区间放在一起看`];
    case "onchain_fund_flow":
      return [`继续看 ${resolvedSymbol} 第一层和第二层地址扩散`, `把 ${resolvedSymbol} 资金流和 holder 变化一起分析`];
    case "full_checkup":
      return [`继续生成 ${resolvedSymbol} 的完整研究简报`, `挑一个维度继续深挖，比如解锁或链上资金流`];
    default:
      return [`继续分析 ${resolvedSymbol} 的解锁压力`, `继续分析 ${resolvedSymbol} 的深度和链上 holder`];
  }
}

function taskLabel(taskType: ChatTaskType) {
  const parsed = taskTypeSchema.safeParse(taskType);
  if (!parsed.success) return "分析";

  switch (taskType) {
    case "token_overview":
      return "概览";
    case "liquidity_analysis":
      return "流动性分析";
    case "unlock_analysis":
      return "解锁分析";
    case "listing_research":
      return "上线研究";
    case "news_research":
      return "新闻与公告研究";
    case "onchain_holders":
      return "链上持仓分析";
    case "onchain_fund_flow":
      return "链上资金流分析";
    case "full_checkup":
      return "全维度体检";
    default:
      return "分析";
  }
}
