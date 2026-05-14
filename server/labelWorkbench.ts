import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  addressLabelProposals,
  addressLabels,
  labelAnalysisRuns,
  type AddressLabelProposal,
  type AddressLabel,
  type LabelAnalysisRun,
} from "../drizzle/schema";
import { getFeatureDb } from "./featureDb";
import {
  getOnchainEarlyDistributionBySymbol,
  getTokenProfileBySymbol,
  getTokenUnlockViewBySymbol,
} from "./liveData";

type RunStatus = "running" | "success" | "failed";
type ProposalStatus = "pending" | "approved" | "rejected";
type LabelStage = "bootstrap" | "downstream" | "behavior" | "sink" | "cluster";

type LabelDefinition = {
  key: string;
  displayName: string;
  stage: LabelStage;
  detector: string;
  description: string;
  rule: string;
  conflictsWith: string[];
};

type StartAnalysisInput = {
  symbol: string;
  chain: string;
  preWindowDays: number;
  claimWindowDays: number;
  tolerancePct: number;
  triggeredBy: string;
};

function mapChainNameToId(chain: string): number | null {
  const normalized = chain.trim().toLowerCase();
  if (["bsc", "bnb", "binance", "binance smart chain"].includes(normalized)) return 56;
  if (["eth", "ethereum"].includes(normalized)) return 1;
  if (["base"].includes(normalized)) return 8453;
  return null;
}

const LABEL_DEFINITIONS: LabelDefinition[] = [
  {
    key: "team_vault",
    displayName: "团队金库",
    stage: "bootstrap",
    detector: "initial_distribution_match",
    description: "Mint 早期分发路径里承接团队份额的核心地址。",
    rule: "基于 token_allocation 比例，结合 mint 后 4 层内早期分发金额与短期分发行为匹配。",
    conflictsWith: ["dex_pool", "cex_hot_wallet", "burn_address"],
  },
  {
    key: "investor_vault",
    displayName: "投资人金库",
    stage: "bootstrap",
    detector: "initial_distribution_match",
    description: "Mint 早期分发路径里接收投资人份额的地址。",
    rule: "基于 allocation.investors 比例，结合 mint 后 4 层内早期分发金额与短期分发行为匹配。",
    conflictsWith: ["dex_pool", "cex_hot_wallet"],
  },
  {
    key: "foundation_vault",
    displayName: "基金会金库",
    stage: "bootstrap",
    detector: "initial_distribution_match",
    description: "Mint 早期分发路径里的基金会运营或治理主金库。",
    rule: "基于 allocation.foundation 比例，结合 mint 后 4 层内早期分发金额与短期分发行为匹配。",
    conflictsWith: ["dex_pool"],
  },
  {
    key: "community_vault",
    displayName: "社区金库",
    stage: "bootstrap",
    detector: "initial_distribution_match",
    description: "Mint 早期分发路径里的社区分配或活动金库。",
    rule: "基于 allocation.community 比例，结合 mint 后 4 层内早期分发金额与短期分发行为匹配。",
    conflictsWith: ["dex_pool", "cex_hot_wallet"],
  },
  {
    key: "ecosystem_vault",
    displayName: "生态金库",
    stage: "bootstrap",
    detector: "initial_distribution_match",
    description: "Mint 早期分发路径里的生态建设、激励或 grant 金库。",
    rule: "基于 allocation.ecosystem 比例，结合 mint 后 4 层内早期分发金额与短期分发行为匹配。",
    conflictsWith: ["dex_pool", "cex_hot_wallet"],
  },
  {
    key: "airdrop_vault",
    displayName: "空投金库",
    stage: "bootstrap",
    detector: "initial_distribution_match",
    description: "Mint 早期分发路径里的空投或 claim 资金准备地址。",
    rule: "基于 allocation.airdrop 比例，结合 mint 后 4 层内早期分发金额与短期分发行为匹配。",
    conflictsWith: ["dex_pool", "cex_hot_wallet"],
  },
  {
    key: "cex_hot_wallet",
    displayName: "CEX 热钱包",
    stage: "sink",
    detector: "cex_pattern",
    description: "中心化交易所自营归集或分发热钱包。",
    rule: "命中已知交易所标签，且链上表现为高频归集。",
    conflictsWith: ["team_vault", "investor_vault", "team_personal"],
  },
  {
    key: "dex_pool",
    displayName: "DEX LP 池",
    stage: "sink",
    detector: "dex_pattern",
    description: "DEX 的流动性池合约地址。",
    rule: "命中池子标签且呈现双边换入换出行为。",
    conflictsWith: ["team_vault", "investor_vault", "foundation_vault"],
  },
];

