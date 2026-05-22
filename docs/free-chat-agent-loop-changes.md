# Free Chat Agent Loop 改造 — 改动总结

> 目的：让 review 者快速理解这次改动的边界、动机、技术决策和已知取舍。
>
> 项目：`crypto_exchange_dashboard` / Free Chat 模块
> 改造前：规则路由（regex → 任务类型 → 预选工具 → 一次 LLM 格式化输出）
> 改造后：LLM tool-calling agent loop + SSE 流式

---

## 1. 架构层面

### 1.1 从「规则路由」到「Agent Loop」

| 维度 | 改造前 | 改造后 |
|---|---|---|
| 任务分类 | regex 匹配（9 类） | LLM 自主判断 |
| 工具选择 | 任务类型 → 固定工具集 | LLM 自主从 23 个工具里选 |
| 调用形式 | 单轮，所有工具并行 | 多轮（max 8），LLM 看到工具结果后决定下一步 |
| 终止条件 | 工具跑完即止 | LLM 主动调用 `submit_final_answer` |
| 数据边界 | 落空就降级模板 | LLM 调用 `report_no_data` |

### 1.2 从「同步响应」到「SSE 流式」

旧：tRPC mutation，等待整个流程跑完再一次性返回。
新：`POST /api/chat/stream` 走 `text/event-stream`，事件类型：
- `step` — 阶段性步骤更新（理解问题 / 加载数据 / 生成结论）
- `tool_call` — LLM 决定调用某个工具
- `tool_result` — 工具返回结果
- `answer` — 最终分析结论
- `conversation_saved` — 落库完成（仅携带 conversationId，不重复 payload）
- `error` — 异常

旧 tRPC `chat.sendMessage` 接口保留未删，可作为兼容入口。

---

## 2. 文件清单

### 新增
- [`server/chat/agentLoop.ts`](../server/chat/agentLoop.ts) — Agent Loop 核心
- [`server/chat/stream.ts`](../server/chat/stream.ts) — SSE Express 路由

### 修改
- [`server/_core/llm.ts`](../server/_core/llm.ts) — LLM 调用层
- [`server/_core/index.ts`](../server/_core/index.ts) — 注册 SSE 路由
- [`server/chat/tools.ts`](../server/chat/tools.ts) — 扩展到 20+ 工具（前置工作）
- [`client/src/App.tsx`](../client/src/App.tsx) — 路由级布局
- [`client/src/pages/ComponentShowcase.tsx`](../client/src/pages/ComponentShowcase.tsx) — Free Chat 页面
- [`client/src/components/AIChatBox.tsx`](../client/src/components/AIChatBox.tsx) — 聊天组件

---

## 3. 后端改动详情

### 3.1 `server/_core/llm.ts`

**1) `Message` 类型扩展**
增加 `tool_calls?: ToolCall[]` 字段，使 assistant 消息可以承载 function calling 历史。`normalizeMessage` 同步透传该字段。

**2) 路由切换**
`.env` 配置的是 `BUILT_IN_OPENAI_API_URL`（OpenAI Responses 路径），但 Responses API 不支持 chat completions 风格的 function calling。新增 `resolveOpenAICompletionsUrl()`：从同一台 host 派生 `/v1/chat/completions`。

`invokeLLM` 路由规则：
- 无 tools → 走 OpenAI Responses
- 有 tools 且没有 forge key → 用 OpenAI key 走派生的 chat/completions URL
- 有 tools 且有 forge key → 走 forge

**3) `invokeForgeChatCompletions` 参数化**
增加 `urlOverride?: string`、`apiKeyOverride?: string` 参数。当走 OpenAI override 路径时：
- model 用 `ENV.openaiModel`（gpt-5.5），而不是默认的 `gemini-2.5-flash`
- 跳过 `thinking: { budget_tokens: 128 }` 参数（这是 Gemini 专属，OpenAI server 不识别会触发未知行为）

**4) 调用日志**
每次 LLM 调用前后打印 `[LLM] → URL model=X tools=N` 和 `[LLM] ← finish_reason=Y tool_calls=N content_len=M`，便于线上排障。

### 3.2 `server/chat/agentLoop.ts`

**核心结构：**

```typescript
export async function runAgentLoop(
  messages: ChatInputMessage[],
  options: { workspace?, signalContext?, signal?: AbortSignal },
  emit: (event: AgentEvent) => void
): Promise<ChatAnswerPayload>
```

**工具集（23 个）：**

