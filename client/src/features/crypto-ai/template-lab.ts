export type SignalEventView = {
  id: string;
  signalType: string;
  symbol: string;
  title: string;
  summary: string | null;
  category: string;
  direction: string;
  window: string | null;
  severity: "low" | "medium" | "high";
  status: "new" | "active" | "muted" | "expired";
  source: string;
  triggeredAt: string | Date;
  latestMetricValue: string | null;
  baselineValue: string | null;
  thresholdValue: string | null;
  changePct: string | null;
};

export type OpportunityTemplate = {
  id: string;
  name: string;
  category: "trend" | "event" | "flow" | "risk";
  description: string;
  objective: string;
  ownDataAngle: string;
  minimumScore: number;
  signalWeights: Partial<Record<string, number>>;
  preferredCategories: string[];
  preferredDirections?: string[];
  watchoutSignals?: string[];
  playbook: string[];
};

export type TemplateOpportunity = {
  id: string;
  templateId: string;
  templateName: string;
  symbol: string;
  score: number;
  confidence: number;
  bias: "long-lean" | "short-lean" | "observe";
  title: string;
  summary: string;
  matchedSignals: SignalEventView[];
  supportingPoints: string[];
  riskPoints: string[];
  dataEdges: string[];
  lastTriggeredAt: string | Date;
};

const severityWeight: Record<SignalEventView["severity"], number> = {
  low: 0.8,
  medium: 1.1,
  high: 1.4,
};

export const opportunityTemplates: OpportunityTemplate[] = [
  {
    id: "momentum_continuation",
    name: "趋势延续",
    category: "trend",
    description: "把价格、OI、深度放在一起判断趋势是否有继续发酵的基础。",
    objective: "找到不是单点拉升，而是有仓位与流动性配合的趋势机会。",
    ownDataAngle: "你自己的 OI / 深度 / 价格异动联动数据，比单看涨跌幅更有辨识度。",
    minimumScore: 3.2,
    signalWeights: {
      price_change_24h_gt_10pct: 1.2,
      oi_change_12h_gt_50pct: 1.1,
      oi_change_24h_gt_100pct: 1.3,
      bid_ask_ratio_gt_1_5: 0.9,
      funding_rate_gt_pos_threshold: 0.6,
    },
    preferredCategories: ["price", "oi_funding", "depth"],
    preferredDirections: ["up"],
    watchoutSignals: ["unlock_within_7d", "unlock_pct_gt_2pct"],
    playbook: ["先确认趋势不是单点成交冲上去", "再看 OI 和深度是否一起支持", "最后把事件型风险排掉"],
  },
  {
    id: "crowded_reversal",
    name: "拥挤反转",
    category: "flow",
    description: "抓价格、OI、资金费率之间的错位，识别拥挤仓位的挤压或反杀。",
    objective: "识别市场过度一致后的反向机会，而不是追着最热数据跑。",
    ownDataAngle: "你有自己的持仓、资金费率与盘口视角，可以比公共榜单更早看到拥挤结构。",
    minimumScore: 2.8,
    signalWeights: {
      oi_change_12h_gt_50pct: 1.2,
      oi_change_24h_gt_100pct: 1.4,
      funding_rate_gt_pos_threshold: 0.8,
      funding_rate_lt_neg_threshold: 0.8,
      price_change_24h_gt_10pct: 0.7,
    },
    preferredCategories: ["oi_funding", "price"],
    watchoutSignals: ["bid_ask_ratio_gt_1_5"],
    playbook: ["先看仓位是否快速变拥挤", "再看资金费率是否极端", "最后判断是顺势挤压还是反转博弈"],
  },
  {
    id: "event_pressure",
    name: "事件压力",
    category: "event",
    description: "围绕解锁、活动、上新事件，提前找到会改变供需结构的窗口。",
    objective: "把事件型供给冲击前置识别出来，形成观察清单。",
    ownDataAngle: "你自己整合的公告、解锁、活动和衍生品状态，是天然的数据护城河。",
    minimumScore: 2.2,
    signalWeights: {
      unlock_within_7d: 1.1,
      unlock_pct_gt_2pct: 1.3,
      new_listing_detected: 0.8,
      new_activity_detected: 0.8,
      funding_rate_gt_pos_threshold: 0.5,
      funding_rate_lt_neg_threshold: 0.5,
    },
    preferredCategories: ["event", "oi_funding"],
    watchoutSignals: ["price_change_24h_gt_10pct"],
    playbook: ["先判断事件是利多曝光还是供给压力", "再接上衍生品与价格位置", "不直接给交易动作，只给机会和风险窗口"],
  },
  {
    id: "holder_rotation",
    name: "筹码迁移",
    category: "risk",
    description: "把持仓集中度变化和新地址进入结合起来，观察筹码结构是否在重排。",
    objective: "识别链上筹码分布变化带来的中短线机会或风险。",
    ownDataAngle: "如果你能持续追踪 holder 变化，这部分会比交易所公开数据更独特。",
    minimumScore: 2.1,
    signalWeights: {
      top_holder_balance_change_gt_x: 1.2,
      new_top_holder_entered: 1,
      top_holder_exited: 1,
      new_activity_detected: 0.5,
    },
    preferredCategories: ["onchain", "event"],
    playbook: ["先看是不是单个地址扰动", "再看是否出现持续筹码迁移", "最后决定是纳入观察还是上升为重点机会"],
  },
];

function normalizeNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dedupe<T extends string>(items: T[]) {
  return Array.from(new Set(items));
}

function getBias(templateId: string, matchedSignals: SignalEventView[]): TemplateOpportunity["bias"] {
  const types = new Set(matchedSignals.map(item => item.signalType));

  if (templateId === "event_pressure") {
    return types.has("unlock_pct_gt_2pct") || types.has("unlock_within_7d") ? "short-lean" : "observe";
  }

  if (templateId === "crowded_reversal") {
    if (types.has("funding_rate_gt_pos_threshold")) return "short-lean";
    if (types.has("funding_rate_lt_neg_threshold")) return "long-lean";
    return "observe";
  }

  if (templateId === "holder_rotation") return "observe";

  return "long-lean";
}

export function buildTemplateOpportunities(
  events: SignalEventView[],
  templates = opportunityTemplates
): TemplateOpportunity[] {
  const activeEvents = events.filter(item => item.status !== "expired");
  const bySymbol = new Map<string, SignalEventView[]>();

  for (const event of activeEvents) {
    const list = bySymbol.get(event.symbol) ?? [];
    list.push(event);
    bySymbol.set(event.symbol, list);
  }

  const opportunities: TemplateOpportunity[] = [];

  for (const template of templates) {
    for (const [symbol, symbolEvents] of Array.from(bySymbol.entries())) {
      const matchedSignals = symbolEvents.filter((event: SignalEventView) => {
        const weighted = template.signalWeights[event.signalType] != null;
        const categoryHit = template.preferredCategories.includes(event.category);
        const directionHit = !template.preferredDirections?.length || template.preferredDirections.includes(event.direction);
        return weighted || (categoryHit && directionHit);
      });

      if (matchedSignals.length === 0) continue;

      let score = 0;
      for (const event of matchedSignals) {
        const baseWeight = template.signalWeights[event.signalType] ?? 0.35;
        score += baseWeight * severityWeight[event.severity];
      }

      const distinctTypes = new Set(matchedSignals.map(item => item.signalType)).size;
      const categoryBreadth = new Set(matchedSignals.map(item => item.category)).size;
      score += distinctTypes >= 2 ? 0.5 : 0;
      score += categoryBreadth >= 2 ? 0.4 : 0;

      const roundedScore = Number(score.toFixed(1));
      if (roundedScore < template.minimumScore) continue;

      const riskSignals = symbolEvents.filter((event: SignalEventView) => template.watchoutSignals?.includes(event.signalType));
      const strongest = [...matchedSignals].sort((a: SignalEventView, b: SignalEventView) => {
        const scoreA = severityWeight[a.severity] * (template.signalWeights[a.signalType] ?? 0.35);
        const scoreB = severityWeight[b.severity] * (template.signalWeights[b.signalType] ?? 0.35);
        return scoreB - scoreA;
      });
      const lead = strongest[0];

      const supportingPoints = dedupe(
        matchedSignals.slice(0, 4).map((event: SignalEventView) => event.summary ?? `${event.title} 已命中`)
      );

      const riskPoints = riskSignals.length
        ? dedupe(riskSignals.map((event: SignalEventView) => event.summary ?? event.title)).slice(0, 3)
        : ["当前没有明显对冲信号，但仍需要结合时间窗口和流动性人工复核。"];

      const dataEdges = dedupe(
        matchedSignals.map((event: SignalEventView) => {
          if (event.category === "oi_funding") return "衍生品仓位与资金费率联动";
          if (event.category === "depth") return "盘口深度和买卖盘失衡";
          if (event.category === "event") return "公告、活动、上新与解锁事件";
          if (event.category === "onchain") return "链上持仓结构与地址迁移";
          return "现货价格与成交结构";
        })
      );

      const latestTime = [...matchedSignals].sort(
        (a: SignalEventView, b: SignalEventView) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
      )[0]?.triggeredAt;

      const confidenceBase = Math.min(0.95, roundedScore / 5.5);
      const metricStrength = matchedSignals
        .map((item: SignalEventView) => Math.abs(normalizeNumber(item.changePct) ?? 0))
        .filter((value: number) => value > 0)
        .slice(0, 3);
      const metricBonus = metricStrength.length ? Math.min(0.08, metricStrength[0] / 500) : 0;
      const confidence = Number(Math.min(0.98, confidenceBase + metricBonus).toFixed(2));

      opportunities.push({
        id: `${template.id}:${symbol}`,
        templateId: template.id,
        templateName: template.name,
        symbol,
        score: roundedScore,
        confidence,
        bias: getBias(template.id, matchedSignals),
        title: `${symbol} · ${template.name}`,
        summary: `${lead?.title ?? "多源数据"} 与 ${matchedSignals.length} 条基础信号形成组合，更像“机会线索”而不是单点异动。`,
        matchedSignals: strongest,
        supportingPoints,
        riskPoints,
        dataEdges,
        lastTriggeredAt: latestTime ?? new Date().toISOString(),
      });
    }
  }

  return opportunities.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(b.lastTriggeredAt).getTime() - new Date(a.lastTriggeredAt).getTime();
  });
}
