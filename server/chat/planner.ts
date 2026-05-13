import { invokeLLM } from "../_core/llm";
import type { Message } from "../_core/llm";
import type { ChatInputMessage, ResearchPlan } from "./types";

const TOOL_SUMMARIES = [
  ["get_token_profile", "代币基础信息、市值、FDV、价格、供应、项目描述"],
  ["get_token_unlock", "代币解锁计划、解锁时间表、释放比例"],
  ["get_token_listing", "单个代币在交易所的上线记录和活动"],
  ["search_announcements", "交易所公告和最新上线消息搜索"],
  ["get_exchange_recent_listings", "交易所近期上线代币列表"],
  ["get_binance_alpha_listings", "Binance Alpha 最近上线项目列表"],
  ["filter_exchange_listings", "筛选交易所上线交集或差集"],
  ["get_depth_view", "代币当前市场深度、买卖盘、spread"],
  ["get_depth_trend", "代币深度和流动性历史趋势"],
  ["get_onchain_holders", "链上 holder、集中度、大户地址"],
  ["get_onchain_fund_flow", "链上资金流路径和来源去向"],
  ["web_search", "外部网络搜索最新新闻和补充信息"],
  ["screen_bullish_streak", "批量筛选连续多天日线收涨代币"],
  ["get_kline", "代币 K 线、价格历史、成交量"],
  ["get_funding_rounds", "融资轮次、融资金额、投资方、团队"],
  ["get_social_heat", "Twitter/社交热度、提及量、互动量"],
  ["get_large_transfers", "链上大额转账记录"],
  ["get_cex_flows", "代币流入/流出 CEX 净流量"],
  ["get_onchain_overview", "链上持仓集中度和大户增减变化"],
  ["screen_market", "市场代币排行和条件筛选"],
  ["get_signal_events", "当前触发的信号事件"],
  ["report_no_data", "当前工具无法覆盖时说明数据边界"],
  ["submit_final_answer", "提交最终分析结论"],
] as const;

const TOOL_NAMES = new Set<string>(TOOL_SUMMARIES.map(([name]) => name));

const researchPlanSchema = {
  name: "free_chat_research_plan",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["subQuestions", "plannedTools", "rationale"],
    properties: {
      subQuestions: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: { type: "string" },
      },
      plannedTools: {
        type: "array",
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "rationale"],
          properties: {
            name: {
              type: "string",
              enum: TOOL_SUMMARIES.map(([name]) => name),
            },
            rationale: { type: "string" },
          },
        },
      },
      rationale: { type: "string" },
    },
  },
} as const;

export async function planResearch(
  messages: ChatInputMessage[],
  options: { signal?: AbortSignal } = {}
): Promise<ResearchPlan | null> {
  if (options.signal?.aborted) return null;

  const latestUserMessage = [...messages].reverse().find(message => message.role === "user")?.content ?? "";
  if (!latestUserMessage.trim()) return null;

  const llmMessages: Message[] = [
    {
      role: "system",
      content: [
        "你是 Free Chat 的研究规划器。你的任务是把用户问题拆成一个简短研究计划。",
        "只规划，不回答问题，不编造数据。",
        "plannedTools 只能从下面工具名中选择；如果是普通寒暄或无需数据的问题，可以返回空 plannedTools。",
        "",
        "可用工具：",
        ...TOOL_SUMMARIES.map(([name, description]) => `- ${name}: ${description}`),
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "请为下面的 Free Chat 问题生成研究计划。",
        "要求：subQuestions 1-5 条；plannedTools 只列真正需要的数据工具；rationale 1-2 句中文。",
        "",
        latestUserMessage,
      ].join("\n"),
    },
  ];

  try {
    const result = await invokeLLM({
      messages: llmMessages,
      outputSchema: researchPlanSchema,
      maxTokens: 1200,
    });

    if (options.signal?.aborted) return null;

    const content = result.choices[0]?.message.content;
    const rawText = typeof content === "string" ? content : JSON.stringify(content ?? "");
    return normalizePlan(parseJsonObject(rawText));
  } catch (error) {
    console.warn("[planner] failed:", error instanceof Error ? error.message : error);
    return null;
  }
}

function normalizePlan(value: unknown): ResearchPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;

  const subQuestions = Array.isArray(record.subQuestions)
    ? record.subQuestions.map(item => String(item).trim()).filter(Boolean).slice(0, 5)
    : [];

  const plannedTools = Array.isArray(record.plannedTools)
    ? record.plannedTools
        .map(item => {
          if (!item || typeof item !== "object") return null;
          const tool = item as Record<string, unknown>;
          const name = String(tool.name ?? "").trim();
          if (!TOOL_NAMES.has(name)) return null;
          return {
            name,
            rationale: String(tool.rationale ?? "").trim() || "用于获取相关数据",
          };
        })
        .filter((item): item is ResearchPlan["plannedTools"][number] => Boolean(item))
        .slice(0, 6)
    : [];

  if (subQuestions.length === 0) return null;

  return {
    subQuestions,
    plannedTools,
    rationale: String(record.rationale ?? "").trim() || "先拆解问题，再按需调用内部数据工具。",
  };
}

function parseJsonObject(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}