const CATEGORY_TO_LABEL: Record<string, string> = {
  team: "team_vault",
  investors: "investor_vault",
  investor: "investor_vault",
  foundation: "foundation_vault",
  community: "community_vault",
  ecosystem: "ecosystem_vault",
  airdrop: "airdrop_vault",
};

function normalizeAllocationCategoryKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapCategoryToLabel(rawCategory: string) {
  const normalized = normalizeAllocationCategoryKey(rawCategory);

  if (CATEGORY_TO_LABEL[normalized]) {
    return CATEGORY_TO_LABEL[normalized];
  }

  if (
    normalized.includes("core contributor") ||
    normalized.includes("contributors") ||
    normalized.includes("team")
  ) {
    return "team_vault";
  }

  if (
    normalized.includes("investor") ||
    normalized.includes("advisor") ||
    normalized.includes("advisors")
  ) {
    return "investor_vault";
  }

  if (normalized.includes("foundation")) {
    return "foundation_vault";
  }

  if (normalized.includes("community")) {
    return "community_vault";
  }

  if (
    normalized.includes("ecosystem") ||
    normalized.includes("staking reward") ||
    normalized.includes("reward")
  ) {
    return "ecosystem_vault";
  }

  if (normalized.includes("airdrop")) {
    return "airdrop_vault";
  }

  if (
    normalized.includes("liquidity") ||
    normalized.includes("launch") ||
    normalized.includes("market making")
  ) {
    return "community_vault";
  }

  return null;
}

function normalizeAddress(address: string) {
  return address.trim().toLowerCase();
}

function parseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatTimestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return value;
}

function getLabelDefinition(label: string) {
  return LABEL_DEFINITIONS.find(item => item.key === label) ?? null;
}

function detectChainAddress(profile: Awaited<ReturnType<typeof getTokenProfileBySymbol>>, chain: string) {
  if (!profile) return null;
  const normalizedChain = chain.trim().toLowerCase();
  return (
    profile.addresses.find(item => item.chainName.toLowerCase().includes(normalizedChain)) ??
    null
  );
}

function scoreHolderKind(kind: string, label: string) {
  const text = `${kind} ${label}`.toLowerCase();
  if (
    text.includes("binance") ||
    text.includes("okx") ||
    text.includes("bybit") ||
    text.includes("coinbase") ||
    text.includes("kraken") ||
    text.includes("gate") ||
    text.includes("kucoin") ||
    text.includes("bitget") ||
    text.includes("exchange")
  ) {
    return -100;
  }
  if (
    text.includes("router") ||
    text.includes("pool") ||
    text.includes("pair") ||
    text.includes("lp") ||
    text.includes("bridge") ||
    text.includes("burn") ||
    text.includes("dead")
  ) {
    return -80;
  }
  if (text.includes("safe") || text.includes("multisig")) return 20;
  if (text.includes("contract")) return 8;
  return 0;
}

