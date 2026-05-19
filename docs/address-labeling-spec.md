# 地址角色归因引擎 — v2 实施 Spec

> 目标：让系统稳定产出“可审阅的角色、证据、地址簇和最终标签候选”。
> 这版重点不是自动贴对最终标签，而是把归因链路做清楚。

---

## 1. 设计原则

### 1.1 从 mint 后早期分发出发

系统的起点不是“当前 holder 分布”，而是：

- token mint 后的最早转账
- 早期窗口内的多层分发结构
- 节点在后续观察窗口里的行为

### 1.2 先识别角色，再收敛最终标签

系统不要让 detector 直接输出 `team_vault`。

合理顺序是：

```text
graph -> evidence -> role proposal -> final label proposal
```

### 1.3 先看地址簇，不急着判断单地址

很多目标对象本质上不是单个地址，而是一组相关地址。

所以系统必须支持：

- 单地址 proposal
- 地址簇 proposal

### 1.4 人工审核审核“解释”，不是只审核“答案”

每个 proposal 必须给 reviewer 充分上下文：

- 结构位置
- 上下游关系
- 行为指标
- 外部标签命中
- 归因理由

---

## 2. v2 范围

### 2.1 本次范围

- mint 后早期分发图生成
- 地址簇生成
- evidence detector
- role proposal
- final label proposal
- proposal 审核
- 审核通过后写入生产标签

### 2.2 不在本次范围

- 自动训练
- 完整权限体系
- detector 并发调度
- 复杂 ML 排序

---

## 3. 总体流程

```text
startAnalysis
-> buildEarlyDistributionGraph
-> buildAddressClusters
-> runEvidenceDetectors
-> produceRoleProposals
-> produceFinalLabelProposals
-> review
-> write active labels
```

说明：

- run 仍然是一次 token + chain 级任务
- 中间产物不再只有 final label proposal
- 工作台必须能展示 graph、cluster、role、final label 四类结果

---

## 4. 核心对象

### 4.1 graph node

表示分发图中的一个地址节点。

建议字段：

- `address`
- `layer`
- `first_received_at`
- `incoming_amount`
- `incoming_tx_count`
- `parent_addresses`
- `outgoing_amount_in_behavior_window`
- `outgoing_tx_count_in_behavior_window`
- `unique_recipients_in_behavior_window`
- `current_balance`
- `wallet_label`
- `wallet_kind`
- `is_contract`

### 4.2 address cluster

表示一组高度相关地址。

建议字段：

- `cluster_id`
- `run_id`
- `token_id`
- `chain`
- `member_addresses_json`
- `root_addresses_json`
- `summary_json`
- `confidence`

`summary_json` 至少包含：

- 主层级分布
- 总接收量
- 总转出量
- 扇出规模
- 角色倾向

### 4.3 evidence

表示一个 detector 输出的一条结构化证据。

证据不等于标签。

建议字段：

- `target_type`
  - `address`
  - `cluster`
- `target_id`
- `evidence_type`
- `score`
- `summary`
- `payload_json`

### 4.4 role proposal

表示系统认为一个地址或地址簇更像某种角色。

候选角色建议先控制在：

- `vault_like`
- `distributor_like`
- `sink_like`
- `cex_like`
- `pool_like`
- `multisig_like`
- `contract_distributor_like`
- `claim_receiver_like`

### 4.5 final label proposal

表示系统结合 role + tokenomics 后，给出的最终业务标签建议。

候选标签建议先控制在：

- `team_vault`
- `investor_vault`
- `foundation_vault`
- `community_vault`
- `ecosystem_vault`
- `airdrop_vault`
- `cex_hot_wallet`
- `dex_pool`

---

## 5. 数据源

### 5.1 MySQL

已有可用表：

- `token_profiles`
- `token_address`
- `token_allocation`
- `token_unlocks`

主要用途：

- token 基础信息
- 各链 token address
- tokenomics 先验

### 5.2 BigQuery

已有可用表：

- `token_transfer_raw`
- `token_holder_snapshot`
- `wallet_info`

主要用途：

- mint 后早期分发路径
- 地址当前余额
- 地址外部标签和合约属性

