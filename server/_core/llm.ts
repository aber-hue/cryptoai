import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4" ;
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[]
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map(part => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
      ...(message.tool_calls && message.tool_calls.length > 0 ? { tool_calls: message.tool_calls } : {}),
    };
  }

  return {
    role,
    name,
    content: contentParts,
    ...(message.tool_calls && message.tool_calls.length > 0 ? { tool_calls: message.tool_calls } : {}),
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured"
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly"
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

const resolveApiUrl = () =>
  ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";

const resolveOpenAIResponsesUrl = () => {
  const configured = ENV.openaiApiUrl.trim();
  if (!configured) return "";
  if (configured.endsWith("/v1/responses")) return configured;
  return `${configured.replace(/\/$/, "")}/v1/responses`;
};

// Derive chat/completions URL from the same base as the Responses URL
const resolveOpenAICompletionsUrl = () => {
  const configured = ENV.openaiApiUrl.trim();
  if (!configured) return "";
  const base = configured.replace(/\/v1\/(responses|chat\/completions)$/, "");
  return `${base}/v1/chat/completions`;
};

const shouldUseOpenAIResponses = () =>
  ENV.openaiApiKey.trim().length > 0 && resolveOpenAIResponsesUrl().length > 0;

const assertApiKey = () => {
  if (!shouldUseOpenAIResponses() && !ENV.forgeApiKey) {
    throw new Error("No LLM credentials configured");
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object"
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertApiKey();

  const hasTools = params.tools && params.tools.length > 0;

  if (shouldUseOpenAIResponses() && !hasTools) {
    return await invokeOpenAIResponses(params);
  }

  // When tools are needed, always use the chat/completions path (supports function calling).
  // If OpenAI credentials are available and no Forge key is set, derive the completions URL
  // from the same host as the Responses URL.
  if (shouldUseOpenAIResponses() && hasTools && !ENV.forgeApiKey) {
    return await invokeForgeChatCompletions(params, resolveOpenAICompletionsUrl(), ENV.openaiApiKey);
  }

  return await invokeForgeChatCompletions(params);
}

async function invokeForgeChatCompletions(
  params: InvokeParams,
  urlOverride?: string,
  apiKeyOverride?: string
): Promise<InvokeResult> {

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  // When overriding credentials, use the configured OpenAI model; otherwise default to Gemini.
  const isOpenAIOverride = Boolean(urlOverride && apiKeyOverride);
  const model = isOpenAIOverride ? (ENV.openaiModel || "gpt-4o") : "gemini-2.5-flash";

  const payload: Record<string, unknown> = {
    model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  payload.max_tokens = 32768;
  // thinking is Gemini-specific; skip when using the OpenAI-compatible override
  if (!isOpenAIOverride) {
    payload.thinking = { budget_tokens: 128 };
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  if (normalizedResponseFormat) {
    payload.response_format = normalizedResponseFormat;
  }

  const targetUrl = urlOverride ?? resolveApiUrl();
  console.log(`[LLM] → ${targetUrl} model=${model} tools=${tools?.length ?? 0}`);

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKeyOverride ?? ENV.forgeApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const result = (await response.json()) as InvokeResult;
  const choice = result.choices?.[0];
  console.log(`[LLM] ← finish_reason=${choice?.finish_reason} tool_calls=${choice?.message?.tool_calls?.length ?? 0} content_len=${String(choice?.message?.content ?? "").length}`);
  return result;
}

async function invokeOpenAIResponses(params: InvokeParams): Promise<InvokeResult> {
  const {
    messages,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  const payload: Record<string, unknown> = {
    model: ENV.openaiModel || "gpt-5.5",
    input: messages.map(normalizeOpenAIInputMessage),
  };

  if (normalizedResponseFormat?.type === "json_schema") {
    payload.text = {
      format: {
        type: "json_schema",
        name: normalizedResponseFormat.json_schema.name,
        schema: normalizedResponseFormat.json_schema.schema,
        ...(typeof normalizedResponseFormat.json_schema.strict === "boolean"
          ? { strict: normalizedResponseFormat.json_schema.strict }
          : {}),
      },
    };
  } else if (normalizedResponseFormat?.type === "json_object") {
    payload.text = {
      format: {
        type: "json_schema",
        name: "json_object",
        schema: {
          type: "object",
          additionalProperties: true,
        },
      },
    };
  }

  const response = await fetch(resolveOpenAIResponsesUrl(), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openaiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI Responses invoke failed: ${response.status} ${response.statusText} – ${errorText}`
    );
  }

  const raw = (await response.json()) as Record<string, unknown>;
  const outputText = extractResponsesOutputText(raw);

  return {
    id: String(raw.id ?? ""),
    created: Number(raw.created_at ?? Date.now()),
    model: String(raw.model ?? ENV.openaiModel ?? "gpt-5.5"),
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: outputText,
        },
        finish_reason: String(raw.status ?? "completed"),
      },
    ],
    usage: normalizeUsage(raw.usage),
  };
}

function normalizeOpenAIInputMessage(message: Message) {
  return {
    role: normalizeOpenAIRole(message.role),
    content: ensureArray(message.content).map(part => normalizeOpenAIContentPart(part)),
  };
}

function normalizeOpenAIRole(role: Role): "system" | "user" | "assistant" {
  if (role === "system") return "system";
  if (role === "assistant") return "assistant";
  return "user";
}

function normalizeOpenAIContentPart(part: MessageContent) {
  if (typeof part === "string") {
    return {
      type: "input_text",
      text: part,
    };
  }

  if (part.type === "text") {
    return {
      type: "input_text",
      text: part.text,
    };
  }

  if (part.type === "image_url") {
    return {
      type: "input_image",
      image_url: part.image_url.url,
      detail: part.image_url.detail,
    };
  }

  if (part.type === "file_url") {
    return {
      type: "input_text",
      text: part.file_url.url,
    };
  }

  return {
    type: "input_text",
    text: JSON.stringify(part),
  };
}

function extractResponsesOutputText(raw: Record<string, unknown>) {
  if (typeof raw.output_text === "string" && raw.output_text.trim()) {
    return raw.output_text;
  }

  const output = Array.isArray(raw.output) ? raw.output : [];
  const texts: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = Array.isArray((item as { content?: unknown[] }).content)
      ? (item as { content: unknown[] }).content
      : [];

    for (const part of content) {
      if (
        part &&
        typeof part === "object" &&
        typeof (part as { text?: unknown }).text === "string"
      ) {
        texts.push((part as { text: string }).text);
      }
    }
  }

  return texts.join("\n").trim();
}

function normalizeUsage(usage: unknown) {
  if (!usage || typeof usage !== "object") return undefined;
  const value = usage as Record<string, unknown>;
  const inputTokens = Number(value.input_tokens ?? 0);
  const outputTokens = Number(value.output_tokens ?? 0);
  const totalTokens = Number(value.total_tokens ?? inputTokens + outputTokens);

  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: totalTokens,
  };
}