function scoreDistributionBehavior(input: {
  labelKey: string;
  layer: number;
  incomingAmount: number;
  currentBalance: number | null;
  uniqueRecipientsInBehaviorWindow: number;
  outgoingAmountInBehaviorWindow: number;
}) {
  const retainedRatio =
    input.currentBalance != null && input.incomingAmount > 0
      ? Math.max(0, Math.min(input.currentBalance / input.incomingAmount, 3))
      : null;
  const fanout = input.uniqueRecipientsInBehaviorWindow;
  let score = 0;

  score -= Math.max(input.layer - 1, 0) * 1.6;

  if (["team_vault", "investor_vault", "foundation_vault", "ecosystem_vault"].includes(input.labelKey)) {
    if (fanout <= 2) score += 2.4;
    else if (fanout <= 5) score += 1.2;
    else score -= Math.min(fanout - 5, 8) * 0.5;

    if (retainedRatio != null) {
      if (retainedRatio >= 0.7) score += 2.2;
      else if (retainedRatio >= 0.4) score += 1.1;
      else score -= 1.2;
    }
  }

  if (["community_vault", "airdrop_vault"].includes(input.labelKey)) {
    if (fanout >= 8) score += 2.3;
    else if (fanout >= 4) score += 1.1;

    if (retainedRatio != null) {
      if (retainedRatio <= 0.35) score += 1.2;
      else if (retainedRatio >= 0.8) score -= 0.8;
    }

    if (input.outgoingAmountInBehaviorWindow > input.incomingAmount * 0.3) {
      score += 1;
    }
  }

  return {
    score,
    retainedRatio,
  };
}

function buildRunSummary(run: LabelAnalysisRun) {
  const config = parseJsonObject<{
    preWindowDays?: number;
    claimWindowDays?: number;
    tolerancePct?: number;
  }>(run.configJson, {});

  return {
    runId: run.runId,
    tokenId: run.tokenId,
    chain: run.chain,
    symbol: run.symbol,
    triggeredBy: run.triggeredBy,
    status: run.status,
    proposalCount: run.proposalCount,
    approvedCount: run.approvedCount,
    rejectedCount: run.rejectedCount,
    pendingCount: Math.max(run.proposalCount - run.approvedCount - run.rejectedCount, 0),
    startedAt: formatTimestamp(run.startedAt),
    finishedAt: formatTimestamp(run.finishedAt),
    config,
    sourceSummary: parseJsonObject(run.sourceSummaryJson, null),
  };
}

function buildProposalRecord(proposal: AddressLabelProposal) {
  return {
    id: proposal.id,
    address: proposal.address,
    proposedLabel: proposal.proposedLabel,
    displayName: getLabelDefinition(proposal.proposedLabel)?.displayName ?? proposal.proposedLabel,
    stage: proposal.stage,
    detector: proposal.detector,
    confidence: Number(proposal.confidence),
    reasonSummary: proposal.reasonSummary,
    evidence: parseJsonObject<string[]>(proposal.evidenceJson, []),
    subtype: proposal.reviewSubtype ?? proposal.proposedSubtype ?? undefined,
    tags:
      parseJsonArray(proposal.reviewTagsJson).length > 0
        ? parseJsonArray(proposal.reviewTagsJson)
        : parseJsonArray(proposal.proposedTagsJson),
    status: proposal.reviewStatus,
    reviewNote: proposal.reviewNote ?? undefined,
  };
}

async function refreshRunCounts(
  executor: any,
  runId: string
) {
  const proposals = await executor
    .select({
      reviewStatus: addressLabelProposals.reviewStatus,
    })
    .from(addressLabelProposals)
    .where(eq(addressLabelProposals.runId, runId));

  const approvedCount = proposals.filter((item: { reviewStatus: ProposalStatus }) => item.reviewStatus === "approved").length;
  const rejectedCount = proposals.filter((item: { reviewStatus: ProposalStatus }) => item.reviewStatus === "rejected").length;

  await executor
    .update(labelAnalysisRuns)
    .set({
      approvedCount,
      rejectedCount,
      updatedAt: new Date(),
    })
    .where(eq(labelAnalysisRuns.runId, runId));
}