---

## 6. 时间窗口定义

### 6.1 graph window

`preWindowDays`

含义：

- 从最早一笔 transfer 开始
- 在这个窗口内构建分发图
- 默认向下追 4 层

### 6.2 behavior window

`claimWindowDays`

含义：

- 用于观察 graph node 的短期后续行为
- 统计保留、扇出、转出、下游数量

约束：

- `claimWindowDays >= preWindowDays`

---

## 7. run 状态

继续保持简单：

- `running`
- `success`
- `failed`

说明：

- 不做 `partial`
- 如果 graph 构建失败或关键 detector 失败，整次 run 失败

---

## 8. proposal 状态

继续保持简单：

- `pending`
- `approved`
- `rejected`

说明：

- `reject + review_note` 代替 `needs_revision`

---

## 9. 新的中间产物表

## 9.1 `label_analysis_runs`

保留原思路，继续记录一次任务。

额外建议在 `source_summary_json` 里记录：

- `firstTransferAt`
- `graphWindowEnd`
- `behaviorWindowEnd`
- `rootAddress`
- `graphNodeCount`
- `graphLinkCount`
- `clusterCount`
- `roleProposalCount`
- `finalProposalCount`

## 9.2 `address_clusters`

建议新增：

```sql
CREATE TABLE address_clusters (
  cluster_id         VARCHAR(64) PRIMARY KEY,
  run_id             VARCHAR(64) NOT NULL,
  token_id           BIGINT NOT NULL,
  chain              VARCHAR(64) NOT NULL,
  member_addresses_json JSON NOT NULL,
  root_addresses_json   JSON NULL,
  summary_json         JSON NOT NULL,
  confidence         DECIMAL(6,4) NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_run (run_id),
  INDEX idx_token_chain (token_id, chain)
);
```

## 9.3 `address_label_evidence`

建议新增：

```sql
CREATE TABLE address_label_evidence (
  id                 VARCHAR(64) PRIMARY KEY,
  run_id             VARCHAR(64) NOT NULL,
  token_id           BIGINT NOT NULL,
  chain              VARCHAR(64) NOT NULL,
  target_type        ENUM('address', 'cluster') NOT NULL,
  target_id          VARCHAR(128) NOT NULL,
  detector           VARCHAR(64) NOT NULL,
  evidence_type      VARCHAR(64) NOT NULL,
  score              DECIMAL(6,4) NOT NULL,
  summary            TEXT NOT NULL,
  payload_json       JSON NOT NULL,
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_run_target (run_id, target_type, target_id),
  INDEX idx_detector (detector, evidence_type)
);
```

## 9.4 `address_label_proposals`

原表保留，但语义要扩展。

建议新增字段：

- `proposal_type`
  - `role`
  - `final_label`
- `target_type`
  - `address`
  - `cluster`
- `target_id`
- `supporting_evidence_ids_json`

这样一来：

- role proposal 和 final label proposal 可以共用一张表
- reviewer 可以追到它依赖了哪些 evidence

## 9.5 `address_labels`

生产表可以先继续保存最终业务标签。

如果后面 role 也有下游价值，再新增单独的 `address_roles` 生产表。

---

## 10. detector 分层

### 10.1 graph detector

负责构建 mint 后早期分发图。

输入：

- token address
- chain
- graph window
- depth = 4

输出：

- nodes
- links
- root address

### 10.2 cluster detector

负责把 graph 中高度相关的地址收成 cluster。

初版可以先用简单规则：

- 同层互转密集
- 共同上游
- 共同下游
- 行为特征接近

### 10.3 evidence detector

不要直接产出最终标签，先产出证据。

建议首批 evidence：

- `received_from_mint_path`
- `high_retention_after_tge`
- `high_fanout_distribution`
- `cex_sink_pattern`
- `pool_pattern`
- `multisig_pattern`
- `contract_distributor_pattern`
- `shared_controller_pattern`

### 10.4 role attribution

根据 evidence 推导角色。

示例：

- `received_from_mint_path + high_retention + low_fanout + multisig_pattern`
  -> `vault_like`
