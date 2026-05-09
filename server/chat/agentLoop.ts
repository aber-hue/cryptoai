import { invokeLLM } from "../_core/llm";
import type { Message, Tool, ToolCall } from "../_core/llm";
import type {
  ChatAnswerPayload,
  ChatArtifact,
  ChatCitation,
  ChatExecutionStep,
  ChatInputMessage,
  ChatSignalContext,
  ChatTaskType,
  ChatToolResult,
} from "./types";
import {
  runProfileTool,
  runUnlockTool,
  runListingTool,
  runAnnouncementSearchTool,
  runExchangeRecentListingsTool,
  runExchangeListingFilterTool,
  runBinanceAlphaListingsTool,
  runDepthViewTool,
  runDepthTrendTool,
  runOnchainHoldersTool,
  runOnchainFundFlowTool,
  runWebSearchTool,
  runBullishStreakScreenTool,
  runKlineTool,
  runFundingRoundsTool,
  runSocialHeatTool,
  runLargeTransfersTool,
  runCexFlowTool,
  runOnchainOverviewTool,
  runMarketScreenerTool,
  runSignalEventsTool,
} from "./tools";

export type AgentEvent =
  | { type: "step"; step: ChatExecutionStep }
  | { type: "tool_call"; name: string; label: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; summary: string; ok: boolean }
  | { type: "answer"; payload: ChatAnswerPayload }
  | { type: "error"; message: string };

type SubmitFinalAnswerArgs = {
  message: string;
  keyFindings: string[];
  suggestedNextActions: string[];
  detectedSymbol?: string;
  taskType?: ChatTaskType;
};

type ReportNoDataArgs = {
  reason: string;
  scope?: string;
};

// ── Tool schemas ────────────────────────────────────────────────────────────

