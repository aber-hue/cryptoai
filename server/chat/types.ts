export type ChatTaskType =
  | "general"
  | "token_overview"
  | "liquidity_analysis"
  | "unlock_analysis"
  | "listing_research"
  | "news_research"
  | "onchain_holders"
  | "onchain_fund_flow"
  | "full_checkup";

export type ChatInputMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatExecutionStep = {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
  detail?: string;
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
  taskType: ChatTaskType;
  detectedSymbol: string | null;
  citations: ChatCitation[];
  executionSteps: ChatExecutionStep[];
  artifacts: ChatArtifact[];
  usedTools: string[];
  usedFallback: boolean;
};
