# Free Chat Tier 1 改造规范 — Planner / Validator / 声明级 Citation

> 给实现者：本文档自包含，按规范实现即可，不需要再问产品决策。
>
> **改造目标**：把当前单 agent loop 拆成 `Plan → Execute → Validate` 三阶段，并把 citation 精确到声明级别。

---

## 背景

### 当前架构（不需要改变的部分）

- 入口：[`server/chat/stream.ts`](../server/chat/stream.ts) 处理 `POST /api/chat/stream`
- 核心：[`server/chat/agentLoop.ts`](../server/chat/agentLoop.ts) 的 `runAgentLoop`，包含 23 个工具 schema、循环调用 LLM、`submit_final_answer` / `report_no_data` 控制工具
- LLM 调用：[`server/_core/llm.ts`](../server/_core/llm.ts) `invokeLLM`，已支持 function calling
- SSE 事件类型：`step` / `tool_call` / `tool_result` / `answer` / `conversation_saved` / `error`
- 前端：[`client/src/pages/ComponentShowcase.tsx`](../client/src/pages/ComponentShowcase.tsx) 消费 SSE

### 当前问题（要解决的）

1. LLM 直接进入 agent loop，**没有计划**，用户也看不到模型打算做什么
2. LLM 写完答案就发，**没有第二道检查**，hallucination 没人接住
3. Citation 是工具调用列表，**不知道哪句话来自哪个工具**

---

## 改造概览

```
旧:  Query ──► [AgentLoop] ──► answer
新:  Query ──► [Planner] ──► [AgentLoop] ──► [Validator] ──► answer (with claim-level citations)
```

3 个改造**互相独立**，可以按顺序提交 3 个 PR：
1. Planner（不破坏现有逻辑，纯追加）
2. 声明级 Citation（数据结构升级，要改 agent loop 内部）
3. Validator（依赖 #2 的数据结构）

---

## 改造 1：Planner 阶段

### 1.1 新增文件 `server/chat/planner.ts`

导出函数：

```typescript
export type ResearchPlan = {
  subQuestions: string[];        // 拆解出的子问题，1-5 条
  plannedTools: Array<{
    name: string;                // 工具名，必须在 AGENT_TOOLS 列表内
    rationale: string;           // 为什么用这个工具
  }>;
  rationale: string;             // 整体计划的理由，1-2 句
};

export async function planResearch(
  messages: ChatInputMessage[],
  options: { signal?: AbortSignal }
): Promise<ResearchPlan | null>;
```

### 1.2 实现要点

- 用 `invokeLLM` 调一次模型，**不传 tools**，用 `outputSchema` 强制 JSON 输出（schema 对应 `ResearchPlan`）
- system prompt：列出 23 个工具的名称 + 描述（可以从 `AGENT_TOOLS` 里抽出来），让模型选择，**不要列出参数细节**
- 失败时返回 `null`，agent loop 走原流程兜底
- 必须支持 AbortSignal

### 1.3 集成到 stream.ts

在调用 `runAgentLoop` 之前：

```typescript
const plan = await planResearch(messages, { signal: controller.signal });
if (plan) {
  emit({ type: "plan", plan });   // 新事件类型
}
// 然后照常 runAgentLoop(..., { ...options, plan })
```

### 1.4 agentLoop.ts 接收 plan 但不强制执行

- `runAgentLoop` 增加 `plan?: ResearchPlan` 参数
- 把 plan 注入到 system prompt 末尾，告诉模型"建议按此计划执行"
- **不要**硬限制工具调用必须在 `plan.plannedTools` 内 — 模型可以根据中途结果调整

### 1.5 前端

- 新增 SSE 事件 `plan` 处理
- 在执行步骤面板上方显示"研究计划"卡片，列出 subQuestions 和 plannedTools
- 暂时不实现"用户编辑计划"，纯展示

---

## 改造 2：声明级 Citation

### 2.1 数据结构升级

在 [`server/chat/types.ts`](../server/chat/types.ts) 修改：

```typescript
// 新增：每次工具调用的唯一 ID
export type ChatToolResult = {
  callId: string;                // 新增，UUID 或 `${toolName}-${index}` 格式
  toolName: string;
  title: string;
  summary: string;
  source: string;
  data: unknown;
};

// 把 keyFindings 从 string[] 升级为对象数组
export type ChatKeyFinding = {
  claim: string;                 // 声明本身
  sourceCallIds: string[];       // 来源工具调用 ID（≥1）
};

export type ChatAnswerPayload = {
  // ...
  keyFindings: ChatKeyFinding[]; // 升级
  // ...
};
```

### 2.2 agentLoop.ts 改动

- 每次创建 `ChatToolResult` 时生成 `callId`（用 `crypto.randomUUID()` 或 `${toolName}-${iterationIndex}-${batchIndex}`）
- `submit_final_answer` 工具的 schema 升级：`keyFindings` 字段从 `string[]` 改成对象数组：
  ```typescript
  keyFindings: {
    type: "array",
    items: {
      type: "object",
      properties: {
        claim: { type: "string" },
        sourceCallIds: { type: "array", items: { type: "string" } }
      },
      required: ["claim", "sourceCallIds"]
    }
  }
  ```
