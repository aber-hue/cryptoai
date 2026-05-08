import { createPool, type Pool, type PoolOptions, type RowDataPacket } from "mysql2/promise";
import { invokeLLM } from "../_core/llm";
import type { ChatToolResult, ChatTaskType } from "./types";

type SqlPlannerOutput = {
  mode: "query" | "unsupported";
  summary: string;
  sql: string | null;
  assumptions: string[];
  missingCapability: string | null;
  missingDataReason: string | null;
};

type SqlFallbackResult =
  | {
      ok: true;
      toolResult: ChatToolResult;
    }
  | {
      ok: false;
      reason: string;
      missingCapability?: string | null;
      assumptions: string[];
    };

const SQL_LIMIT = 100;

const sqlPlannerSchema = {
  name: "free_chat_sql_planner",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["mode", "summary", "sql", "assumptions", "missingCapability", "missingDataReason"],
    properties: {
      mode: {
        type: "string",
        enum: ["query", "unsupported"],
      },
      summary: { type: "string" },
      sql: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
      },
      missingCapability: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
      missingDataReason: {
        anyOf: [{ type: "string" }, { type: "null" }],
      },
    },
  },
} as const;

const tableCatalog = [
  {
    table: "token_profiles",
    purpose: "代币基础画像，适合查 symbol、name、market_cap、fdv、price、volume_24h、holder_count 等",
    columns: [
      "id",
      "symbol",
      "name",
      "slug",
      "current_price",
      "volume_24h",
      "market_cap",
      "fdv",
      "circulating_supply",
      "total_supply",
      "token_holder_count",
      "coin_tags",
      "created_at",
      "updated_at",
    ],
  },
  {
    table: "exchange_platforms",
    purpose: "交易所维度，可区分 slug、name、market_type",
    columns: ["id", "slug", "name", "market_type", "logo_url"],
  },
  {
    table: "exchange_announcements",
    purpose: "公告和上币公告，适合查最近多少天哪些交易所上了哪些币。注意：这张表没有 exchange_id，通常通过 ea.exchange_slug 与交易所做关联。",
    columns: [
      "id",
      "exchange_slug",
      "title",
      "content_summary",
      "url",
      "published_at",
      "is_listing",
      "is_activity",
      "is_delisting_risk",
    ],
  },
  {
    table: "exchange_listings",
    purpose: "结构化上币记录，适合查 listing_time、pair_name、market_type",
    columns: [
      "id",
      "token_id",
      "exchange_id",
      "announcement_id",
      "pair_name",
      "deposit_time",
      "listing_time",
    ],
  },
  {
    table: "exchange_pairs",
    purpose: "交易对实时快照，适合查现货/合约深度、成交量、价格、funding、open_interest",
    columns: [
      "id",
      "token_id",
      "exchange_id",
      "pair_name",
      "quote_currency",
      "price",
      "volume_24h",
      "depth_buy_2",
      "depth_sell_2",
      "funding_rate",
      "open_interest",
      "listing_time",
      "updated_at",
    ],
  },
  {
    table: "token_trade_depth_daily",
    purpose: "逐日深度快照，不是价格 K 线。只能看 bid_amt/ask_amt 变化，不能判断连续收涨收跌",
    columns: ["token_id", "exchange_id", "snapshot_ts", "bid_amt", "ask_amt"],
  },
  {
    table: "token_trade_depth_snapshot",
    purpose: "逐时/逐快照成交与深度，不是日线 OHLC",
    columns: ["token_id", "exchange_id", "snapshot_ts", "volume_24h"],
  },
] as const;

const allowedTables = new Set<string>(tableCatalog.map(item => item.table));
const forbiddenSqlPattern =
  /\b(insert|update|delete|drop|alter|truncate|create|replace|grant|revoke|call|use|show|describe|set|into\s+outfile|load_file|benchmark|sleep)\b/i;

let sqlPool: Pool | null = null;

export function shouldAttemptSqlFallback(message: string, taskType: ChatTaskType) {
  if (taskType === "signal_analysis") return false;
  return /哪些|多少|统计|筛选|同时|没有上|未上|不上|连续\d+天|连续[一二三四五六七八九十]+天|收涨|收跌|排名|top|前\d+|最近\d+|近\d+|公告|上币|listing/i.test(
    message
  );
}

