import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { extractExchanges, extractRecentDays, parseIntent } from "./intent";
import { runSqlFallbackTool, shouldAttemptSqlFallback } from "./sql";
import {
  runAnnouncementSearchTool,
  runBullishStreakScreenTool,
  runDepthTrendTool,
  runDepthViewTool,
  runExchangeListingFilterTool,
  runExchangeRecentListingsTool,
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
  ChatIntent,
  ChatSignalContext,
  ChatTaskType,
  ChatToolResult,
} from "./types";

const taskTypeSchema = z.enum([
  "general",
  "exchange_listing_overview",
  "token_overview",
  "liquidity_analysis",
  "unlock_analysis",
  "listing_research",
  "news_research",
  "onchain_holders",
  "onchain_fund_flow",
  "signal_analysis",
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
  messages: ChatInputMessage[],
  options?: {
    workspace?: "free_chat" | "signal";
    signalContext?: ChatSignalContext;
  }
): Promise<ChatAnswerPayload> {
  const latestUserMessage = [...messages].reverse().find(message => message.role === "user")?.content?.trim() ?? "";
  const taskType = classifyTask(latestUserMessage, options);
  const intent = parseIntent({
    messages,
    taskType,
    signalContext: options?.signalContext,
  });
  const detectedExchanges = intent.kind === "exchange_listing_filter" ? intent.includeExchanges : extractExchanges(messages);
  const detectedSymbol =
    intent.kind === "exchange_listing_filter" || detectedExchanges.length > 0
      ? null
      : options?.signalContext?.symbol ?? extractSymbol(messages);
  const executionSteps = buildExecutionSteps(taskType, detectedSymbol);

  if (!latestUserMessage) {
    return {
      message: "我还没收到具体问题。你可以直接说例如“分析一下 BTC 最近两周的深度和解锁压力”。",
      keyFindings: [],
      suggestedNextActions: ["给我一个 token symbol，比如 BTC、ETH、SOL"],
      intent: null,
      taskType: "general",
      detectedSymbol: null,
      citations: [],
      executionSteps: executionSteps.map(step => ({ ...step, status: "completed" })),
      artifacts: [],
      usedTools: [],
      usedFallback: true,
    };
  }

  if (intent.kind === "exchange_listing_filter") {
    return await handleExchangeListingFilterIntent({
      intent,
      executionSteps,
    });
  }

  if (taskType === "exchange_listing_overview" && detectedExchanges.length > 0) {
    const stepMap = new Map(executionSteps.map(step => [step.id, { ...step }]));
    markStep(stepMap, "parse-intent", "completed", `任务类型: ${taskType}`);
    markStep(stepMap, "resolve-symbol", "completed", `交易所: ${detectedExchanges.join(", ")}`);
    markStep(stepMap, "load-data", "running");

    const days = extractRecentDays(latestUserMessage);
    const toolResults = (await Promise.all([
      runExchangeRecentListingsTool({
        exchangeSlugs: detectedExchanges,
        days,
      }),
      runAnnouncementSearchTool(latestUserMessage),
    ])).filter((item): item is ChatToolResult => Boolean(item));

    const citations = toolResults.map(toCitation);
    const artifacts = buildArtifacts(null, taskType, toolResults);
    const llmAnswer = await composeAnswer({
      latestUserMessage,
      taskType,
      symbol: null,
      toolResults,
      signalContext: options?.signalContext,
    });

    markStep(
      stepMap,
      "load-data",
      toolResults.length > 0 ? "completed" : "failed",
      toolResults.length > 0 ? `已加载 ${toolResults.length} 个交易所上币数据块` : "没有取到最近上币数据"
    );
    markStep(stepMap, "compose-answer", "completed", llmAnswer.usedFallback ? "使用规则化降级回答" : "已生成结构化分析回答");
    markStep(stepMap, "produce-artifact", artifacts.length > 0 ? "completed" : "pending");

    return {
      message: llmAnswer.message,
      keyFindings: llmAnswer.keyFindings,
      suggestedNextActions: llmAnswer.suggestedNextActions,
      intent,
      taskType,
      detectedSymbol: null,
      citations,
      executionSteps: Array.from(stepMap.values()),
      artifacts,
      usedTools: toolResults.map(tool => tool.toolName),
      usedFallback: llmAnswer.usedFallback,
    };
  }

  if (!detectedSymbol && isBullishStreakScreenRequest(latestUserMessage)) {
    const stepMap = new Map(executionSteps.map(step => [step.id, { ...step }]));
    markStep(stepMap, "parse-intent", "completed", `任务类型: ${taskType}`);
    markStep(stepMap, "resolve-symbol", "completed", "无需单币 symbol，转批量 K 线筛选");
    markStep(stepMap, "load-data", "running", "遍历已收录代币并拉取日线 K 线");

    const toolResult = await runBullishStreakScreenTool({
      streakDays: extractStreakDays(latestUserMessage),
      marketType: /合约|perp|perps|永续/i.test(latestUserMessage) ? "perps" : "spot",
    });

    if (!toolResult) {
      markStep(stepMap, "load-data", "failed", "没有拿到可用的批量 K 线筛选结果");
      markStep(stepMap, "compose-answer", "completed", "已返回空结果说明");
      markStep(stepMap, "produce-artifact", "failed", "本次没有生成文件型产物");

      return {
        message: "我尝试批量筛选连续收涨代币了，但这次没有拿到可用的 K 线结果。",
        keyFindings: ["本次批量 K 线筛选没有返回结果。"],
        suggestedNextActions: ["可以缩小范围，比如指定某个交易所或先查最近上币代币。"],
        intent,
        taskType,
        detectedSymbol: null,
        citations: [],
        executionSteps: Array.from(stepMap.values()),
        artifacts: [],
        usedTools: [],
        usedFallback: true,
      };
    }

    const citations = [toCitation(toolResult)];
    const llmAnswer = await composeAnswer({
      latestUserMessage,
      taskType,
      symbol: null,
      toolResults: [toolResult],
      signalContext: options?.signalContext,
    });

    markStep(stepMap, "load-data", "completed", toolResult.summary);
    markStep(stepMap, "compose-answer", "completed", llmAnswer.usedFallback ? "使用规则化降级回答" : "已基于批量 K 线筛选生成回答");
    markStep(stepMap, "produce-artifact", "pending", "本次未生成文件型产物");

    return {
      message: llmAnswer.message,
      keyFindings: llmAnswer.keyFindings,
      suggestedNextActions: llmAnswer.suggestedNextActions,
      intent,
      taskType,
      detectedSymbol: null,
      citations,
      executionSteps: Array.from(stepMap.values()),
      artifacts: [],
      usedTools: [toolResult.toolName],
      usedFallback: llmAnswer.usedFallback,
    };
  }

  if (!detectedSymbol && intent.kind === "general") {
    const sqlFallbackPayload = await maybeHandleSqlFallback({
      latestUserMessage,
      taskType,
      executionSteps,
      signalContext: options?.signalContext,
    });

    if (sqlFallbackPayload) {
      return sqlFallbackPayload;
    }
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
        signalContext: options?.signalContext,
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
        intent,
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
      intent,
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
    signalContext: options?.signalContext,
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
    intent,
    taskType,
    detectedSymbol: symbol,
    citations,
    executionSteps: Array.from(stepMap.values()),
    artifacts,
    usedTools,
    usedFallback: llmAnswer.usedFallback,
  };
}

async function maybeHandleSqlFallback(input: {
  latestUserMessage: string;
  taskType: ChatTaskType;
  executionSteps: ChatExecutionStep[];
  signalContext?: ChatSignalContext;
}): Promise<ChatAnswerPayload | null> {
  if (!shouldAttemptSqlFallback(input.latestUserMessage, input.taskType)) {
    return null;
  }

  const stepMap = new Map(input.executionSteps.map(step => [step.id, { ...step }]));
  markStep(stepMap, "parse-intent", "completed", `任务类型: ${input.taskType}`);
  markStep(stepMap, "resolve-symbol", "completed", "未命中单币 symbol，转 SQL 研究模式");
  markStep(stepMap, "load-data", "running", "尝试生成只读 SQL");

  try {
    const result = await runSqlFallbackTool({
      latestUserMessage: input.latestUserMessage,
      taskType: input.taskType,
    });

    if (!result.ok) {
      markStep(stepMap, "load-data", "failed", result.reason);
      markStep(stepMap, "compose-answer", "completed", "已解释当前能力缺口");
      markStep(stepMap, "produce-artifact", "failed", "本次没有生成文件型产物");

      return {
        message: [
          "我已经尝试把这条问题转成只读 SQL 查询了，但当前这套真实数据还接不住这个问题。",
          "",
          `原因：${result.reason}`,
          result.missingCapability ? `缺口：${result.missingCapability}` : null,
          result.assumptions.length > 0 ? `假设：${result.assumptions.join("；")}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        keyFindings: [
          "这次不是单纯没理解，而是已经进入 SQL 回退后仍然发现当前白名单数据不足",
          result.missingCapability ? `缺少的数据能力是 ${result.missingCapability}` : "当前 SQL 回退没有拿到可执行计划",
        ],
        suggestedNextActions: [
          "补一张能支持这类筛选的结构化表或视图",
          "或者把你关心的筛选逻辑告诉我，我来补一个固定 executor",
        ],
        intent: {
          kind: "general",
          taskType: input.taskType,
          originalQuery: input.latestUserMessage,
        },
        taskType: input.taskType,
        detectedSymbol: null,
        citations: [],
        executionSteps: Array.from(stepMap.values()),
        artifacts: [],
        usedTools: [],
        usedFallback: true,
      };
    }

    const citations = [toCitation(result.toolResult)];
    const llmAnswer = await composeAnswer({
      latestUserMessage: input.latestUserMessage,
      taskType: input.taskType,
      symbol: null,
      toolResults: [result.toolResult],
      signalContext: input.signalContext,
    });

    markStep(stepMap, "load-data", "completed", "已执行只读 SQL 查询");
    markStep(stepMap, "compose-answer", "completed", llmAnswer.usedFallback ? "使用规则化降级回答" : "已基于 SQL 结果生成回答");
    markStep(stepMap, "produce-artifact", "pending", "SQL 回退默认不生成文件产物");

    return {
      message: llmAnswer.message,
      keyFindings: llmAnswer.keyFindings,
      suggestedNextActions: llmAnswer.suggestedNextActions,
      intent: {
        kind: "general",
        taskType: input.taskType,
        originalQuery: input.latestUserMessage,
      },
      taskType: input.taskType,
      detectedSymbol: null,
      citations,
      executionSteps: Array.from(stepMap.values()),
      artifacts: [],
      usedTools: [result.toolResult.toolName],
      usedFallback: llmAnswer.usedFallback,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQL fallback failed";
    markStep(stepMap, "load-data", "failed", message);
    markStep(stepMap, "compose-answer", "completed", "已返回错误说明");
    markStep(stepMap, "produce-artifact", "failed", "本次没有生成文件型产物");

    return {
      message: `我尝试转成只读 SQL 查询了，但执行阶段失败：${message}`,
      keyFindings: ["SQL 回退已经触发，但执行失败。"],
      suggestedNextActions: ["我可以继续收紧 SQL 白名单或改成固定执行器"],
      intent: {
        kind: "general",
        taskType: input.taskType,
        originalQuery: input.latestUserMessage,
      },
      taskType: input.taskType,
      detectedSymbol: null,
      citations: [],
      executionSteps: Array.from(stepMap.values()),
      artifacts: [],
      usedTools: [],
      usedFallback: true,
    };
  }
}

async function handleExchangeListingFilterIntent(input: {
  intent: Extract<ChatIntent, { kind: "exchange_listing_filter" }>;
  executionSteps: ChatExecutionStep[];
}): Promise<ChatAnswerPayload> {
  const { intent, executionSteps } = input;
  const stepMap = new Map(executionSteps.map(step => [step.id, { ...step }]));
  markStep(stepMap, "parse-intent", "completed", `任务类型: ${intent.taskType}`);
  markStep(
    stepMap,
    "resolve-symbol",
    "completed",
    `包含: ${intent.includeExchanges.join(", ")} | 排除: ${intent.excludeExchanges.join(", ") || "无"} | 时间: ${intent.days}天`
  );
  markStep(stepMap, "load-data", "running");

    const toolResults = (await Promise.all([
      runExchangeListingFilterTool({
        includeExchanges: intent.includeExchanges,
        excludeExchanges: intent.excludeExchanges,
        days: intent.days,
        marketType: intent.marketType,
      }),
      runExchangeRecentListingsTool({
        exchangeSlugs: intent.includeExchanges,
        days: intent.days,
        marketType: intent.marketType,
      }),
    ])).filter((item): item is ChatToolResult => Boolean(item));

  markStep(
    stepMap,
    "load-data",
    toolResults.length > 0 ? "completed" : "failed",
    toolResults.length > 0 ? `已加载 ${toolResults.length} 个筛选数据块` : "没有取到筛选数据"
  );
  markStep(stepMap, "compose-answer", "completed", "已生成结构化筛选结果");

  const citations = toolResults.map(toCitation);
  const artifacts = buildArtifacts(null, intent.taskType, toolResults);
  markStep(stepMap, "produce-artifact", artifacts.length > 0 ? "completed" : "pending");

  const answer = buildExchangeListingFilterAnswer(intent, toolResults);

  return {
    message: answer.message,
    keyFindings: answer.keyFindings,
    suggestedNextActions: answer.suggestedNextActions,
    intent,
    taskType: intent.taskType,
    detectedSymbol: null,
    citations,
    executionSteps: Array.from(stepMap.values()),
    artifacts,
    usedTools: toolResults.map(tool => tool.toolName),
    usedFallback: false,
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
    case "signal_analysis":
      results.push(runUnlockTool(symbol));
      results.push(runListingTool(symbol));
      results.push(runDepthViewTool(symbol, marketType));
      results.push(runDepthTrendTool(symbol, marketType));
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

function classifyTask(
  message: string,
  options?: {
    workspace?: "free_chat" | "signal";
    signalContext?: ChatSignalContext;
  }
): ChatTaskType {
  const normalized = message.toLowerCase();
  if (options?.workspace === "signal" || options?.signalContext) return "signal_analysis";
  if (/\b(signal|setup|trigger|watch|watchlist)\b|信号|触发|观察位|埋伏|预警|规则/.test(normalized)) return "signal_analysis";
  if (/(upbit|bithumb|binance|okx|bybit|coinbase|kraken).*(上线|上币|listing|list)|最近.*上了.*(upbit|bithumb|binance|okx|bybit|coinbase|kraken)/.test(normalized)) return "exchange_listing_overview";
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

function isBullishStreakScreenRequest(message: string) {
  return /连续\s*\d+\s*天.*日线.*收涨|连续[一二三四五六七八九十]+\s*天.*日线.*收涨|日线收涨的代币|帮我找出.*收涨的代币/i.test(
    message
  );
}

function extractStreakDays(message: string) {
  const digitMatch = message.match(/连续\s*(\d+)\s*天/);
  if (digitMatch) {
    return Number(digitMatch[1]);
  }

  if (/连续三天/.test(message)) return 3;
  if (/连续四天/.test(message)) return 4;
  if (/连续五天/.test(message)) return 5;
  return 4;
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
    "UPBIT",
    "BITHUMB",
    "BINANCE",
    "BYBIT",
    "OKX",
    "KRAKEN",
    "COINBASE",
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

function buildExchangeListingFilterAnswer(
  intent: Extract<ChatIntent, { kind: "exchange_listing_filter" }>,
  toolResults: ChatToolResult[]
) {
  const filterResult = toolResults.find(tool => tool.toolName === "filter_exchange_listings");
  const payload = (filterResult?.data ?? null) as
    | {
        matched?: Array<{
          symbol: string;
          exchanges: string[];
          events: Array<{
            exchangeSlug: string | null;
            exchangeName: string;
            publishedAt: string | null;
            title: string;
            url: string | null;
          }>;
        }>;
      }
    | null;

  const matched = payload?.matched ?? [];
  const includeLabel = intent.includeExchanges.map(formatExchangeLabel).join(" 和 ");
  const excludeLabel = intent.excludeExchanges.map(formatExchangeLabel).join(" 和 ");
  const intro =
    excludeLabel.length > 0
      ? `最近 ${intent.days} 天里，同时上了 ${includeLabel}，但没有上 ${excludeLabel} 的代币共有 ${matched.length} 个。`
      : `最近 ${intent.days} 天里，同时上了 ${includeLabel} 的代币共有 ${matched.length} 个。`;

  return {
    message: [
      intro,
      "",
      matched.length > 0 ? "名单：" : "这次没有匹配到符合条件的代币。",
      ...matched.slice(0, 20).map(item => {
        const eventText = item.events
          .slice(0, 3)
          .map(event => `${formatExchangeLabel(event.exchangeSlug ?? event.exchangeName)} ${formatDate(event.publishedAt)}`)
          .join(" | ");
        return `- ${item.symbol}${eventText ? `: ${eventText}` : ""}`;
      }),
    ].join("\n"),
    keyFindings: [
      `${includeLabel} 作为包含条件，排除 ${excludeLabel || "无"} 后剩余 ${matched.length} 个代币`,
      matched.length > 0 ? `前几个结果是 ${matched.slice(0, 5).map(item => item.symbol).join(", ")}` : "当前筛选结果为空",
    ],
    suggestedNextActions: [
      "继续补充交易对和市场类型筛选",
      "继续拆成只上其中一家、或同时上多家的交集查询",
    ],
  };
}

function formatExchangeLabel(value: string) {
  const normalized = value.toLowerCase();
  if (normalized === "upbit") return "Upbit";
  if (normalized === "bithumb") return "Bithumb";
  if (normalized === "coinbase") return "Coinbase";
  if (normalized === "bybit") return "Bybit";
  if (normalized === "binance") return "Binance";
  if (normalized === "okx") return "OKX";
  if (normalized === "kraken") return "Kraken";
  return value;
}

function formatDate(value: string | null) {
  if (!value) return "未知时间";
  return value.slice(0, 10);
}

function buildArtifacts(
  symbol: string | null,
  taskType: ChatTaskType,
  toolResults: ChatToolResult[]
): ChatArtifact[] {
  if (!symbol || toolResults.length === 0 || taskType === "general") {
    if (taskType !== "exchange_listing_overview") {
      return [];
    }
  }

  if (!symbol && taskType !== "exchange_listing_overview") {
    return [];
  }

  return [
    {
      id: `artifact-${(symbol ?? "market").toLowerCase()}-${taskType}`,
      name: `${symbol ?? "market"}_${taskType}_brief.md`,
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
  signalContext?: ChatSignalContext;
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
            `Signal上下文: ${JSON.stringify(params.signalContext ?? null, null, 2)}`,
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
  signalContext?: ChatSignalContext;
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
  const signalContextLines = params.signalContext
    ? [
        `当前信号: ${params.signalContext.signalType}`,
        `强度 ${(params.signalContext.strength * 100).toFixed(0)}%，紧急度 ${params.signalContext.urgency}`,
        `看板结论: ${params.signalContext.summary}`,
        params.signalContext.missingRule ? `缺口规则: ${params.signalContext.missingRule}` : null,
        params.signalContext.gapText ? `规则差距: ${params.signalContext.gapText}` : null,
      ]
        .filter(Boolean)
        .map(item => `- ${item}`)
        .join("\n")
    : "";

  return {
    message: [
      `${params.symbol ?? "该 token"} 这次我先基于内部数据做了一版 ${taskLabel(params.taskType)}结论。`,
      "",
      signalContextLines ? "信号线程上下文：" : null,
      signalContextLines || null,
      signalContextLines ? "" : null,
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
    case "signal_analysis":
      return [`拆解 ${resolvedSymbol} 当前信号由哪些数据触发`, `继续盯 ${resolvedSymbol} 还差哪条规则会让信号升级或失效`];
    case "unlock_analysis":
      return [`继续看 ${resolvedSymbol} 解锁前后的成交深度变化`, `对比 ${resolvedSymbol} 最近上线事件和解锁窗口是否重叠`];
    case "listing_research":
      return [`继续分析 ${resolvedSymbol} 上线后 14 天深度变化`, `补一版 ${resolvedSymbol} 活动发放可能带来的抛压判断`];
    case "news_research":
      return [`继续追踪 ${resolvedSymbol} 最近 7 天公告和新闻主题`, `把 ${resolvedSymbol} 公告事件和深度变化放在一起看`];
    case "exchange_listing_overview":
      return ["继续按交易所拆分最近上币名单", "继续补充这些新币的上线时间、交易对和是否为 KRW/USDT 市场"];
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
    case "exchange_listing_overview":
      return "交易所上币概览";
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
    case "signal_analysis":
      return "信号拆解";
    case "full_checkup":
      return "全维度体检";
    default:
      return "分析";
  }
}