const AGENT_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "get_token_profile",
      description:
        "获取代币的基础信息：市值、FDV、流通量、价格、项目描述、社交链接。适用于代币概览查询。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号，如 BTC、ETH、SOL" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_unlock",
      description:
        "获取代币解锁计划：解锁时间表、解锁量、各类别（团队/投资人/生态）比例、TGE 信息。适用于解锁压力分析。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_token_listing",
      description:
        "获取代币在各交易所的上线记录：上线时间、交易所名称、交易对、市场类型（现货/合约）、活动发放信息。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_announcements",
      description:
        "搜索交易所公告和最新上线消息。适用于新闻研究、寻找特定代币或主题的公告。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词，如代币名称或主题" },
          symbol: { type: "string", description: "可选，限定在某个代币的公告" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_exchange_recent_listings",
      description:
        "获取一个或多个交易所最近上线的代币列表，支持现货/合约筛选。",
      parameters: {
        type: "object",
        properties: {
          exchangeSlugs: {
            type: "array",
            items: { type: "string" },
            description: "交易所标识符列表，如 [\"binance\", \"upbit\", \"bybit\", \"okx\", \"bithumb\", \"coinbase\", \"kraken\"]",
          },
          days: { type: "number", description: "查询最近几天，默认 14" },
          marketType: {
            type: "string",
            enum: ["spot", "perps"],
            description: "市场类型，不传则同时包含现货和合约",
          },
        },
        required: ["exchangeSlugs"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_binance_alpha_listings",
      description:
        "获取 Binance Alpha 最近上线项目列表。用户询问 Binance Alpha、alpha 上线、alpha 新币、最近上线项目时优先使用这个工具。",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "返回条数，默认 10，最大 50" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "filter_exchange_listings",
      description:
        "筛选同时在指定交易所上线、且未在排除交易所上线的代币。用于查询跨交易所上线交集或差集。",
      parameters: {
        type: "object",
        properties: {
          includeExchanges: {
            type: "array",
            items: { type: "string" },
            description: "必须包含的交易所列表",
          },
          excludeExchanges: {
            type: "array",
            items: { type: "string" },
            description: "必须排除的交易所列表，可为空数组",
          },
          days: { type: "number", description: "查询最近几天，默认 14" },
          marketType: {
            type: "string",
            enum: ["spot", "perps"],
            description: "市场类型",
          },
        },
        required: ["includeExchanges", "excludeExchanges"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_depth_view",
      description:
        "获取代币当前的市场深度/流动性快照：各交易所买卖盘深度、bid/ask spread、2%深度等。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
          marketType: {
            type: "string",
            enum: ["spot", "perps"],
            description: "市场类型，不传则查现货",
          },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_depth_trend",
      description:
        "获取代币深度/流动性的历史趋势：一段时间内买盘深度变化、流动性走势。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
          marketType: {
            type: "string",
            enum: ["spot", "perps"],
            description: "市场类型",
          },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_onchain_holders",
      description:
        "获取代币链上持仓分布：前 N 名 holder、筹码集中度、大户地址、钱包标签。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_onchain_fund_flow",
      description:
        "获取代币链上资金流动：大额转账记录、地址扩散路径、资金来源去向分析。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "搜索外部网络获取最新新闻、项目动态、市场评论。当内部数据库没有所需信息时使用。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索查询，尽量英文更准确" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screen_bullish_streak",
      description:
        "批量筛选连续多天日线收涨的代币。适用于找连续涨了 N 天的代币此类请求。",
      parameters: {
        type: "object",
        properties: {
          streakDays: { type: "number", description: "连续收涨天数，默认 4" },
          marketType: {
            type: "string",
            enum: ["spot", "perps"],
            description: "市场类型，不传则查现货",
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kline",
      description:
        "获取代币 K 线/价格历史数据：开高低收、成交量、涨跌幅。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
          range: {
            type: "string",
            enum: ["1m", "3m", "6m", "1y"],
            description: "时间范围：1m=1个月、3m=3个月、6m=6个月、1y=1年。默认 3m",
          },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_funding_rounds",
      description:
        "获取代币融资信息：融资轮次、融资金额、投资机构、团队背景。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_social_heat",
      description:
        "获取代币社交热度：Twitter 7 日提及量、互动量、热度趋势。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_large_transfers",
      description:
        "获取代币链上大额转账记录：转账金额、时间、发送/接收地址、钱包标签。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
          pageSize: { type: "number", description: "返回条数，默认 20，最大 50" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cex_flows",
      description:
        "获取代币链上流入/流出 CEX（中心化交易所）的净值趋势：每日 inflow/outflow、净流入。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_onchain_overview",
      description:
        "获取代币链上持仓集中度概览：Top10/50/100 holder 占比、近期大户增减变化。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "代币符号" },
        },
        required: ["symbol"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "screen_market",
      description:
        "市场代币筛选器：按市值、涨跌幅、成交量等维度排序，支持现货/合约市场。",
      parameters: {
        type: "object",
        properties: {
          sortBy: {
            type: "string",
            enum: ["marketCap", "volume24h", "listedAt"],
            description: "排序字段",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "排序方向，默认 desc",
          },
          marketType: {
            type: "string",
            enum: ["spot", "perps"],
            description: "市场类型",
          },
          page: { type: "number", description: "页码，默认 1" },
          pageSize: { type: "number", description: "每页条数，默认 20" },
        },
        required: ["sortBy"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_signal_events",
      description:
        "获取当前触发的信号事件列表：信号类型、代币、强度、紧急度、触发时间。",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "可选，按代币过滤" },
          limit: { type: "number", description: "返回条数，默认 20" },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "report_no_data",
      description:
        "当问题超出当前可用数据范围，且无法通过任何已有工具回答时调用此工具，明确说明数据边界。",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "无法回答的原因" },
          scope: { type: "string", description: "说明当前能覆盖的数据范围" },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "submit_final_answer",
      description:
        "数据收集完毕后调用此工具提交最终分析结论。调用此工具后对话结束。",
      parameters: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "详细分析内容，用 Markdown 格式，中文。只引用工具返回的真实数据，不编造任何数值。",
          },
          keyFindings: {
            type: "array",
            items: { type: "string" },
            description: "3-5条关键发现，每条一句话",
          },
          suggestedNextActions: {
            type: "array",
            items: { type: "string" },
            description: "2-3条建议的下一步操作",
          },
          detectedSymbol: {
            type: "string",
            description: "问题中涉及的代币符号，没有则省略",
          },
          taskType: {
            type: "string",
            description: "任务类型，如 token_overview、unlock_analysis、news_research 等",
          },
        },
        required: ["message", "keyFindings", "suggestedNextActions"],
        additionalProperties: false,
      },
    },
  },
];

// ── Tool executor ────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  get_token_profile: "获取代币基础信息",
  get_token_unlock: "获取解锁计划",
  get_token_listing: "获取交易所上线记录",
  search_announcements: "搜索公告",
  get_exchange_recent_listings: "获取交易所近期上线",
  get_binance_alpha_listings: "获取 Binance Alpha 上线项目",
  filter_exchange_listings: "筛选交易所上线交集",
  get_depth_view: "获取深度快照",
  get_depth_trend: "获取深度趋势",
  get_onchain_holders: "获取链上 Holder",
  get_onchain_fund_flow: "获取链上资金流",
  web_search: "搜索外部网络",
  screen_bullish_streak: "筛选连续涨幅代币",
  get_kline: "获取 K 线数据",
  get_funding_rounds: "获取融资信息",
  get_social_heat: "获取社交热度",
  get_large_transfers: "获取大额转账",
  get_cex_flows: "获取 CEX 净流量",
  get_onchain_overview: "获取链上持仓集中度",
  screen_market: "市场筛选器",
  get_signal_events: "获取信号事件",
  report_no_data: "标注数据边界",
  submit_final_answer: "提交最终答案",
};

async function executeTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ result: ChatToolResult | null; isControl: boolean }> {
  switch (name) {
    case "get_token_profile":
      return { result: await runProfileTool(String(args.symbol ?? "")), isControl: false };
    case "get_token_unlock":
      return { result: await runUnlockTool(String(args.symbol ?? "")), isControl: false };
    case "get_token_listing":
      return { result: await runListingTool(String(args.symbol ?? "")), isControl: false };
    case "search_announcements":
      return {
        result: await runAnnouncementSearchTool(String(args.query ?? ""), args.symbol ? String(args.symbol) : undefined),
        isControl: false,
      };
    case "get_exchange_recent_listings":
      return {
        result: await runExchangeRecentListingsTool({
          exchangeSlugs: Array.isArray(args.exchangeSlugs) ? (args.exchangeSlugs as string[]) : [],
          days: typeof args.days === "number" ? args.days : undefined,
          marketType: args.marketType === "spot" || args.marketType === "perps" ? args.marketType : undefined,
        }),
        isControl: false,
      };
    case "get_binance_alpha_listings":
      return {
        result: await runBinanceAlphaListingsTool({
          limit: typeof args.limit === "number" ? args.limit : 10,
        }),
        isControl: false,
      };
    case "filter_exchange_listings":
      return {
        result: await runExchangeListingFilterTool({
          includeExchanges: Array.isArray(args.includeExchanges) ? (args.includeExchanges as string[]) : [],
          excludeExchanges: Array.isArray(args.excludeExchanges) ? (args.excludeExchanges as string[]) : [],
          days: typeof args.days === "number" ? args.days : 14,
          marketType: args.marketType === "spot" || args.marketType === "perps" ? args.marketType : null,
        }),
        isControl: false,
      };
    case "get_depth_view":
      return {
        result: await runDepthViewTool(
          String(args.symbol ?? ""),
          args.marketType === "spot" || args.marketType === "perps" ? args.marketType : undefined
        ),
        isControl: false,
      };
    case "get_depth_trend":
      return {
        result: await runDepthTrendTool(
          String(args.symbol ?? ""),
          args.marketType === "spot" || args.marketType === "perps" ? args.marketType : undefined
        ),
        isControl: false,
      };
    case "get_onchain_holders":
      return { result: await runOnchainHoldersTool(String(args.symbol ?? "")), isControl: false };
    case "get_onchain_fund_flow":
      return { result: await runOnchainFundFlowTool(String(args.symbol ?? "")), isControl: false };
    case "web_search":
      return { result: await runWebSearchTool(String(args.query ?? "")), isControl: false };
    case "screen_bullish_streak":
      return {
        result: await runBullishStreakScreenTool({
          streakDays: typeof args.streakDays === "number" ? args.streakDays : undefined,
          marketType: args.marketType === "perps" ? "perps" : "spot",
        }),
        isControl: false,
      };
    case "get_kline": {
      const validRanges = ["1m", "3m", "6m", "1y"] as const;
      const rawRange = String(args.range ?? "3m");
      const range = (validRanges as readonly string[]).includes(rawRange)
        ? (rawRange as "1m" | "3m" | "6m" | "1y")
        : "3m";
      return { result: await runKlineTool(String(args.symbol ?? ""), range), isControl: false };
    }
    case "get_funding_rounds":
      return { result: await runFundingRoundsTool(String(args.symbol ?? "")), isControl: false };
    case "get_social_heat":
      return { result: await runSocialHeatTool(String(args.symbol ?? "")), isControl: false };
    case "get_large_transfers":
      return {
        result: await runLargeTransfersTool(
          String(args.symbol ?? ""),
          typeof args.pageSize === "number" ? args.pageSize : undefined
        ),
        isControl: false,
      };
    case "get_cex_flows":
      return { result: await runCexFlowTool(String(args.symbol ?? "")), isControl: false };
    case "get_onchain_overview":
      return { result: await runOnchainOverviewTool(String(args.symbol ?? "")), isControl: false };
    case "screen_market": {
      const validSortBy = ["listedAt", "marketCap", "volume24h"] as const;
      const rawSortBy = String(args.sortBy ?? "volume24h");
      const sortBy = (validSortBy as readonly string[]).includes(rawSortBy)
        ? (rawSortBy as "listedAt" | "marketCap" | "volume24h")
        : "volume24h";
      return {
        result: await runMarketScreenerTool({
          sortBy,
          sortOrder: args.sortOrder === "asc" ? "asc" : "desc",
          marketType: args.marketType === "spot" || args.marketType === "perps" ? args.marketType : undefined,
          limit: typeof args.pageSize === "number" ? args.pageSize : undefined,
        }),
        isControl: false,
      };
    }
    case "get_signal_events":
      return {
        result: await runSignalEventsTool({
          symbol: args.symbol ? String(args.symbol) : undefined,
          limit: typeof args.limit === "number" ? args.limit : undefined,
        }),
        isControl: false,
      };
    case "report_no_data": {
      const noDataArgs = args as ReportNoDataArgs;
      return {
        result: {
          toolName: "report_no_data",
          title: "数据边界说明",
          summary: noDataArgs.reason,
          source: "system",
          data: { reason: noDataArgs.reason, scope: noDataArgs.scope ?? null },
        },
        isControl: false,
      };
    }
    default:
      return { result: null, isControl: false };
  }
}

// ── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(signalContext?: ChatSignalContext): string {
  const lines = [
    "你是 Crypto Research Copilot，一个专业的加密货币研究助手。",
    "",
    "## 数据使用规则",
    "- 只能引用工具返回的真实数据，严禁编造任何数值、地址、时间、排名等具体信息",
    "- 可以调用多个工具进行多轮数据收集，工具调用之间可以并行",
    "- 用户询问 Binance Alpha 最近上线、新币、项目列表时，优先调用 get_binance_alpha_listings",
    "- 如果没有任何工具能回答问题，调用 report_no_data 工具说明原因",
    "- 数据收集完毕后，调用 submit_final_answer 工具提交分析结论",
    "",
    "## 分析风格",
    "- 简洁、可执行、偏研究分析风格",
    "- 用 Markdown 格式，中文输出",
    "- 关键数据用表格或列表展示",
  ];

  if (signalContext) {
    const extra = [
      "",
      "## 当前信号上下文",
      `- 信号类型: ${signalContext.signalType}`,
      `- 代币: ${signalContext.symbol}${signalContext.name ? ` (${signalContext.name})` : ""}`,
      `- 强度: ${(signalContext.strength * 100).toFixed(0)}%，紧急度: ${signalContext.urgency}`,
      `- 摘要: ${signalContext.summary}`,
      signalContext.missingRule ? `- 缺口规则: ${signalContext.missingRule}` : "",
      signalContext.gapText ? `- 规则差距: ${signalContext.gapText}` : "",
    ].filter(Boolean);
    lines.push(...extra);
  }

  return lines.join("\n");
}