export async function runSqlFallbackTool(input: {
  latestUserMessage: string;
  taskType: ChatTaskType;
}): Promise<SqlFallbackResult> {
  let planned = await planSqlQuery(input.latestUserMessage, input.taskType);
  if (planned.mode === "unsupported" || !planned.sql) {
    return {
      ok: false,
      reason: planned.missingDataReason ?? planned.summary,
      missingCapability: planned.missingCapability,
      assumptions: planned.assumptions,
    };
  }

  validateSql(planned.sql);

  let rows: Array<Record<string, unknown>>;
  try {
    rows = await executeReadOnlySql(planned.sql);
  } catch (error) {
    const repaired = await repairSqlQuery({
      question: input.latestUserMessage,
      taskType: input.taskType,
      previousPlan: planned,
      executionError: error instanceof Error ? error.message : "SQL execution failed",
    });

    if (repaired.mode === "unsupported" || !repaired.sql) {
      return {
        ok: false,
        reason: repaired.missingDataReason ?? repaired.summary,
        missingCapability: repaired.missingCapability,
        assumptions: repaired.assumptions,
      };
    }

    validateSql(repaired.sql);
    rows = await executeReadOnlySql(repaired.sql);
    planned = repaired;
  }

  const columns = rows.length > 0 ? Object.keys(rows[0] ?? {}) : [];

  return {
    ok: true,
    toolResult: {
      toolName: "sql_read_only_research",
      title: "SQL 研究查询",
      source: "read_only_sql",
      summary: `${planned.summary}，返回 ${rows.length} 行结果`,
      data: {
        question: input.latestUserMessage,
        summary: planned.summary,
        sql: planned.sql,
        assumptions: planned.assumptions,
        rowCount: rows.length,
        columns,
        rows,
        fetchedAt: new Date().toISOString(),
      },
    },
  };
}

async function planSqlQuery(question: string, taskType: ChatTaskType): Promise<SqlPlannerOutput> {
  return await requestSqlPlan({
    systemInstruction: [
      "你是 free chat 的 SQL planner。",
      "你的工作不是回答用户，而是判断当前白名单数据表是否足够支持查询。",
      "如果可以，就输出一条只读 SQL。",
      "如果不可以，就明确说明缺了什么数据能力。",
      "",
      "硬性规则：",
      `1. 只能输出单条 SELECT 语句，不能用分号，不能用 WITH，不能写多语句。`,
      `2. 最终 SQL 必须带 LIMIT，且 LIMIT 不能超过 ${SQL_LIMIT}。`,
      "3. 只能使用下面白名单表，不能引用任何其它表。",
      "4. 如果问题需要日线 OHLC、涨跌幅序列、连续收涨收跌判断，但白名单里没有这类价格表，必须返回 unsupported。",
      "5. token_trade_depth_daily 和 token_trade_depth_snapshot 是深度/成交快照，不是日线价格 K 线。",
      "6. exchange_announcements 没有 exchange_id；如需关联交易所，请优先使用 ea.exchange_slug。",
      "7. 判断上币公告时，请使用 COALESCE(ea.is_listing, 0) <> 0，不要写成 ea.is_listing = 1。",
      "",
      "可用表：",
      JSON.stringify(tableCatalog, null, 2),
    ].join("\n"),
    userInstruction: [
      `用户问题: ${question}`,
      `已有任务分类: ${taskType}`,
      "请输出结构化结果。如果能查，就给 SQL；如果不能查，说明缺失的数据能力。",
    ].join("\n"),
  });
}