- `received_from_mint_path + high_fanout_distribution + contract_distributor_pattern`
  -> `distributor_like`
- `cex_sink_pattern`
  -> `cex_like`

### 10.5 final label attribution

根据：

- role proposal
- cluster
- tokenomics allocation
- token unlock context

共同收敛出最终业务标签。

示例：

- `vault_like + category team/core contributors`
  -> `team_vault`
- `vault_like + category investors/advisors`
  -> `investor_vault`
- `distributor_like + category airdrop/community`
  -> `airdrop_vault` 或 `community_vault`

---

## 11. 审核规则

### 11.1 审核对象

审核页必须能区分：

- role proposal
- final label proposal

建议先审核 role，再审核 final label。

### 11.2 审核展示信息

每条 proposal 至少展示：

- target 是 address 还是 cluster
- 所在层级
- 上游 / 下游摘要
- 当前余额
- 行为窗口指标
- 命中的外部标签
- supporting evidence
- why-like
- why-not-like

### 11.3 审核通过后的入库

只有 `proposal_type = final_label` 且审核通过，才写入 `address_labels`。

`proposal_type = role` 的审核通过，先只保留在 proposal/evidence 体系中，不直接进入生产表。

---

## 12. API 设计调整

现有接口：

- `startAnalysis`
- `listRuns`
- `getRun`
- `getReviewQueue`
- `reviewProposal`
- `getActiveLabels`

建议新增：

- `getDistributionGraph(runId)`
- `listClusters(runId)`
- `listEvidence(runId, targetType, targetId)`
- `getRoleQueue(runId)`
- `getFinalLabelQueue(runId)`

说明：

- `getReviewQueue` 未来最好拆成 role 和 final label 两个队列

---

## 13. 工作台页面调整

建议顶部工作台分 4 个区域：

### 13.1 分发图

展示：

- root
- 4 层主要节点
- layer summary

### 13.2 地址簇

展示：

- cluster 成员
- cluster 摘要
- cluster 角色倾向

### 13.3 角色候选

展示：

- `vault_like / distributor_like / sink_like ...`
- supporting evidence

### 13.4 最终标签候选

展示：

- `team_vault / investor_vault / ...`
- role -> final label 的推理链路

### 13.5 生产标签

展示：

- 已审核通过并生效的最终标签

---

## 14. 代码实现建议

### 14.1 服务拆分

建议把 `labelWorkbench.ts` 逐步拆成：

- `distributionGraph.ts`
- `clusterBuilder.ts`
- `evidenceDetectors.ts`
- `roleAttribution.ts`
- `finalLabelAttribution.ts`
- `labelReviewService.ts`

### 14.2 命名建议

当前的 `generateTokenomicsMatchProposals` 已经不适合继续保留原名。

建议拆成：

- `buildEarlyDistributionGraph`
- `buildClustersFromGraph`
- `generateRoleProposals`
- `generateFinalLabelProposals`

### 14.3 detector 约束

detector 统一接口建议为：

```ts
type EvidenceDetector = {
  key: string;
  run(ctx: DetectorContext): Promise<EvidenceRecord[]>;
};
```

role attribution 建议独立成纯函数：

```ts
type RoleAttributor = (input: {
  target: AddressOrCluster;
  evidence: EvidenceRecord[];
  tokenomics: TokenomicsContext | null;
}) => RoleProposal[];
```

---

## 15. 务实落地顺序

### Phase 1

把“4 层早期分发图”跑稳定。

验收：

- 能看到 root、layer、主要节点和关键指标

### Phase 2

做 role proposal，不做 final label。

验收：

- 能稳定产出 `vault_like / distributor_like / sink_like`

### Phase 3

做 cluster。

验收：

- 审核对象不再只是一堆离散地址

### Phase 4

再做 final label attribution。

验收：

- `team_vault / investor_vault / ...` 的建议有明确角色与证据支撑

---

## 16. 一句话总结

这版实施方向不是“把标签猜得更激进”，而是：

**先把 mint 后早期分发结构、地址角色和证据体系做扎实，再让最终业务标签成为一个收敛结果。**
