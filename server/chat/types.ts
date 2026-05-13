export type ChatTaskType =
  | "general"
  | "exchange_listing_overview"
  | "token_overview"
  | "liquidity_analysis"
  | "unlock_analysis"
  | "listing_research"
  | "news_research"
  | "onchain_holders"
  | "onchain_fund_flow"
  | "signal_analysis"
  | "full_checkup";

export type ChatInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatSignalContext = {
  signalId: string;
  signalType: string;
  symbol: string;
  name?: string;
  summary: string;
  urgency: "high" | "medium" | "low";
  strength: number;
  exchange?: string;
  theme?: string;
  marketPhase?: "active" | "upcoming";
  triggeredAt?: string;
  relativeTime?: string;
  missingRule?: string;
  gapText?: string;
  rules?: Array<{
    rule: string;
    value: string;
    source: string;
  }>;
};

export type ExchangeListingFilterIntent = {
  kind: "exchange_listing_filter";
  taskType: "exchange_listing_overview";
  days: number;
  includeExchanges: string[];
  excludeExchanges: string[];
  requireAllIncluded: boolean;
  requireAllExcluded: boolean;
  marketType: "spot" | "perps" | null;
  originalQuery: string;
};

export type GeneralIntent = {
  kind: "general";
  taskType: ChatTaskType;
  originalQuery: string;
};

export type ChatIntent = ExchangeListingFilterIntent | GeneralIntent;

export type ChatExecutionStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;
};

export type ResearchPlan = {
  subQuestions: string[];
  plannedTools: Array<{
    name: string;
    rationale: string;
  }>;
  rationale: string;
};

export type ChatCitation = {
  id: string;
  title: string;
  source: string;
  fetchedAt: string;
  summary: string;
};

export type ChatArtifact = {
  id: string;
  name: string;
  type: "report" | "table" | "csv";
  createdAt: string;
  status: "ready" | "generating";
  summary: string;
};

export type ChatToolResult = {
  toolName: string;
  title: string;
  summary: string;
  source: string;
  data: unknown;
};

export type ChatAnswerPayload = {
  conversationId?: string;
  message: string;
  keyFindings: string[];
  suggestedNextActions: string[];
  intent?: ChatIntent | null;
  taskType: ChatTaskType;
  detectedSymbol: string | null;
  citations: ChatCitation[];
  executionSteps: ChatExecutionStep[];
  artifacts: ChatArtifact[];
  usedTools: string[];
  usedFallback: boolean;
  researchPlan?: ResearchPlan | null;
};