async function repairSqlQuery(input: {
  question: string;
  taskType: ChatTaskType;
  previousPlan: SqlPlannerOutput;
  executionError: string;
}): Promise<SqlPlannerOutput> {
  return await requestSqlPlan({
    systemInstruction: [
      "你是 free chat 的 SQL repair planner。",
      "上一条 SQL 在 MySQL 执行时报错了。请基于同样的白名单表修正它。",
      "",
      "硬性规则：",
      `1. 只能输出单条 SELECT 语句，不能用分号，不能用 WITH，不能写多语句。`,
      `2. 最终 SQL 必须带 LIMIT，且 LIMIT 不能超过 ${SQL_LIMIT}。`,
      "3. 只能使用下面白名单表，不能引用任何其它表。",
      "4. 如果发现这个问题本质上还是需要不存在的数据表，请改成 unsupported。",
      "5. exchange_announcements 没有 exchange_id；如需关联交易所，请优先使用 ea.exchange_slug。",
      "6. 判断上币公告时，请使用 COALESCE(ea.is_listing, 0) <> 0，不要写成 ea.is_listing = 1。",
      "",
      "可用表：",
      JSON.stringify(tableCatalog, null, 2),
    ].join("\n"),
    userInstruction: [
      `用户问题: ${input.question}`,
      `已有任务分类: ${input.taskType}`,
      `上一版计划摘要: ${input.previousPlan.summary}`,
      `上一版 SQL: ${input.previousPlan.sql ?? "N/A"}`,
      `MySQL 报错: ${input.executionError}`,
      "请修正 SQL 或明确返回 unsupported。",
    ].join("\n"),
  });
}

async function requestSqlPlan(input: {
  systemInstruction: string;
  userInstruction: string;
}): Promise<SqlPlannerOutput> {
  const result = await invokeLLM({
    messages: [
      {
        role: "system",
        content: input.systemInstruction,
      },
      {
        role: "user",
        content: input.userInstruction,
      },
    ],
    outputSchema: sqlPlannerSchema,
  });

  const rawContent = result.choices[0]?.message.content;
  const text =
    typeof rawContent === "string"
      ? rawContent
      : Array.isArray(rawContent)
        ? rawContent.map(item => ("text" in item ? item.text : "")).join("")
        : "";

  if (!text.trim()) {
    return {
      mode: "unsupported",
      summary: "SQL planner 没有返回可解析结果",
      sql: null,
      assumptions: [],
      missingCapability: "sql_planner_empty",
      missingDataReason: "这次没有成功生成 SQL 计划。",
    };
  }

  return JSON.parse(text) as SqlPlannerOutput;
}

function validateSql(sql: string) {
  const normalized = sql.trim();
  const compact = normalized.replace(/\s+/g, " ");

  if (!/^select\b/i.test(normalized)) {
    throw new Error("Only a single SELECT statement is allowed");
  }

  if (normalized.includes(";")) {
    throw new Error("Semicolons are not allowed in SQL fallback");
  }

  if (forbiddenSqlPattern.test(compact)) {
    throw new Error("Unsafe SQL keyword detected");
  }

  if (!/\blimit\s+\d+\b/i.test(compact)) {
    throw new Error("SQL fallback requires an explicit LIMIT");
  }

  const limitMatch = compact.match(/\blimit\s+(\d+)\b/i);
  const limit = Number(limitMatch?.[1] ?? "0");
  if (!Number.isFinite(limit) || limit < 1 || limit > SQL_LIMIT) {
    throw new Error(`LIMIT must be between 1 and ${SQL_LIMIT}`);
  }

  const tableNames = extractReferencedTables(compact);
  for (const tableName of tableNames) {
    if (!allowedTables.has(tableName)) {
      throw new Error(`Table "${tableName}" is not allowed in SQL fallback`);
    }
  }
}

function extractReferencedTables(sql: string) {
  const names = new Set<string>();
  const regex = /\b(?:from|join)\s+([a-z_][a-z0-9_]*)\b/gi;
  let match: RegExpExecArray | null = regex.exec(sql);
  while (match) {
    names.add(match[1].toLowerCase());
    match = regex.exec(sql);
  }
  return Array.from(names);
}

async function executeReadOnlySql(sql: string) {
  const pool = getSqlPool();
  const [rows] = await pool.query<RowDataPacket[]>(sql);
  return rows.map(row => ({ ...row })) as Array<Record<string, unknown>>;
}

function getSqlPool() {
  if (sqlPool) return sqlPool;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const url = new URL(databaseUrl);
  const options: PoolOptions = {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: url.searchParams.get("charset") ?? "utf8mb4",
    dateStrings: true,
    waitForConnections: true,
    connectionLimit: Number(url.searchParams.get("connection_limit") ?? 4),
  };

  sqlPool = createPool(options);
  return sqlPool;
}
