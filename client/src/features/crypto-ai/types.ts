export type SignalUrgency = "high" | "medium" | "low";

export type SignalRuleView = {
  rule: string;
  value: string;
  weight: number;
  source: string;
};

export type SignalCard = {
  id: string;
  symbol: string;
  name: string;
  price: number;
  marketCap: number;
  signalType: string;
  strength: number;
  urgency: SignalUrgency;
  summary: string;
  triggeredAt: string;
  exchangeFocus: string[];
  triggeredRules: SignalRuleView[];
};

export type SignalHealth = {
  dataPipeline: string;
  collectorCoverage: string;
  aiService: string;
  queueLag: string;
};

export type TokenSnapshot = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  fdv: number;
  nextUnlock: string;
  nextUnlockPct: number;
  dominantSignal: string;
  confidence: number;
};

export type SystemModule = {
  name: string;
  description: string;
  status: "ready" | "mock" | "planned";
  endpoint: string;
};

export type SignalTemplateView = {
  id: string;
  name: string;
  description: string;
  minRulesTriggered: number;
  cooldownHours: number;
  requiredSources: string[];
};

export type AnalysisTemplateView = {
  id: string;
  name: string;
  description: string;
  outputFormat: "report" | "table" | "chart_data";
  requiredData: string[];
  steps: string[];
};

export type AnalysisRunView = {
  templateId: string;
  symbol: string;
  verdict: string;
  confidence: number;
  riskLevel: "conservative" | "moderate" | "aggressive";
  keyFindings: string[];
  chartSeries: Array<{
    label: string;
    value: number;
  }>;
};

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: string;
};

export type ChatToolView = {
  name: string;
  description: string;
};

export type AlphaTokenView = {
  symbol: string;
  name: string;
  chain: string;
  alphaId: string;
  listingTime: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  fdv: number;
  holders: number | null;
  tags?: string[];
};

export type MarketAnnouncementView = {
  id: string;
  title: string;
  source: string;
  token: string;
  type: string;
  publishTime: string;
  summary: string;
};

export type DashboardViewModel = {
  headline: {
    title: string;
    summary: string;
    refreshedAt: string;
  };
  health: SignalHealth;
  activeSignals: SignalCard[];
  watchlist: TokenSnapshot[];
  alphaFeed: AlphaTokenView[];
};

export type AnalysisWorkspaceViewModel = {
  templates: AnalysisTemplateView[];
  selectedRun: AnalysisRunView;
  recentRuns: Array<{
    id: string;
    templateName: string;
    symbol: string;
    runAt: string;
    status: "completed" | "running";
  }>;
  conversation: ChatMessageView[];
  tools: ChatToolView[];
};

export type MarketWorkspaceViewModel = {
  focusList: TokenSnapshot[];
  recentAlphaTokens: AlphaTokenView[];
  announcements: MarketAnnouncementView[];
};

export type FreeChatWorkspaceViewModel = {
  suggestedPrompts: string[];
  conversation: ChatMessageView[];
  tools: ChatToolView[];
};
