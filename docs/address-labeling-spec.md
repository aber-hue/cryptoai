# 地址标签分析引擎 — 简化实施 Spec

> 目标：方案要清晰、可落地、不过度设计。
> 核心交付：运营在 UI 里选一个代币，跑一次分析，在审核页逐条批/拒，通过的标签进入生产表，供调研报告等下游消费。

---

## 1. 设计原则

这版方案只坚持 4 个原则：

1. **标签按 token + chain 生效**
   同一个地址在不同 token、不同链上的含义可以不同，不做全局强绑定。

2. **先产出 proposal，再人工审核，再入生产表**
   detector 只负责“提出判断”，最终是否生效由人工审核决定。

3. **证据必须可读、可追溯**
   每条 proposal 必须有一句话理由和结构化 evidence，方便审核和回看。

4. **先把主链路做顺，再做复杂 detector**
   MVP 先把 `tokenomics_match -> review -> address_labels` 跑通，后续再逐步扩 detector。

---

## 2. 范围

### 2.1 本次范围

- 标签分析 run 的创建、执行、查看
- proposal 暂存与人工审核
- 审核通过后写入 `address_labels`
- 下游按 token 查询已生效标签

### 2.2 不在本次范围

- detector 的复杂算法细节
- 跟 `wallet_info` 的融合查询
- 自动训练 / 自动纠错
- CLI 工具
- 多角色权限体系

---

## 3. 总体流程

整个系统只保留一条主流程：

```text
选代币 -> startAnalysis -> detector 生成 proposals -> 人工审核 -> 写入 address_labels -> 下游消费
```

具体说明：

1. 运营在 `/labels` 选择 `symbol + chain`，点击开始分析
2. 系统创建一个 run，按顺序执行 detector
3. detector 产出 proposal，统一写入 `address_label_proposals`
4. 运营在 `/labels/review/:runId` 审核 proposal
5. 审核通过的 proposal 写入 `address_labels`
6. 调研报告等下游只读取 `address_labels` 中 `is_active = true` 的记录

---

## 4. 核心简化决策

### 4.1 run 状态只保留 3 个

- `running`
- `success`
- `failed`

说明：

- 不做 `partial`
- 某个 detector 失败时，默认整次 run 失败，先保证逻辑简单
- 如果后面确实需要容错，再引入 `partial`

### 4.2 proposal 审核状态只保留 3 个

- `pending`
- `approved`
- `rejected`

说明：

- 不做 `needs_revision`
- “需要修改” 在 MVP 里本质上等于 `reject + review_note`
- 这样审核逻辑、计数逻辑、UI 状态都会简单很多

### 4.3 label 覆盖规则以“新审核结果”为准

不要用 detector 的 `confidence` 决定是否覆盖老标签。

规则改为：

- 当 reviewer 批准一条 proposal 时，如果同 `(token_id, chain_id, address, label)` 已有 active label：
  - 旧记录置为 `is_active = false`
  - 旧记录 `superseded_by = 新 label id`
  - 插入新记录为 `is_active = true`
- 即：**后批准的记录覆盖先批准的记录**

原因：

- detector 的 confidence 是“建议强度”，不是生产真相
- 最终权威来自人工审核

### 4.4 detector 顺序执行，不做复杂 stage 依赖

MVP 保留 stage 字段做展示和分组，但执行逻辑简化为：

- detector 按注册顺序依次执行
- 每个 detector 都可以读取当前 run 已产生的 proposals
- 不再要求复杂的 stage pipeline

这样可以避免：

- `downstream` 必须等 `bootstrap` 落库后才能用的问题
- `cluster` / `sink` / `behavior` 多阶段并发带来的上下文传递复杂度

---

## 5. 数据库设计

## 5.1 `label_analysis_runs`

用途：记录每一次分析任务。

```sql
CREATE TABLE label_analysis_runs (
  run_id           VARCHAR(64) PRIMARY KEY,           -- lba_<symbol>_<timestamp>_<rand4>
  token_id         INT NOT NULL,
  chain_id         INT NOT NULL,
  symbol           VARCHAR(32) NOT NULL,
  triggered_by     VARCHAR(64) NOT NULL,
  started_at       TIMESTAMP NOT NULL,
  finished_at      TIMESTAMP NULL,
  status           ENUM('running', 'success', 'failed') NOT NULL,
  proposal_count   INT NOT NULL DEFAULT 0,
  approved_count   INT NOT NULL DEFAULT 0,
  rejected_count   INT NOT NULL DEFAULT 0,
  config_json      JSON NOT NULL,
  error_message    TEXT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_token (token_id, started_at DESC),
  INDEX idx_status (status, started_at DESC)
);
```

说明：

