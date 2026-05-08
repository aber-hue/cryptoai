import type { ChatInputMessage, ChatIntent, ChatSignalContext, ChatTaskType } from "./types";

const exchangeMapping = new Map<string, string>([
  ["UPBIT", "upbit"],
  ["BITHUMB", "bithumb"],
  ["BINANCE", "binance"],
  ["BYBIT", "bybit"],
  ["OKX", "okx"],
  ["COINBASE", "coinbase"],
  ["KRAKEN", "kraken"],
]);

export function parseIntent(input: {
  messages: ChatInputMessage[];
  taskType: ChatTaskType;
  signalContext?: ChatSignalContext;
}): ChatIntent {
  const latestUserMessage =
    [...input.messages].reverse().find(message => message.role === "user")?.content?.trim() ?? "";

  const marketType = detectMarketType(latestUserMessage);
  const days = extractRecentDays(latestUserMessage);
  const upper = latestUserMessage.toUpperCase();

  if (input.signalContext) {
    return {
      kind: "general",
      taskType: "signal_analysis",
      originalQuery: latestUserMessage,
    };
  }

  const includeExchanges = extractExchangesFromSegment(
    extractIncludeSegment(upper) ?? upper
  );
  const excludeExchanges = extractExchangesFromSegment(
    extractExcludeSegment(upper) ?? ""
  );

  const mentionsListing = /上线|上币|LISTING|LIST|现货|合约/.test(upper);
  const hasMultipleExchangeConditions =
    includeExchanges.length > 0 && (excludeExchanges.length > 0 || includeExchanges.length > 1);

  if (mentionsListing && hasMultipleExchangeConditions) {
    return {
      kind: "exchange_listing_filter",
      taskType: "exchange_listing_overview",
      days,
      includeExchanges,
      excludeExchanges,
      requireAllIncluded: /同时|都|一起|同时上了|同时上线/.test(upper) || includeExchanges.length > 1,
      requireAllExcluded: excludeExchanges.length > 0,
      marketType,
      originalQuery: latestUserMessage,
    };
  }

  if (mentionsListing && includeExchanges.length > 0) {
    return {
      kind: "exchange_listing_filter",
      taskType: "exchange_listing_overview",
      days,
      includeExchanges,
      excludeExchanges,
      requireAllIncluded: includeExchanges.length > 1,
      requireAllExcluded: excludeExchanges.length > 0,
      marketType,
      originalQuery: latestUserMessage,
    };
  }

  return {
    kind: "general",
    taskType: input.taskType,
    originalQuery: latestUserMessage,
  };
}

export function extractExchanges(messages: ChatInputMessage[]) {
  const found = new Set<string>();
  for (const message of [...messages].reverse()) {
    const upper = message.content.toUpperCase();
    for (const [keyword, slug] of Array.from(exchangeMapping.entries())) {
      if (upper.includes(keyword)) {
        found.add(slug);
      }
    }
  }
  return Array.from(found);
}

export function extractRecentDays(message: string) {
  if (/近三个月|最近三个月|3个月|三个月/.test(message)) return 90;
  if (/近两个月|最近两个月|2个月|两个月/.test(message)) return 60;
  if (/近一个月|最近一个月|1个月|一个月/.test(message)) return 30;
  if (/近一周|最近一周|7天|一周/.test(message)) return 7;
  return 60;
}

function detectMarketType(message: string) {
  if (/现货|spot/i.test(message)) return "spot";
  if (/合约|perp|perps|永续/i.test(message)) return "perps";
  return null;
}

function extractIncludeSegment(upper: string) {
  const splitByExclude = upper.split(/但是没有|但没有|没有上|未上|不上/)[0] ?? upper;
  return splitByExclude;
}

function extractExcludeSegment(upper: string) {
  const matched = upper.match(/(?:但是没有|但没有|没有上|未上|不上)(.+)$/);
  return matched?.[1] ?? "";
}

function extractExchangesFromSegment(segment: string) {
  const found = new Set<string>();
  for (const [keyword, slug] of Array.from(exchangeMapping.entries())) {
    if (segment.includes(keyword)) {
      found.add(slug);
    }
  }
  return Array.from(found);
}