async function generateTokenomicsMatchProposals(input: {
  symbol: string;
  chain: string;
  preWindowDays: number;
  claimWindowDays: number;
  tolerancePct: number;
}) {
  const profile = await getTokenProfileBySymbol(input.symbol);
  if (!profile) {
    throw new Error(`Token ${input.symbol.toUpperCase()} not found in token_profiles`);
  }

  const chainAddress = detectChainAddress(profile, input.chain);
  if (!chainAddress) {
    throw new Error(`${input.symbol.toUpperCase()} has no token address on chain ${input.chain}`);
  }

  const unlockView = await getTokenUnlockViewBySymbol(input.symbol);
  const distribution = await getOnchainEarlyDistributionBySymbol(input.symbol, {
    depth: 4,
    preWindowDays: input.preWindowDays,
    claimWindowDays: input.claimWindowDays,
    limitPerLayer: 120,
    chainId: mapChainNameToId(input.chain) ?? undefined,
  });

  const totalDistributionAmount = distribution?.totalMintedAmount ?? 0;
  if (!distribution || totalDistributionAmount <= 0) {
    return {
      tokenId: profile.tokenId,
      sourceSummary: {
        tokenAddress: chainAddress.address,
        chainName: chainAddress.chainName,
        categories: unlockView?.categories ?? [],
        firstTransferAt: distribution?.firstTransferAt ?? null,
        graphWindowEnd: distribution?.graphWindowEnd ?? null,
        behaviorWindowEnd: distribution?.behaviorWindowEnd ?? null,
        rootAddress: distribution?.rootAddress ?? null,
        graphNodeCount: distribution?.nodes.length ?? 0,
      },
      proposals: [],
    };
  }

  const categoryRows: Array<{
    rawKey: string;
    normalizedKey: string;
    mappedLabel: string;
    ratio: number;
  }> =
    unlockView?.categories
      .map(item => ({
        rawKey: item.key,
        normalizedKey: normalizeAllocationCategoryKey(item.key),
        mappedLabel: mapCategoryToLabel(item.key),
        ratio: Number(item.ratio ?? 0),
      }))
      .filter((item): item is { rawKey: string; normalizedKey: string; mappedLabel: string; ratio: number } => item.ratio > 0 && Boolean(item.mappedLabel))
      .sort((left, right) => right.ratio - left.ratio) ?? [];

  const usedAddresses = new Set<string>();
  const proposals = [];

  for (const category of categoryRows) {
    const labelKey = category.mappedLabel;
    const labelDef = getLabelDefinition(labelKey);
    if (!labelDef) continue;

    const candidates = distribution.nodes
      .filter(node => !usedAddresses.has(node.address))
      .map(node => {
        const distributionPct = (node.incomingAmount / totalDistributionAmount) * 100;
        const diffPct = Math.abs(distributionPct - category.ratio);
        const kindScore = scoreHolderKind(node.kind, node.label);
        const behavior = scoreDistributionBehavior({
          labelKey,
          layer: node.layer,
          incomingAmount: node.incomingAmount,
          currentBalance: node.currentBalance,
          uniqueRecipientsInBehaviorWindow: node.uniqueRecipientsInBehaviorWindow,
          outgoingAmountInBehaviorWindow: node.outgoingAmountInBehaviorWindow,
        });
        return {
          node,
          distributionPct,
          diffPct,
          kindScore,
          behaviorScore: behavior.score,
          retainedRatio: behavior.retainedRatio,
          score: diffPct - kindScore * 0.05 - behavior.score,
        };
      })
      .filter(item => item.kindScore > -50)
      .sort((left, right) => left.score - right.score);

    const best = candidates[0];
    if (!best) continue;

    const relaxedTolerance = Math.max(input.tolerancePct, 8);
    const absoluteMaxTolerance = category.ratio >= 20 ? 14 : 10;
    if (best.diffPct > absoluteMaxTolerance) continue;

    usedAddresses.add(best.node.address);
    const confidence = Math.max(
      0.42,
      Math.min(
        0.96,
        0.88 -
          best.diffPct * 0.04 +
          Math.max(best.kindScore, 0) * 0.003 +
          best.behaviorScore * 0.03 +
          (best.diffPct <= relaxedTolerance ? 0.04 : 0)
      )
    );

    proposals.push({
      id: nanoid(16),
      tokenId: profile.tokenId,
      chain: input.chain,
      address: normalizeAddress(best.node.address),
      proposedLabel: labelKey,
      proposedSubtype: best.node.isContract ? "contract" : "eoa",
      proposedTagsJson: JSON.stringify([category.normalizedKey, `layer_${best.node.layer}`, "mint-distribution"]),
      confidence: confidence.toFixed(4),
      detector: labelDef.detector,
      stage: labelDef.stage,
      reasonSummary: `${category.rawKey} 分配占比约 ${category.ratio.toFixed(2)}%，该地址在 mint 后早期 4 层分发树内累计接收 ${best.distributionPct.toFixed(2)}%，位于第 ${best.node.layer} 层，是当前最接近的候选地址。`,
      evidenceJson: JSON.stringify([
        `来源链地址: ${chainAddress.address.toLowerCase()} (${chainAddress.chainName})`,
        `mint 首次转账时间: ${distribution.firstTransferAt ?? "—"}`,
        `分发图窗口: ${distribution.graphWindowEnd ?? "—"}，行为观察窗口: ${distribution.behaviorWindowEnd ?? "—"}`,
        `mint 根地址: ${distribution.rootAddress ?? "—"}`,
        `分配类别: ${category.rawKey}，目标占比 ${category.ratio.toFixed(2)}%`,
        `候选地址在分发树第 ${best.node.layer} 层，累计接收 ${best.distributionPct.toFixed(2)}%，差值 ${best.diffPct.toFixed(2)}%`,
        `候选地址行为: ${best.node.uniqueRecipientsInBehaviorWindow} 个下游接收方，行为窗口转出 ${best.node.outgoingAmountInBehaviorWindow}`,
        `链上标签: ${best.node.label} / ${best.node.kind}`,
        `当前余额: ${best.node.currentBalance ?? 0}，保留比例 ${best.retainedRatio != null ? best.retainedRatio.toFixed(2) : "—"}`,
        `父节点: ${best.node.parentAddresses.slice(0, 5).join(", ") || "—"}`,
        `类别归一化: ${category.normalizedKey} -> ${labelKey}`,
      ]),
      reviewStatus: "pending" as const,
    });
  }

  return {
    tokenId: profile.tokenId,
    sourceSummary: {
      tokenAddress: chainAddress.address.toLowerCase(),
      chainName: chainAddress.chainName,
      categories: unlockView?.categories ?? [],
      firstTransferAt: distribution.firstTransferAt,
      graphWindowEnd: distribution.graphWindowEnd,
      behaviorWindowEnd: distribution.behaviorWindowEnd,
      rootAddress: distribution.rootAddress,
      graphNodeCount: distribution.nodes.length,
      graphLinkCount: distribution.links.length,
      totalDistributionAmount,
      matchedCount: proposals.length,
    },
    proposals,
  };
}