| 类别 | 工具 |
|---|---|
| 基础信息 | `get_token_profile`, `get_token_unlock`, `get_token_listing`, `get_funding_rounds`, `get_social_heat`, `get_kline` |
| 交易所/上线 | `get_exchange_recent_listings`, `filter_exchange_listings`, `get_binance_alpha_listings`, `search_announcements` |
| 流动性/深度 | `get_depth_view`, `get_depth_trend` |
| 链上 | `get_onchain_holders`, `get_onchain_fund_flow`, `get_large_transfers`, `get_cex_flows`, `get_onchain_overview` |
| 筛选/批量 | `screen_market`, `screen_bullish_streak`, `get_signal_events` |
| 外部 | `web_search` |
| 控制 | `report_no_data`, `submit_final_answer` |

**循环逻辑：**

1. `MAX_ITERATIONS = 8`
2. 每轮调 `invokeLLM` 带 23 个工具 schema
3. 收到 `tool_calls` → **并发**执行所有工具（`Promise.all` + `withTimeout(30s)`）
4. 工具结果按原顺序写回 `llmMessages`（保持 OpenAI tool call/response 配对）
5. 检测到 `submit_final_answer` → 解析 args 作为最终答案，跳出循环
6. LLM 返回纯文本（无 tool_calls）→ 接受为兜底答案，标记 `usedFallback = true`

**AbortSignal：**
- 每轮迭代开始时检查 `abort?.aborted`
- LLM 调用返回后再次检查
- 用于客户端断开时立即停止后续 LLM 调用（节省 API 成本）

**系统提示核心约束：**
```
- 只能引用工具返回的真实数据，严禁编造任何数值、地址、时间、排名
- 可以多轮调用工具，工具调用之间可以并行
- 没有任何工具能回答 → 调用 report_no_data
- 数据收集完毕 → 调用 submit_final_answer
```

**Schema 一致性修正：**
- `get_kline.range` 加 `enum: ["1m", "3m", "6m", "1y"]`，描述对齐执行器实际接受的值（之前 schema 写 `7d/30d/90d` 但执行器只认 `1m/3m/6m/1y`，会静默回退）

### 3.3 `server/chat/stream.ts`

**`POST /api/chat/stream` 处理流程：**

1. SSE 头：`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`
2. 创建 `AbortController`，绑定到 `req.on("close")`
3. 调 `runAgentLoop(messages, { signal: controller.signal }, emit)`
4. 落库（仅当 `closed === false` 且 `user.openId` 存在）：
   - `db.upsertChatConversation`
   - `db.replaceChatMessages`
   - `db.replaceChatArtifacts`（**带 markdown 内容**，与旧 tRPC 路径完全对齐）
5. 落库成功后发送 `conversation_saved` 事件（只带 `conversationId`，不重复 answer payload）

**与 tRPC 路径的功能对等：**
- `buildAssistantMessage` — 拼接 message + keyFindings + suggestedNextActions
- `buildReportMarkdown` — 生成下载用的 markdown 报告（标题、问题、结论、关键发现、引用）

---

## 4. 前端改动

### 4.1 `client/src/App.tsx`

**全屏路由白名单：**
```typescript
const FULL_WIDTH_ROUTES = ["/chat"];
```

`/chat` 路由跳过 `<div className="container">`（CSS 里 max-width: 1280px），改用 `px-4 lg:px-6`。其它页面照旧。

### 4.2 `client/src/pages/ComponentShowcase.tsx`

**1) SSE 消费逻辑替换 tRPC mutation**

`handleSendMessage` 用 `fetch("/api/chat/stream")` + `response.body.getReader()` 实时解析 SSE 流。事件分发：
- `step` / `tool_call` / `tool_result` → 更新 `liveSteps`，写入 `task.executionSteps`
- `answer` → 渲染 assistant message，更新 citations / artifacts / detectedSymbol 等
- `conversation_saved` → 单独更新 `task.id`，触发 `conversationListQuery.refetch()`
- `error` → toast 提示

**2) `liveStatus` 实时状态文本**
`useMemo` 从 `executionSteps` 提取最近一个 `running` 状态的步骤 label，传给 `AIChatBox`，用于在 loading 气泡里显示「正在调用 X」。

**3) Fallback 标记**
当 `payload.usedFallback === true`，在 assistant 消息开头自动追加引用块：
```
> ⚠ 本次回答未引用工具数据，请谨慎参考。
```