- `approved_count` / `rejected_count` 是 UI 快速展示用的冗余字段
- 这些字段必须只通过审核接口在事务里更新

## 5.2 `address_label_proposals`

用途：保存 detector 产出的待审核提案。

```sql
CREATE TABLE address_label_proposals (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  run_id             VARCHAR(64) NOT NULL,

  token_id           INT NOT NULL,
  chain_id           INT NOT NULL,
  address            VARCHAR(66) NOT NULL,              -- 统一小写

  proposed_label     VARCHAR(64) NOT NULL,
  proposed_subtype   VARCHAR(64) NULL,
  proposed_tags_json JSON NULL,
  confidence         DECIMAL(3,2) NOT NULL,

  detector           VARCHAR(32) NOT NULL,
  stage              ENUM('bootstrap', 'downstream', 'behavior', 'sink', 'cluster') NOT NULL,

  reason_summary     TEXT NOT NULL,
  evidence_json      JSON NOT NULL,

  review_status      ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  reviewer           VARCHAR(64) NULL,
  reviewed_at        TIMESTAMP NULL,
  review_subtype     VARCHAR(64) NULL,
  review_tags_json   JSON NULL,
  review_note        TEXT NULL,

  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_run (run_id, review_status),
  INDEX idx_review (review_status, created_at DESC),
  INDEX idx_token_addr (token_id, chain_id, address),
  INDEX idx_label (proposed_label)
);
```

说明：

- detector 的原始建议保留在 `proposed_*`
- 审核员修正后的结果保留在 `review_*`
- `review_note` 在拒绝时必填

## 5.3 `address_labels`

用途：生产标签表，下游只读这里。

```sql
CREATE TABLE address_labels (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  token_id           INT NOT NULL,
  chain_id           INT NOT NULL,
  address            VARCHAR(66) NOT NULL,              -- 统一小写
  label              VARCHAR(64) NOT NULL,
  subtype            VARCHAR(64) NULL,
  tags_json          JSON NULL,
  confidence         DECIMAL(3,2) NOT NULL,

  source_proposal_id BIGINT NOT NULL,
  approved_by        VARCHAR(64) NOT NULL,
  approved_at        TIMESTAMP NOT NULL,

  superseded_by      BIGINT NULL,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  active_key         VARCHAR(180) GENERATED ALWAYS AS (
    CASE
      WHEN is_active THEN CONCAT(token_id, ':', chain_id, ':', address, ':', label)
      ELSE NULL
    END
  ) STORED,

  UNIQUE KEY uq_active_label (active_key),
  INDEX idx_addr (chain_id, address),
  INDEX idx_label (token_id, label, is_active),
  INDEX idx_token_active (token_id, chain_id, is_active)
);
```

说明：

- 保留历史版本，不直接删除
- 只限制“同一时刻只能有一条 active 记录”
- 这样允许一个地址的同一标签有多次历史版本

## 5.4 地址存储规则

- 所有地址入库前统一转小写
- 查询参数也统一转小写
- 不在 SQL 条件里对列做 `LOWER(address)`，避免影响索引

---

## 6. Label 字典

### 6.1 原则

所有 detector、API、UI 都只认一个字典源：

- 文件：`server/labeling/dictionary.ts`

字典负责定义：

- label 名称
- 展示名
- 所属 stage
- 默认 detector
- 描述
- 规则说明
- 建议 subtype
- 冲突标签

### 6.2 `LabelDef`

```typescript
export type LabelStage =
  | "bootstrap"
  | "downstream"
  | "behavior"
  | "sink"
  | "cluster";

export type LabelDef = {
  displayName: string;
  stage: LabelStage;
  detector: string;
  description: string;
  rule: string;
  typicalConfidenceRange: [number, number];
  subtypes: string[];
  conflictsWith?: string[];
  examples?: string[];
};
```

### 6.3 label 集合

本次不改你原来的 label 语义，继续沿用原来的分类：

- `bootstrap`
  - `team_vault`
  - `investor_vault`
  - `ecosystem_vault`
  - `community_vault`
  - `foundation_vault`
  - `airdrop_vault`
  - `public_sale_vault`
  - `private_sale_vault`
  - `reserve_vault`

- `downstream`
  - `team_personal`
  - `team_multisig_signer`
  - `investor_personal`
  - `foundation_operational`

- `behavior`
  - `airdrop_distributor`
  - `airdrop_sender`
  - `vesting_contract`
  - `reward_distributor`
  - `activity_wallet`
  - `market_maker`

- `sink`
  - `cex_deposit`
  - `cex_hot_wallet`
  - `dex_pool`
  - `dex_router`
  - `bridge_contract`
  - `burn_address`

### 6.4 冲突规则

`conflictsWith` 不只是文档字段，还要在审核通过时执行。