export function listLabelDefinitions() {
  return LABEL_DEFINITIONS;
}

export async function listLabelRuns() {
  const db = getFeatureDb();
  const rows = await db.select().from(labelAnalysisRuns).orderBy(desc(labelAnalysisRuns.startedAt));
  return rows.map(buildRunSummary);
}

export async function getLabelRun(runId: string) {
  const db = getFeatureDb();
  const runRow = await db.select().from(labelAnalysisRuns).where(eq(labelAnalysisRuns.runId, runId)).limit(1);
  const run = runRow[0];
  if (!run) return null;

  const proposalRows = await db
    .select()
    .from(addressLabelProposals)
    .where(eq(addressLabelProposals.runId, runId))
    .orderBy(addressLabelProposals.stage, desc(addressLabelProposals.confidence), desc(addressLabelProposals.createdAt));

  const proposalsByStage = (["bootstrap", "downstream", "behavior", "sink", "cluster"] as LabelStage[]).map(stage => {
    const items = proposalRows.filter((item: AddressLabelProposal) => item.stage === stage);
    return {
      stage,
      total: items.length,
      pending: items.filter((item: AddressLabelProposal) => item.reviewStatus === "pending").length,
      approved: items.filter((item: AddressLabelProposal) => item.reviewStatus === "approved").length,
      rejected: items.filter((item: AddressLabelProposal) => item.reviewStatus === "rejected").length,
    };
  });

  return {
    run: {
      ...buildRunSummary(run),
      proposals: proposalRows.map(buildProposalRecord),
    },
    proposalsByStage,
  };
}