- 在 agent loop 的 system prompt 中明确：**每个 keyFinding 必须至少标注 1 个 sourceCallId**，否则会被视为 hallucination
- 工具结果回传给 LLM 时，content 里要包含 callId，让模型知道每条数据的引用 ID。例如：
  ```json
  { "callId": "get_token_unlock-1-0", "summary": "...", "data": {...} }
  ```

### 2.3 前端渲染

- `ChatKeyFinding` 渲染时，每条 claim 后面跟一组可点击的 chip：`[get_token_unlock]` `[get_kline]`
- 点击 chip 滚动/高亮到右侧"数据引用"面板对应卡片（卡片用 callId 作为 anchor）
- 兜底：如果 `sourceCallIds` 为空，显示 `⚠ 未标注来源` 灰色标签

---

## 改造 3：Validator 阶段

### 3.1 新增文件 `server/chat/validator.ts`

```typescript
export type ValidationResult = {
  message: string;                    // 校验后的最终 message
  keyFindings: ChatKeyFinding[];      // 保留下来的 findings
  removedFindings: Array<{
    claim: string;
    reason: string;                   // 为什么删除
  }>;
};

export async function validateAnswer(input: {
  userQuery: string;
  draftPayload: ChatAnswerPayload;
  toolResults: ChatToolResult[];      // 所有调用过的工具结果
  signal?: AbortSignal;
}): Promise<ValidationResult>;
```

### 3.2 实现要点

- 调一次 LLM，**不传 tools**，用 `outputSchema` 约束输出
- system prompt 大意：
  > 你是数据校验员。检查 draft 的每个 keyFinding，确认它的 claim 能从 sourceCallIds 指向的工具结果里直接验证。
  > - 能验证 → 保留
  > - 不能验证 / 编造的数字 / 与数据矛盾 → 移到 removedFindings，给出原因
  > - message 字段里的具体数字、地址、日期也要核对，发现错误就修正
- user message 里传：原问题、draft message、draft keyFindings、所有 toolResults 的精简版（summary + 关键字段，不要整个 data dump）
- 失败时返回原 draft 不动（不要因为 validator 挂了导致整条响应失败）

### 3.3 集成到 stream.ts

```typescript
const draft = await runAgentLoop(messages, { ..., signal: controller.signal }, emit);

emit({ type: "step", step: { id: "validate", label: "校验数据引用", status: "running" } });
const validated = await validateAnswer({
  userQuery: latestUserMessage,
  draftPayload: draft,
  toolResults: collectedToolResults,  // 注意：需要 runAgentLoop 返回工具结果数组
  signal: controller.signal,
});

const finalPayload: ChatAnswerPayload = {
  ...draft,
  message: validated.message,
  keyFindings: validated.keyFindings,
};

emit({ type: "step", step: { id: "validate", label: "校验数据引用", status: "completed",
  detail: validated.removedFindings.length > 0
    ? `移除 ${validated.removedFindings.length} 条无依据声明`
    : "全部声明已验证" } });

emit({ type: "answer", payload: finalPayload });
```

### 3.4 `runAgentLoop` 需要把 `toolResults` 暴露出来

- 当前 `runAgentLoop` 只返回 `ChatAnswerPayload`，把 `allToolResults` 收口在函数内部
- 改成返回 `{ payload: ChatAnswerPayload; toolResults: ChatToolResult[] }`，方便 validator 使用

---

## 不要动的地方（防止冲突）

并行 Claude 实例可能在改这些区域，请**保持不动**或只做最小化适配：

1. **`server/_core/llm.ts`** — LLM 路由层已稳定，不要改 `invokeLLM` 签名
2. **`server/chat/tools.ts`** — 工具实现层不要改，只在 `agentLoop.ts` 的 schema 里读取
3. **`client/src/components/AIChatBox.tsx`** — 聊天组件不要改，所有新 UI 通过 props 传入
4. **布局相关 CSS** — `ComponentShowcase.tsx` 的网格布局、`App.tsx` 的路由分流不要动
5. **AbortController 流程**、**`conversation_saved` 事件**、**`replaceChatArtifacts` 持久化** — 已经修好，保持现状即可

如果实现过程中发现非改不可的耦合，**先在 PR 里说明**，不要默默修改。

---

## 验收标准

提交前请用以下场景手测：

| 场景 | 期望行为 |
|---|---|
| 问 "查看 OPG 解锁信息" | SSE 收到 `plan` 事件，列出 subQuestions 和 `[get_token_unlock]`；agent loop 跑完；validator 至少跑一次；前端每条 keyFinding 后面有 `[get_token_unlock-X]` chip |
| 问 "你好" | Planner 返回少量 / 空 plannedTools；agent loop 用 fallback 文本结束；validator 不应该把空 findings 报错 |
| 故意制造矛盾：让模型说"OPG 解锁 50%"（实际工具返回 10%） | Validator 应该把这条 finding 移到 `removedFindings`，前端不展示它 |
| 中途关闭浏览器 | 服务端日志能看到 planner/loop/validator 任一阶段被 AbortSignal 中止，不继续往下跑 |
| `pnpm check` | 0 错误 |

---

## 时间估算

- 改造 1（Planner）：~3-4 小时
- 改造 2（Citation 升级）：~4-6 小时（数据结构改动牵连较多）
- 改造 3（Validator）：~2-3 小时

建议按 `1 → 2 → 3` 顺序，每步独立 commit / PR，便于回滚。