审核批准时逻辑如下：

1. 找到目标地址当前 active labels
2. 如果新 label 与现有 active label 命中冲突：
   - 默认阻止批准
   - 返回冲突信息给 UI
3. reviewer 明确选择“替换冲突标签”时：
   - 先把冲突的 active label 置为 inactive
   - 再插入新 label

MVP 也可以先只做“阻止批准”，不做“强制替换”，这样实现更简单。

### 6.5 文档生成

从 `LABEL_DICTIONARY` 自动生成运维文档：

- 脚本：`scripts/gen-label-docs.ts`
- 输出：`docs/label-dictionary.md`

```json
{
  "scripts": {
    "gen:label-docs": "tsx scripts/gen-label-docs.ts"
  }
}
```

---

## 7. Evidence 标准

每条 proposal 必须有结构化 evidence，格式统一：

```typescript
type EvidenceJson = {
  detector_version: string;
  inputs: Record<string, unknown>;
  signals: Record<string, number | string | boolean>;
  sample_txs?: string[];
  source_addresses?: string[];
  notes?: string;
};
```

要求：

- `inputs` 保存 detector 输入快照
- `signals` 保存命中的关键证据
- `sample_txs` 最多保留少量样本，不要塞太多
- `reasonSummary` 必须是人类可直接读懂的一句话

---

## 8. tRPC 接口规范

新增 `labels` router。

```typescript
labels: router({
  getLabelDictionary: publicProcedure.query(() => LABEL_DICTIONARY),

  startAnalysis: protectedProcedure
    .input(z.object({
      symbol: z.string().min(1),
      chainId: z.number().int().optional(),
      config: z.object({
        preWindowDays: z.number().int().min(1).max(60).default(7),
        claimWindowDays: z.number().int().min(1).max(60).default(14),
        tolerancePct: z.number().min(0).max(5).default(0.5),
      }).partial().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      return { runId: "lba_xxx" };
    }),

  listRuns: protectedProcedure
    .input(z.object({
      tokenId: z.number().int().optional(),
      status: z.enum(["running", "success", "failed"]).optional(),
      limit: z.number().int().default(20),
      cursor: z.string().optional(),
    }))
    .query(async () => {
      return { items: [], nextCursor: null };
    }),

  getRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .query(async () => {
      return {
        run: {},
        proposalsByStage: {},
      };
    }),

  getReviewQueue: protectedProcedure
    .input(z.object({
      runId: z.string(),
      status: z.enum(["pending", "approved", "rejected"]).default("pending"),
      stage: z.enum(["bootstrap", "downstream", "behavior", "sink", "cluster"]).optional(),
      cursor: z.string().optional(),
    }))
    .query(async () => {
      return {
        items: [],
        nextCursor: null,
        progress: { reviewed: 0, total: 0 },
      };
    }),

  reviewProposal: protectedProcedure
    .input(z.object({
      proposalId: z.number().int(),
      action: z.enum(["approve", "reject"]),
      subtype: z.string().optional(),
      tags: z.array(z.string()).optional(),
      reviewNote: z.string().optional(),
    }))
    .mutation(async () => {
      return { ok: true, labelId: 123 };
    }),

  reviewBatch: protectedProcedure
    .input(z.object({
      proposalIds: z.array(z.number().int()),
      action: z.enum(["approve", "reject"]),
      reviewNote: z.string().optional(),
    }))
    .mutation(async () => {
      return { approved: 0, rejected: 0, failed: 0 };
    }),

  getLabelsByToken: protectedProcedure
    .input(z.object({
      tokenId: z.number().int(),
      chainId: z.number().int().optional(),
    }))
    .query(async () => {
      return { labels: [] };
    }),
}),
```

### 8.1 `reviewProposal` 的事务规则

批准时必须在一个事务中完成：

1. 锁定 proposal 行，确认仍是 `pending`
2. 校验 label 是否合法
3. 校验是否命中冲突标签
4. 将同 `(token_id, chain_id, address, label)` 的 active label 置为 inactive
5. 插入新的 active label
6. 更新 proposal 为 `approved`
7. 更新 run 计数

拒绝时必须在一个事务中完成：

1. 锁定 proposal 行，确认仍是 `pending`
2. `review_note` 必填
3. 更新 proposal 为 `rejected`
4. 更新 run 计数

---

## 9. UI 页面规范

### 9.1 页面 1：`/labels`

用途：

- 选择 token / chain
- 启动分析
- 查看最近 runs

展示重点：

- `run_id`
- `symbol`
- `status`
- `proposal_count`
- `approved_count`
- `rejected_count`

MVP 不放太多高级过滤器，保持轻量。

### 9.2 页面 2：`/labels/runs/:runId`