export async function getReviewQueue(runId: string, status: ProposalStatus, keyword?: string) {
  const db = getFeatureDb();
  const run = await db.select().from(labelAnalysisRuns).where(eq(labelAnalysisRuns.runId, runId)).limit(1);
  if (!run[0]) return null;

  const proposalRows = await db
    .select()
    .from(addressLabelProposals)
    .where(and(eq(addressLabelProposals.runId, runId), eq(addressLabelProposals.reviewStatus, status)))
    .orderBy(addressLabelProposals.stage, desc(addressLabelProposals.confidence), desc(addressLabelProposals.createdAt));

  const normalizedKeyword = keyword?.trim().toLowerCase() ?? "";
  const items = proposalRows
    .map(buildProposalRecord)
    .filter((item: ReturnType<typeof buildProposalRecord>) => {
      if (!normalizedKeyword) return true;
      return (
        item.address.toLowerCase().includes(normalizedKeyword) ||
        item.proposedLabel.toLowerCase().includes(normalizedKeyword) ||
        item.reasonSummary.toLowerCase().includes(normalizedKeyword)
      );
    });

  return {
    items,
    progress: {
      reviewed: run[0].approvedCount + run[0].rejectedCount,
      total: run[0].proposalCount,
    },
  };
}

export async function getActiveLabels(input: { tokenId: number; chain?: string }) {
  const db = getFeatureDb();
  const filters = [eq(addressLabels.tokenId, input.tokenId), eq(addressLabels.isActive, true)];
  if (input.chain?.trim()) {
    filters.push(eq(addressLabels.chain, input.chain.trim()));
  }

  const rows = await db
    .select()
    .from(addressLabels)
    .where(and(...filters))
    .orderBy(addressLabels.chain, addressLabels.label, desc(addressLabels.approvedAt));

  return rows.map((row: AddressLabel) => ({
    id: row.id,
    tokenId: row.tokenId,
    chain: row.chain,
    address: row.address,
    label: row.label,
    displayName: getLabelDefinition(row.label)?.displayName ?? row.label,
    subtype: row.subtype ?? null,
    tags: parseJsonArray(row.tagsJson),
    confidence: Number(row.confidence),
    approvedBy: row.approvedBy,
    approvedAt: formatTimestamp(row.approvedAt),
    sourceProposalId: row.sourceProposalId,
  }));
}