**4) 布局修正**
- 外层 `h-[calc(100vh-132px)] overflow-hidden mx-auto max-w-[1600px]`
- 三栏 `lg:grid-cols-[240px_minmax(0,1fr)_300px]`，加 `grid-cols-1` 兜底
- 容器 `bg-white`（解决之前 `bg-white/92` 半透明导致的视觉断裂）
- 左/右 aside 都用 `flex h-full flex-col overflow-hidden` + 内部 `min-h-0 flex-1 overflow-y-auto`
- 主区 `flex h-full min-h-0 flex-col overflow-hidden`（保证输入框永远可见）

### 4.3 `client/src/components/AIChatBox.tsx`

**1) 移除 `height` prop，改为永远 `h-full`**
旧：`style={{ height }}`，依赖父级显式高度。
新：`flex h-full flex-col` + 内部消息区 `min-h-0 flex-1 overflow-hidden`。无 `min-h-0` 时 flex 子元素会撑破容器。

**2) 新增 `liveStatus?: string` prop**
loading 气泡渲染逻辑：
- 有 `liveStatus` → 显示「⟳ 正在调用 X」
- 无 → 三点跳动动画

---

## 5. 已修复的 Bug

| # | Bug | 触发场景 | 修复 |
|---|---|---|---|
| 1 | K 线 schema/executor 不一致 | LLM 按 schema 传 `7d`，执行器静默回退 `3m`，用户问 7 天涨幅得到 3 个月数据 | schema 加 enum 限制 |
| 2 | SSE 路径丢 artifacts | 通过 `/api/chat/stream` 生成的对话刷新页面后报告下载为空 | 补 `replaceChatArtifacts` + `buildReportMarkdown` |
| 3 | 客户端断开后 agent 仍跑 | 用户切任务/关页面，后端继续烧 LLM 调用和 BQ 查询 | `AbortController` + 每轮 `signal.aborted` 检查 |
| 4 | 重复 `answer` 事件 | 落库前后各发一次 `answer`，前端二次重写 message | 拆分为 `answer`（仅一次）+ `conversation_saved` |
| 5 | 工具串行执行慢 | 一轮 6 个工具串行 = 6 倍单工具耗时 | `Promise.all` 并发 + 每工具 30s 超时 |
| 6 | 输入框被挤到屏幕外 | flex 子元素无 `min-h-0`，撑破父容器 | 在所有 flex 链路加 `min-h-0` |
| 7 | 右侧面板视觉断裂 | `bg-white/92` 半透明 + aside 不同色，视觉上像分离的两块 | 全部改 `bg-white` 实色 |
| 8 | xl 断点边界失效 | 1280px 边界附近 Retina 屏幕 xl 不触发，三栏退化为单列 | 改用 `lg:` 断点（1024px）+ `grid-cols-1` 兜底 |

---

## 6. 已识别但未做的优化

这些是 GPT review 提出的方向，权衡后判断现阶段不做：

| 项 | 决策 | 理由 |
|---|---|---|
| 强制必须调 `submit_final_answer`，禁止裸文本结束 | **不改** | 简单对话（"你好"、"agent 是什么"）模型应该可以直接回答；保留兜底 + `usedFallback` 标记是更柔和的方案 |
| 工具分层 fast/slow，慢工具需要明确理由 | **不改** | 没有真实耗时分布数据；当前 30s 单工具上限够用；等线上数据再决定 |
| 全局耗时预算 + 提前返回部分结果 | **缓做** | AbortController 已经覆盖了"用户主动放弃"的最大问题，全局预算是次要优化 |
| Planner/Validator 分层（multi-agent） | **不改** | 22 个工具规模下用不上；额外 LLM 往返成本高于收益 |

---

## 7. 测试建议

**正向场景：**
- "查看 OPG 的解锁信息" → 应该 1 轮调 `get_token_unlock`，2 轮调 `submit_final_answer`
- "最近 7 天 BTC 价格走势" → `get_kline` 应该传 `1m`（最接近 7 天的合法值），不会再传 `7d`
- 复杂问题如 "BTC 全维度分析" → 一轮内并发多个工具，整体等待 ≤ 30s

**异常场景：**
- 测试中途切换任务 → 服务端应打印 `[Agent] aborted by client`，停止后续 LLM 调用
- 模型调用失败的工具 → 仍能继续后续工具，最终答案给出 `usedFallback` 提示
- 问题超出数据边界（如"贵州茅台股价"）→ 模型应该调 `report_no_data`

**回归点：**
- 刷新页面后历史对话的报告还能正常下载
- 三栏布局 1024px 以上正常显示，1024px 以下垂直堆叠
- 输入框始终可见，消息区独立滚动