// ── Main agent loop ──────────────────────────────────────────────────────────

const TOOL_TIMEOUT_MS = 30_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Timeout ${ms}ms: ${label}`)), ms);
    p.then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

export async function runAgentLoop(
  messages: ChatInputMessage[],
  options: {
    workspace?: "free_chat" | "signal";
    signalContext?: ChatSignalContext;
    signal?: AbortSignal;
  },
  emit: (event: AgentEvent) => void
): Promise<ChatAnswerPayload> {
  const MAX_ITERATIONS = 8;
  const allToolResults: ChatToolResult[] = [];
  const usedToolNames: string[] = [];
  let iterationCount = 0;
  const abort = options.signal;

  emit({
    type: "step",
    step: { id: "thinking", label: "理解问题", status: "running" },
  });

  // Build LLM conversation history
  const llmMessages: Message[] = [
    { role: "system", content: buildSystemPrompt(options.signalContext) },
    ...messages.map(m => ({ role: m.role as Message["role"], content: m.content })),
  ];

  let finalAnswer: SubmitFinalAnswerArgs | null = null;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (abort?.aborted) {
      console.log("[Agent] aborted by client");
      break;
    }
    iterationCount++;

    let llmResult;
    try {
      llmResult = await invokeLLM({
        messages: llmMessages,
        tools: AGENT_TOOLS,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : "LLM call failed";
      emit({ type: "error", message: errMsg });
      break;
    }

    if (abort?.aborted) break;

    const choice = llmResult.choices[0];
    if (!choice) break;

    const { message: llmMsg } = choice;
    const toolCalls: ToolCall[] = llmMsg.tool_calls ?? [];

    // Add the assistant's response (with tool_calls) to history
    llmMessages.push({
      role: "assistant",
      content: typeof llmMsg.content === "string" ? llmMsg.content : "",
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    });

    // No tool calls → LLM gave a plain text response, treat as done
    if (toolCalls.length === 0) {
      const text = typeof llmMsg.content === "string" ? llmMsg.content.trim() : "";
      if (text) {
        finalAnswer = {
          message: text,
          keyFindings: [],
          suggestedNextActions: [],
        };
      }
      break;
    }

    console.log(`[Agent] iteration=${i + 1} tool_calls=[${toolCalls.map(tc => tc.function.name).join(", ")}]`);

    // Check for terminal control tools
    const submitCall = toolCalls.find(tc => tc.function.name === "submit_final_answer");
    if (submitCall) {
      try {
        finalAnswer = JSON.parse(submitCall.function.arguments) as SubmitFinalAnswerArgs;
      } catch {
        finalAnswer = { message: submitCall.function.arguments, keyFindings: [], suggestedNextActions: [] };
      }
      // Add a tool result message for submit_final_answer so conversation history is valid
      llmMessages.push({
        role: "tool",
        tool_call_id: submitCall.id,
        content: "Answer submitted.",
      });
      break;
    }

    // Emit step for data loading phase
    if (i === 0) {
      emit({
        type: "step",
        step: { id: "thinking", label: "理解问题", status: "completed" },
      });
      emit({
        type: "step",
        step: { id: "load-data", label: "加载数据", status: "running" },
      });
    }

    // Execute all tool calls in parallel with per-tool timeout
    const settled = await Promise.all(
      toolCalls.map(async toolCall => {
        const toolName = toolCall.function.name;
        const label = TOOL_LABELS[toolName] ?? toolName;

        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        } catch {
          // ignore parse error
        }

        emit({ type: "tool_call", name: toolName, label, args });

        try {
          const { result } = await withTimeout(executeTool(toolName, args), TOOL_TIMEOUT_MS, toolName);
          if (result) {
            emit({ type: "tool_result", name: toolName, summary: result.summary, ok: true });
            return {
              toolCall,
              result,
              content: JSON.stringify({ summary: result.summary, data: result.data }),
            };
          }
          emit({ type: "tool_result", name: toolName, summary: "未返回数据", ok: false });
          return { toolCall, result: null, content: "No data returned." };
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Tool execution failed";
          emit({ type: "tool_result", name: toolName, summary: `工具执行失败: ${errMsg}`, ok: false });
          return { toolCall, result: null, content: `Error: ${errMsg}` };
        }
      })
    );

    // Push results to conversation history in original tool-call order
    for (const { toolCall, result, content } of settled) {
      if (result) {
        allToolResults.push(result);
        usedToolNames.push(result.toolName);
      }
      llmMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        name: toolCall.function.name,
        content,
      });
    }
  }

  // Build execution steps summary
  const executionSteps: ChatExecutionStep[] = buildExecutionSteps(iterationCount, allToolResults);

  // Build citations from tool results
  const citations: ChatCitation[] = allToolResults.map(tr => ({
    id: tr.toolName,
    title: tr.title,
    source: tr.source,
    fetchedAt: new Date().toISOString(),
    summary: tr.summary,
  }));

  // Determine task type and symbol from final answer or tool results
  const detectedSymbol = finalAnswer?.detectedSymbol ?? inferSymbol(messages, allToolResults);
  const inferredTaskType = inferTaskType(messages, options);
  const taskType = resolveTaskType(finalAnswer?.taskType, inferredTaskType);

  // Build fallback if no final answer
  const answer = finalAnswer ?? buildFallbackAnswer(messages, allToolResults, detectedSymbol);

  const artifacts: ChatArtifact[] =
    detectedSymbol && allToolResults.length > 0
      ? [
          {
            id: `artifact-${detectedSymbol.toLowerCase()}-${taskType}`,
            name: `${detectedSymbol}_${taskType}_brief.md`,
            type: "report",
            createdAt: new Date().toISOString(),
            status: "ready",
            summary: `基于 ${allToolResults.length} 个数据块整理的 ${detectedSymbol} 分析简报`,
          },
        ]
      : [];

  const payload: ChatAnswerPayload = {
    message: answer.message,
    keyFindings: answer.keyFindings,
    suggestedNextActions: answer.suggestedNextActions,
    intent: null,
    taskType,
    detectedSymbol,
    citations,
    executionSteps,
    artifacts,
    usedTools: usedToolNames,
    usedFallback: finalAnswer === null,
  };

  emit({ type: "answer", payload });

  return payload;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildExecutionSteps(iterationCount: number, toolResults: ChatToolResult[]): ChatExecutionStep[] {
  return [
    { id: "thinking", label: "理解问题", status: "completed" },
    {
      id: "load-data",
      label: "加载数据",
      status: toolResults.length > 0 ? "completed" : "failed",
      detail: toolResults.length > 0 ? `调用 ${toolResults.length} 个工具，共 ${iterationCount} 轮` : "没有获取到数据",
    },
    {
      id: "compose-answer",
      label: "生成分析结论",
      status: "completed",
    },
  ];
}

function inferSymbol(messages: ChatInputMessage[], toolResults: ChatToolResult[]): string | null {
  // Try to extract from tool results first (most reliable)
  for (const tr of toolResults) {
    if (tr.toolName !== "web_search" && tr.toolName !== "search_announcements") {
      // Most data tools are called with a symbol; extract from tool name context
      const data = tr.data as Record<string, unknown> | null;
      if (data && typeof data.symbol === "string") return data.symbol;
    }
  }

  // Fall back to message parsing
  const ignore = new Set([
    "THE",
    "AND",
    "FOR",
    "WITH",
    "CHAT",
    "FREE",
    "LISTING",
    "DEPTH",
    "HOLDER",
    "FLOW",
    "BINANCE",
    "ALPHA",
    "OKX",
    "BYBIT",
    "UPBIT",
    "BITHUMB",
    "COINBASE",
    "KRAKEN",
  ]);
  for (const msg of [...messages].reverse()) {
    const matches = msg.content.toUpperCase().match(/\$?[A-Z][A-Z0-9]{1,9}/g) ?? [];
    for (const raw of matches) {
      const candidate = raw.replace(/^\$/, "");
      if (!ignore.has(candidate) && !/\d/.test(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function inferTaskType(
  messages: ChatInputMessage[],
  options: { workspace?: string; signalContext?: ChatSignalContext }
): ChatTaskType {
  if (options.workspace === "signal" || options.signalContext) return "signal_analysis";
  const text = messages.map(m => m.content).join(" ").toLowerCase();
  if (/解锁|unlock/.test(text)) return "unlock_analysis";
  if (/链上.*资金|资金流|fund flow/.test(text)) return "onchain_fund_flow";
  if (/holder|持仓|筹码/.test(text)) return "onchain_holders";
  if (/深度|流动性|depth/.test(text)) return "liquidity_analysis";
  if (/全面|全维度|体检|full check/.test(text)) return "full_checkup";
  if (/新闻|公告|news/.test(text)) return "news_research";
  if (/上线|listing|上币/.test(text)) return "listing_research";
  return "general";
}

function resolveTaskType(rawTaskType: unknown, inferredTaskType: ChatTaskType): ChatTaskType {
  if (inferredTaskType !== "general") return inferredTaskType;

  const allowed = new Set<ChatTaskType>([
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

  return typeof rawTaskType === "string" && allowed.has(rawTaskType as ChatTaskType)
    ? (rawTaskType as ChatTaskType)
    : inferredTaskType;
}

function buildFallbackAnswer(
  messages: ChatInputMessage[],
  toolResults: ChatToolResult[],
  symbol: string | null
): SubmitFinalAnswerArgs {
  if (toolResults.length === 0) {
    return {
      message: "我没能获取到相关数据来回答这个问题。请尝试提供更具体的代币符号或问题方向。",
      keyFindings: ["当前没有可用数据支撑分析"],
      suggestedNextActions: ["提供一个具体的代币符号，如 BTC、ETH、SOL"],
    };
  }

  const summaries = toolResults.slice(0, 5).map(tr => `- ${tr.title}: ${tr.summary}`).join("\n");
  return {
    message: [
      symbol ? `以下是 ${symbol} 的数据摘要：` : "以下是查询结果摘要：",
      "",
      summaries,
    ].join("\n"),
    keyFindings: toolResults.slice(0, 5).map(tr => tr.summary),
    suggestedNextActions: ["继续深入分析某一个维度", "对比更多代币或交易所数据"],
    detectedSymbol: symbol ?? undefined,
  };
}