export async function startLabelAnalysis(input: StartAnalysisInput) {
  const db = getFeatureDb();
  const runId = `lba_${input.symbol.trim().toLowerCase()}_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const startedAt = new Date();

  await db.insert(labelAnalysisRuns).values({
    runId,
    tokenId: 0,
    chain: input.chain,
    symbol: input.symbol.trim().toUpperCase(),
    triggeredBy: input.triggeredBy,
    status: "running",
    proposalCount: 0,
    approvedCount: 0,
    rejectedCount: 0,
    configJson: JSON.stringify({
      preWindowDays: input.preWindowDays,
      claimWindowDays: input.claimWindowDays,
      tolerancePct: input.tolerancePct,
    }),
    startedAt,
  });

  try {
    const generated = await generateTokenomicsMatchProposals({
      symbol: input.symbol,
      chain: input.chain,
      preWindowDays: input.preWindowDays,
      claimWindowDays: input.claimWindowDays,
      tolerancePct: input.tolerancePct,
    });

    await db
      .update(labelAnalysisRuns)
      .set({
        tokenId: generated.tokenId,
        sourceSummaryJson: JSON.stringify(generated.sourceSummary),
      })
      .where(eq(labelAnalysisRuns.runId, runId));

    if (generated.proposals.length > 0) {
      await db.insert(addressLabelProposals).values(
        generated.proposals.map(proposal => ({
          ...proposal,
          runId,
          createdAt: new Date(),
          updatedAt: new Date(),
        }))
      );
    }

    await db
      .update(labelAnalysisRuns)
      .set({
        tokenId: generated.tokenId,
        status: "success",
        proposalCount: generated.proposals.length,
        sourceSummaryJson: JSON.stringify(generated.sourceSummary),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(labelAnalysisRuns.runId, runId));

    const run = await db.select().from(labelAnalysisRuns).where(eq(labelAnalysisRuns.runId, runId)).limit(1);
    return {
      runId,
      run: buildRunSummary(run[0]),
    };
  } catch (error) {
    await db
      .update(labelAnalysisRuns)
      .set({
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        finishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(labelAnalysisRuns.runId, runId));
    throw error;
  }
}

export async function reviewLabelProposal(input: {
  proposalId: string;
  action: "approve" | "reject";
  reviewNote?: string;
  reviewer?: string;
}) {
  const db = getFeatureDb();

  return db.transaction(async (tx: any) => {
    const proposalRows = await tx
      .select()
      .from(addressLabelProposals)
      .where(eq(addressLabelProposals.id, input.proposalId))
      .limit(1);

    const proposal = proposalRows[0];
    if (!proposal) {
      throw new Error("Proposal not found");
    }
    if (proposal.reviewStatus !== "pending") {
      throw new Error("Proposal has already been reviewed");
    }

    const reviewer = input.reviewer ?? "current-user";
    const reviewedAt = new Date();

    if (input.action === "approve") {
      const activeRows = await tx
        .select()
        .from(addressLabels)
        .where(
          and(
            eq(addressLabels.tokenId, proposal.tokenId),
            eq(addressLabels.chain, proposal.chain),
            eq(addressLabels.address, proposal.address),
            eq(addressLabels.label, proposal.proposedLabel),
            eq(addressLabels.isActive, true)
          )
        );

      if (activeRows.length > 0) {
        await tx
          .update(addressLabels)
          .set({
            isActive: false,
            updatedAt: reviewedAt,
          })
          .where(
            and(
              eq(addressLabels.tokenId, proposal.tokenId),
              eq(addressLabels.chain, proposal.chain),
              eq(addressLabels.address, proposal.address),
              eq(addressLabels.label, proposal.proposedLabel),
              eq(addressLabels.isActive, true)
            )
          );
      }

      const labelId = nanoid(16);
      await tx.insert(addressLabels).values({
        id: labelId,
        tokenId: proposal.tokenId,
        chain: proposal.chain,
        address: proposal.address,
        label: proposal.proposedLabel,
        subtype: proposal.reviewSubtype ?? proposal.proposedSubtype ?? null,
        tagsJson:
          proposal.reviewTagsJson ??
          proposal.proposedTagsJson ??
          JSON.stringify([]),
        confidence: proposal.confidence,
        sourceProposalId: proposal.id,
        approvedBy: reviewer,
        approvedAt: reviewedAt,
        supersededBy: null,
        isActive: true,
      });

      if (activeRows.length > 0) {
        await tx
          .update(addressLabels)
          .set({
            supersededBy: labelId,
            updatedAt: reviewedAt,
          })
          .where(
            and(
              eq(addressLabels.tokenId, proposal.tokenId),
              eq(addressLabels.chain, proposal.chain),
              eq(addressLabels.address, proposal.address),
              eq(addressLabels.label, proposal.proposedLabel),
              eq(addressLabels.isActive, false)
            )
          );
      }
    }

    await tx
      .update(addressLabelProposals)
      .set({
        reviewStatus: input.action === "approve" ? "approved" : "rejected",
        reviewer,
        reviewedAt,
        reviewNote: input.reviewNote ?? null,
        updatedAt: reviewedAt,
      })
      .where(eq(addressLabelProposals.id, input.proposalId));

    await refreshRunCounts(tx, proposal.runId);

    const updatedProposal = await tx
      .select()
      .from(addressLabelProposals)
      .where(eq(addressLabelProposals.id, input.proposalId))
      .limit(1);

    return {
      proposal: buildProposalRecord(updatedProposal[0]),
      runId: proposal.runId,
    };
  });
}