用途：

- 查看本次 run 的配置
- 看 proposal 分布
- 跳转到审核页

重点信息：

- run 基本信息
- stage 维度的 proposal 数量
- run 错误信息

### 9.3 页面 3：`/labels/review/:runId`

用途：

- 单条审核 proposal

MVP 功能：

- 显示地址、标签、confidence、detector、stage
- 显示一句话理由
- 显示结构化证据
- 允许 reviewer 修正 subtype / tags
- 允许批准 / 拒绝
- 拒绝时 `reviewNote` 必填

MVP 先不做：

- `needs_revision`
- 复杂批量编辑
- reviewer 自定义冲突替换策略

---

## 10. Detector 规范

### 10.1 接口

```typescript
export type DetectorContext = {
  runId: string;
  tokenId: number;
  chainId: number;
  symbol: string;
  config: Record<string, unknown>;
  priorProposals: ProposalDraft[];
  signal?: AbortSignal;
};

export type ProposalDraft = {
  address: string;
  proposedLabel: LabelEnum;
  proposedSubtype?: string;
  proposedTags?: string[];
  confidence: number;
  stage: LabelStage;
  reasonSummary: string;
  evidenceJson: EvidenceJson;
};

export interface Detector {
  name: string;
  stage: LabelStage;
  run(ctx: DetectorContext): Promise<ProposalDraft[]>;
}
```

### 10.2 执行规则

执行器 `server/labeling/runner.ts`：

```typescript
export async function runAnalysis(ctx: Omit<DetectorContext, "runId" | "priorProposals">) {
  const runId = generateRunId(ctx.symbol);
  await insertRun({ runId, ...ctx, status: "running" });

  const allProposals: ProposalDraft[] = [];

  try {
    for (const detector of DETECTORS) {
      const next = await detector.run({
        ...ctx,
        runId,
        priorProposals: allProposals,
      });

      allProposals.push(...next);
    }

    await insertProposals(runId, allProposals);
    await updateRun(runId, {
      status: "success",
      proposalCount: allProposals.length,
      finishedAt: new Date(),
    });

    return runId;
  } catch (error) {
    await updateRun(runId, {
      status: "failed",
      errorMessage: String(error),
      finishedAt: new Date(),
    });
    throw error;
  }
}
```

说明：

- 按注册顺序串行执行
- 后面的 detector 可以读前面的产出
- 这样最容易理解，也最不容易出现时序 bug

### 10.3 detector 注册顺序

MVP 建议顺序：

1. `tokenomics_match`
2. `downstream_inherit`
3. `airdrop_pattern`
4. `vesting_pattern`
5. 其他 detector

---

## 11. 实施顺序

先做最小闭环，不追求一次做全：

| 顺序 | 工作 | 目标 |
|---|---|---|
| 1 | `LABEL_DICTIONARY` + `gen:label-docs` | 先统一术语 |
| 2 | 3 张表 DDL | 建好数据骨架 |
| 3 | `startAnalysis` / `listRuns` / `getRun` | 能发起 run 并看到结果 |
| 4 | runner 框架 | 能真正执行 detector |
| 5 | 第一个 detector：`tokenomics_match` | 跑通最高价值标签 |
| 6 | `getReviewQueue` / `reviewProposal` | 完成审核闭环 |
| 7 | `/labels` + `/labels/review/:runId` | 运营可用 |
| 8 | `/labels/runs/:runId` | 辅助查看 |
| 9 | 第二个 detector：`downstream_inherit` | 提升覆盖率 |
| 10 | 后续 detector 渐进扩展 | 持续增强 |

---

## 12. 验收标准

### 12.1 主链路

1. 在 `/labels` 选择代币并发起分析，成功创建 run
2. run 执行完成后，`address_label_proposals` 有 proposal 数据
3. 在审核页可以看到 proposal、理由和证据
4. 批准 proposal 后，`address_labels` 新增 active 记录
5. 拒绝 proposal 后，proposal 状态变为 `rejected`

### 12.2 覆盖逻辑

1. 同一地址同一 label 再次被批准时：
   - 旧记录变为 `is_active = false`
   - 新记录变为 `is_active = true`
2. 历史记录保留可追溯

### 12.3 强类型

1. `LABEL_DICTIONARY` 改动后，相关 detector / UI 编译期可发现错误
2. `pnpm gen:label-docs` 生成结果和字典一致

---

## 13. 暂不做的复杂点

为了保持系统清晰，以下内容明确不放进 MVP：

- `partial` run
- `needs_revision`
- detector 并发编排
- 自动冲突替换
- 自动训练集
- 复杂权限模型
- 跨链同币联动分析

这些都可以在主链路稳定后再逐步补上。

