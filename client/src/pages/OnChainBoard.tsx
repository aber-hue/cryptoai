import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Copy, Droplets, Expand, RefreshCw, Search, TrendingDown, TrendingUp, X } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TrendPoint = {
  date: string;
  shortDate: string;
  controlRate: number;
  holderCount: number;
  exchangeNetFlow: number;
  netFlowRatio: number;
  dexAccIdx: number;
  whaleNetOutflow: number;
  depthSkew: number;
};

type TopChangeRow = {
  address: string;
  label: string;
  changeBalance: number;
  currentBalance?: number;
  firstSeen?: string;
  href: string;
};

type TagNetChange = {
  label: string;
  value: number;
};

type Snapshot = {
  tokenName: string;
  tokenSymbol: string;
  priceUsd: number;
  priceChange24h: number;
  totalSupply: number;
  circulatingSupply: number;
  marketCap: number;
  fdv: number;
  holderCount: number;
  holderCountChange1d: number;
  controlRate: number;
  controlRateChange1d: number;
  top10Ratio: number;
  top50Ratio: number;
  top100Ratio: number;
  othersRatio: number;
  explicitControl: number;
  implicitControl: number;
  indirectControl: number;
  controlBalanceTotal: number;
  top10Balance: number;
  top50Balance: number;
  top100Balance: number;
  exchangeInflow: number;
  exchangeOutflow: number;
  exchangeNetFlow: number;
  netFlowRatio: number;
  netFlowStreak: number;
  exchangeCoverageCount: number;
  totalBuyVolume: number;
  totalSellVolume: number;
  buyAddressCount: number;
  sellAddressCount: number;
  top5BuyVolume: number;
  top5SellVolume: number;
  buyConcentration: number;
  sellConcentration: number;
  dexAccIdx: number;
  whaleAddressCount: number;
  whaleTotalBalance: number;
  whaleTotalOutflow: number;
  whaleTotalInflow: number;
  whaleNetOutflow: number;
  whaleToExchange: number;
  whaleToNewAddress: number;
  whaleToDexRouter: number;
  whaleInternalTransfer: number;
  whaleOutRatio: number;
  tagNetChanges: TagNetChange[];
  increaseRows: TopChangeRow[];
  decreaseRows: TopChangeRow[];
};

type TokenDashboard = {
  symbol: string;
  logo: string;
  name: string;
  dates: Record<string, Snapshot>;
  trend90d: TrendPoint[];
};

type FlowNode = {
  id: string;
  layer: number;
  address: string;
  label: string;
  amount: number;
  currentBalance?: number | null;
  kind: string;
  outgoingCount: number;
};

type FlowLink = {
  source: string;
  target: string;
  amount: number;
};

type FlowLayerSummary = {
  layer: number;
  title: string;
  count: number;
  totalAmount: number;
};

type FlowGraph = {
  nodes: FlowNode[];
  links: FlowLink[];
  summaries: FlowLayerSummary[];
  totalAmount: number;
};

type LargeTransferGraphNode = {
  id: string;
  address: string;
  label: string;
  kind: string;
  amount: number;
  transferCount: number;
};

type LargeTransferGraphLink = {
  id: string;
  source: string;
  target: string;
  amount: number;
  ratioOfSupply: number | null;
  latestBlockTime: string | null;
  transferCount: number;
};

type LargeTransferGraph = {
  nodes: LargeTransferGraphNode[];
  links: LargeTransferGraphLink[];
  totalAmount: number;
};

type LargeTransferBilateralNode = {
  id: string;
  address: string;
  label: string;
  kind: string;
  amount: number;
  transferCount: number;
  column: 0 | 1 | 2 | 3 | 4;
};

type LargeTransferBilateralLink = LargeTransferGraphLink;

type LargeTransferBilateralGraph = {
  centerIds: string[];
  nodes: LargeTransferBilateralNode[];
  links: LargeTransferBilateralLink[];
  totalAmount: number;
};

type LargeTransferRecord = {
  txhash: string;
  logIndex: number | null;
  blockTime: string | null;
  fromAddress: string;
  toAddress: string;
  fromLabel: string;
  toLabel: string;
  fromKind: string;
  toKind: string;
  amount: number | null;
  ratioOfSupply: number | null;
  value?: number | null;
};

type LargeTransferScope = "all" | "initial" | "dex" | "cex";

type ForceTransferNode = LargeTransferGraphNode &
  SimulationNodeDatum & {
    x: number;
    y: number;
    fx?: number | null;
    fy?: number | null;
  };

type ForceTransferLink = LargeTransferGraphLink &
  SimulationLinkDatum<ForceTransferNode> & {
    source: string;
    target: string;
  };

type OnchainTokenOption = {
  symbol: string;
  name: string;
  tokenId: number;
  chainId: number | null;
  transferCount: number;
  holderCount: number;
  dexActionCount?: number;
};

type OnchainChainOption = {
  id: number;
  label: string;
};


const ACCUMULATION_POSITIVE = "#2563EB";
const DISTRIBUTION_NEGATIVE = "#F59E0B";
const RISE_RED = "#EF4444";
const FALL_GREEN = "#10B981";
const DEEP_BLUE = "#1E40AF";
const SLATE = "#64748B";

const ONCHAIN_CHAIN_OPTIONS: OnchainChainOption[] = [
  { id: 56, label: "BSC" },
  { id: 1, label: "Ethereum" },
  { id: 8453, label: "Base" },
];

const fallbackOnchainTokenOptions: OnchainTokenOption[] = [
  { symbol: "GENIUS", name: "Genius", tokenId: 1522, chainId: 56, transferCount: 65341, holderCount: 4181, dexActionCount: 0 },
  { symbol: "ST", name: "Sentio", tokenId: 1248, chainId: 56, transferCount: 63339, holderCount: 548, dexActionCount: 0 },
  { symbol: "BSB", name: "Block Street", tokenId: 787, chainId: 56, transferCount: 36087, holderCount: 1459, dexActionCount: 0 },
  { symbol: "ARIA", name: "AriaAI", tokenId: 1467, chainId: 56, transferCount: 23041, holderCount: 41278, dexActionCount: 0 },
  { symbol: "UP", name: "Unitas Labs", tokenId: 1178, chainId: 56, transferCount: 11495, holderCount: 807, dexActionCount: 0 },
  { symbol: "EDGE", name: "edgeX", tokenId: 794, chainId: 56, transferCount: 0, holderCount: 0, dexActionCount: 1 },
  { symbol: "PRL", name: "Perle", tokenId: 1244, chainId: 56, transferCount: 0, holderCount: 0, dexActionCount: 1 },
  { symbol: "R2", name: "R2 Protocol", tokenId: 1295, chainId: 56, transferCount: 0, holderCount: 0, dexActionCount: 1 },
  { symbol: "BASED", name: "Based", tokenId: 1297, chainId: 56, transferCount: 0, holderCount: 0, dexActionCount: 1 },
  { symbol: "OPG", name: "OpenGradient", tokenId: 1584, chainId: 56, transferCount: 0, holderCount: 0, dexActionCount: 1 },
];

function buildLargeTransferGraph(
  items: LargeTransferRecord[]
): LargeTransferGraph {
  const nodeMap = new Map<string, LargeTransferGraphNode>();
  const linkMap = new Map<string, LargeTransferGraphLink>();

  items.forEach(item => {
    const amount = item.amount ?? 0;
    const fromId = item.fromAddress;
    const toId = item.toAddress;

    const fromNode = nodeMap.get(fromId) ?? {
      id: fromId,
      address: item.fromAddress,
      label: item.fromLabel,
      kind: item.fromKind,
      amount: 0,
      transferCount: 0,
    };
    fromNode.amount += amount;
    fromNode.transferCount += 1;
    nodeMap.set(fromId, fromNode);

    const toNode = nodeMap.get(toId) ?? {
      id: toId,
      address: item.toAddress,
      label: item.toLabel,
      kind: item.toKind,
      amount: 0,
      transferCount: 0,
    };
    toNode.amount += amount;
    toNode.transferCount += 1;
    nodeMap.set(toId, toNode);

    const linkId = `${fromId}->${toId}`;
    const link = linkMap.get(linkId) ?? {
      id: linkId,
      source: fromId,
      target: toId,
      amount: 0,
      ratioOfSupply: 0,
      latestBlockTime: item.blockTime,
      transferCount: 0,
    };
    link.amount += amount;
    link.transferCount += 1;
    link.ratioOfSupply = (link.ratioOfSupply ?? 0) + (item.ratioOfSupply ?? 0);
    if ((item.blockTime ?? "") > (link.latestBlockTime ?? "")) {
      link.latestBlockTime = item.blockTime;
    }
    linkMap.set(linkId, link);
  });

  const nodes = Array.from(nodeMap.values()).sort((left, right) => right.amount - left.amount);
  const links = Array.from(linkMap.values()).sort((left, right) => right.amount - left.amount);

  return {
    nodes,
    links,
    totalAmount: links.reduce((sum, link) => sum + link.amount, 0),
  };
}

function isDexLikeMeta(label: string, kind: string) {
  return /dex|swap|router|pancake|uniswap|vault|pool|lp/i.test(`${label} ${kind}`);
}

function isCexLikeMeta(label: string, kind: string) {
  return !isDexLikeMeta(label, kind) && /binance|bybit|gate|okx|kucoin|mexc|bitget|deposit|withdraw|hotwallet|cex/i.test(`${label} ${kind}`);
}

function scopeLabel(scope: LargeTransferScope) {
  if (scope === "all") return "全部大额转账";
  if (scope === "dex") return "DEX 大额流向";
  if (scope === "cex") return "CEX 大额流向";
  return "初始大额流向";
}

function buildScopedLargeTransferItems(
  items: LargeTransferRecord[],
  scope: LargeTransferScope,
  initialAddressSet?: Set<string>
) {
  if (scope === "all") return items;
  if (scope === "initial") {
    if (!initialAddressSet || initialAddressSet.size === 0) return items;
    return items.filter(item => initialAddressSet.has(item.fromAddress) || initialAddressSet.has(item.toAddress));
  }

  const matcher = scope === "dex" ? isDexLikeMeta : isCexLikeMeta;
  const domainItems = items.filter(item => {
    if (scope === "dex") {
      return !isCexLikeMeta(item.fromLabel, item.fromKind) && !isCexLikeMeta(item.toLabel, item.toKind);
    }
    if (scope === "cex") {
      return !isDexLikeMeta(item.fromLabel, item.fromKind) && !isDexLikeMeta(item.toLabel, item.toKind);
    }
    return true;
  });
  const seedAddresses = new Set<string>();
  domainItems.forEach(item => {
    if (matcher(item.fromLabel, item.fromKind)) seedAddresses.add(item.fromAddress);
    if (matcher(item.toLabel, item.toKind)) seedAddresses.add(item.toAddress);
  });
  if (seedAddresses.size === 0) return [];

  const directItems = domainItems.filter(item => seedAddresses.has(item.fromAddress) || seedAddresses.has(item.toAddress));
  const upstreamHop = new Set<string>();
  const downstreamHop = new Set<string>();

  directItems.forEach(item => {
    if (seedAddresses.has(item.toAddress) && !seedAddresses.has(item.fromAddress)) {
      upstreamHop.add(item.fromAddress);
    }
    if (seedAddresses.has(item.fromAddress) && !seedAddresses.has(item.toAddress)) {
      downstreamHop.add(item.toAddress);
    }
  });

  const scoped = domainItems.filter(
    item =>
      seedAddresses.has(item.fromAddress) ||
      seedAddresses.has(item.toAddress) ||
      upstreamHop.has(item.toAddress) ||
      downstreamHop.has(item.fromAddress)
  );

  return Array.from(
    new Map(
      scoped.map(item => [`${item.txhash}-${item.logIndex ?? "na"}-${item.fromAddress}-${item.toAddress}`, item])
    ).values()
  );
}

function buildNetTransferItems(items: LargeTransferRecord[]) {
  const inferredSupplySamples = items
    .map(item => {
      const amount = Number(item.amount ?? 0);
      const ratio = Number(item.ratioOfSupply ?? 0);
      if (amount <= 0 || ratio <= 0) return null;
      return amount / (ratio / 100);
    })
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const inferredTotalSupply =
    inferredSupplySamples.length > 0
      ? inferredSupplySamples.reduce((sum, value) => sum + value, 0) / inferredSupplySamples.length
      : null;

  const pairMap = new Map<
    string,
    {
      left: string;
      right: string;
      leftToRight: number;
      rightToLeft: number;
      leftMeta: Pick<LargeTransferRecord, "fromLabel" | "fromKind">;
      rightMeta: Pick<LargeTransferRecord, "toLabel" | "toKind">;
      latestBlockTime: string | null;
      transferCount: number;
    }
  >();

  items.forEach(item => {
    const amount = item.amount ?? 0;
    if (amount <= 0) return;
    const [left, right] =
      item.fromAddress.toLowerCase() < item.toAddress.toLowerCase()
        ? [item.fromAddress.toLowerCase(), item.toAddress.toLowerCase()]
        : [item.toAddress.toLowerCase(), item.fromAddress.toLowerCase()];
    const key = `${left}|${right}`;
    const current = pairMap.get(key) ?? {
      left,
      right,
      leftToRight: 0,
      rightToLeft: 0,
      leftMeta:
        left === item.fromAddress.toLowerCase()
          ? { fromLabel: item.fromLabel, fromKind: item.fromKind }
          : { fromLabel: item.toLabel, fromKind: item.toKind },
      rightMeta:
        right === item.toAddress.toLowerCase()
          ? { toLabel: item.toLabel, toKind: item.toKind }
          : { toLabel: item.fromLabel, toKind: item.fromKind },
      latestBlockTime: item.blockTime,
      transferCount: 0,
    };

    if (item.fromAddress.toLowerCase() === left) {
      current.leftToRight += amount;
    } else {
      current.rightToLeft += amount;
    }
    current.transferCount += 1;
    if ((item.blockTime ?? "") > (current.latestBlockTime ?? "")) {
      current.latestBlockTime = item.blockTime;
    }
    pairMap.set(key, current);
  });

  return Array.from(pairMap.values())
    .map(entry => {
      const net = entry.leftToRight - entry.rightToLeft;
      if (Math.abs(net) <= 0) return null;
      const isLeftToRight = net > 0;
      return {
        txhash: `net:${entry.left}:${entry.right}`,
        logIndex: null,
        blockTime: entry.latestBlockTime,
        fromAddress: isLeftToRight ? entry.left : entry.right,
        toAddress: isLeftToRight ? entry.right : entry.left,
        fromLabel: isLeftToRight ? entry.leftMeta.fromLabel : entry.rightMeta.toLabel,
        toLabel: isLeftToRight ? entry.rightMeta.toLabel : entry.leftMeta.fromLabel,
        fromKind: isLeftToRight ? entry.leftMeta.fromKind : entry.rightMeta.toKind,
        toKind: isLeftToRight ? entry.rightMeta.toKind : entry.leftMeta.fromKind,
        amount: Math.abs(net),
        ratioOfSupply: inferredTotalSupply ? (Math.abs(net) / inferredTotalSupply) * 100 : null,
        value: null,
      } satisfies LargeTransferRecord;
    })
    .filter(Boolean) as LargeTransferRecord[];
}

function buildLargeTransferBilateralGraph(items: LargeTransferRecord[], scope: "dex" | "cex"): LargeTransferBilateralGraph | null {
  const matcher = scope === "dex" ? isDexLikeMeta : isCexLikeMeta;
  const netItems = buildNetTransferItems(items);
  if (items.length === 0 || netItems.length === 0) return null;

  const incidentAmount = new Map<string, number>();
  const addressMeta = new Map<
    string,
    {
      label: string;
      kind: string;
    }
  >();
  const seedAddresses = new Set<string>();

  items.forEach(item => {
    const amount = item.amount ?? 0;
    const fromAddress = item.fromAddress.toLowerCase();
    const toAddress = item.toAddress.toLowerCase();
    incidentAmount.set(fromAddress, (incidentAmount.get(fromAddress) ?? 0) + amount);
    incidentAmount.set(toAddress, (incidentAmount.get(toAddress) ?? 0) + amount);
    if (!addressMeta.has(fromAddress)) {
      addressMeta.set(fromAddress, { label: item.fromLabel, kind: item.fromKind });
    }
    if (!addressMeta.has(toAddress)) {
      addressMeta.set(toAddress, { label: item.toLabel, kind: item.toKind });
    }
    if (matcher(item.fromLabel, item.fromKind)) seedAddresses.add(fromAddress);
    if (matcher(item.toLabel, item.toKind)) seedAddresses.add(toAddress);
  });

  const centerIds = Array.from(seedAddresses).sort((left, right) => (incidentAmount.get(right) ?? 0) - (incidentAmount.get(left) ?? 0));
  if (centerIds.length === 0) return null;

  const centerIdSet = new Set(centerIds);
  const centerFlowMap = new Map<string, { intoCenter: number; outOfCenter: number }>();
  items.forEach(item => {
    const fromAddress = item.fromAddress.toLowerCase();
    const toAddress = item.toAddress.toLowerCase();
    const amount = item.amount ?? 0;
    if (amount <= 0) return;
    if (centerIdSet.has(toAddress) && !centerIdSet.has(fromAddress)) {
      const current = centerFlowMap.get(fromAddress) ?? { intoCenter: 0, outOfCenter: 0 };
      current.intoCenter += amount;
      centerFlowMap.set(fromAddress, current);
    }
    if (centerIdSet.has(fromAddress) && !centerIdSet.has(toAddress)) {
      const current = centerFlowMap.get(toAddress) ?? { intoCenter: 0, outOfCenter: 0 };
      current.outOfCenter += amount;
      centerFlowMap.set(toAddress, current);
    }
  });

  const leftOneIds = new Set<string>();
  const rightOneIds = new Set<string>();
  centerFlowMap.forEach((flow, address) => {
    const netToCenter = flow.intoCenter - flow.outOfCenter;
    if (netToCenter > 0) {
      leftOneIds.add(address);
    } else if (netToCenter < 0) {
      rightOneIds.add(address);
    }
  });

  netItems.forEach(item => {
    const fromAddress = item.fromAddress.toLowerCase();
    const toAddress = item.toAddress.toLowerCase();
    if (centerIdSet.has(toAddress) && !centerIdSet.has(fromAddress)) {
      leftOneIds.add(fromAddress);
    }
    if (centerIdSet.has(fromAddress) && !centerIdSet.has(toAddress)) {
      rightOneIds.add(toAddress);
    }
  });

  const leftTwoIds = new Set(
    items
      .filter(
        item =>
          leftOneIds.has(item.toAddress.toLowerCase()) &&
          !centerIdSet.has(item.fromAddress.toLowerCase()) &&
          !leftOneIds.has(item.fromAddress.toLowerCase()) &&
          !rightOneIds.has(item.fromAddress.toLowerCase())
      )
      .map(item => item.fromAddress.toLowerCase())
  );
  const rightTwoIds = new Set(
    items
      .filter(
        item =>
          rightOneIds.has(item.fromAddress.toLowerCase()) &&
          !centerIdSet.has(item.toAddress.toLowerCase()) &&
          !leftOneIds.has(item.toAddress.toLowerCase()) &&
          !rightOneIds.has(item.toAddress.toLowerCase())
      )
      .map(item => item.toAddress.toLowerCase())
  );

  const selectedLinks = netItems.filter(item => {
    const fromAddress = item.fromAddress.toLowerCase();
    const toAddress = item.toAddress.toLowerCase();
    if (centerIdSet.has(toAddress) && leftOneIds.has(fromAddress)) return true;
    if (centerIdSet.has(fromAddress) && rightOneIds.has(toAddress)) return true;
    if (centerIdSet.has(fromAddress) && leftOneIds.has(toAddress)) return true;
    if (centerIdSet.has(toAddress) && rightOneIds.has(fromAddress)) return true;
    if (leftTwoIds.has(fromAddress) && leftOneIds.has(toAddress)) return true;
    if (rightOneIds.has(fromAddress) && rightTwoIds.has(toAddress)) return true;
    return false;
  });
  if (selectedLinks.length === 0) return null;

  const nodeMap = new Map<string, LargeTransferBilateralNode>();
  const ensureNode = (address: string, column: 0 | 1 | 2 | 3 | 4) => {
    const meta = addressMeta.get(address) ?? { label: "普通地址", kind: "普通地址" };
    const current = nodeMap.get(address);
    if (current) {
      current.column = current.column === 2 ? 2 : column;
      return current;
    }
    const node: LargeTransferBilateralNode = {
      id: address,
      address,
      label: meta.label,
      kind: meta.kind,
      amount: incidentAmount.get(address) ?? 0,
      transferCount: 0,
      column,
    };
    nodeMap.set(address, node);
    return node;
  };

  centerIds.forEach(address => ensureNode(address, 2));
  leftOneIds.forEach(address => ensureNode(address, 1));
  rightOneIds.forEach(address => ensureNode(address, 3));
  leftTwoIds.forEach(address => ensureNode(address, 0));
  rightTwoIds.forEach(address => ensureNode(address, 4));

  const links = selectedLinks.map<LargeTransferBilateralLink>(item => ({
    id: `${item.fromAddress}->${item.toAddress}`,
    source: item.fromAddress,
    target: item.toAddress,
    amount: item.amount ?? 0,
    ratioOfSupply: item.ratioOfSupply,
    latestBlockTime: item.blockTime,
    transferCount: 1,
  }));

  links.forEach(link => {
    const source = nodeMap.get(link.source);
    const target = nodeMap.get(link.target);
    if (source) source.transferCount += 1;
    if (target) target.transferCount += 1;
  });

  return {
    centerIds,
    nodes: Array.from(nodeMap.values()),
    links,
    totalAmount: links.reduce((sum, link) => sum + link.amount, 0),
  };
}

const dashboardDates = ["2026-04-15", "2026-04-14", "2026-04-13"];

function range(days: number) {
  return Array.from({ length: days }, (_, index) => index);
}

function formatDateShort(date: Date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return `${month}/${day}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createSeededRandom(seed: number) {
  let current = seed >>> 0;

  return () => {
    current += 0x6d2b79f5;
    let temp = Math.imul(current ^ (current >>> 15), 1 | current);
    temp ^= temp + Math.imul(temp ^ (temp >>> 7), 61 | temp);
    return ((temp ^ (temp >>> 14)) >>> 0) / 4294967296;
  };
}

function shortAddress(prefix: string, index: number) {
  const seed = `${prefix}${(index + 1).toString(16).padStart(6, "0")}${(index * 73 + 19).toString(16).padStart(6, "0")}`;
  const full = `${seed}${seed}${seed}${seed}`.slice(0, 40);
  return `0x${full}`;
}

function formatAddressDisplay(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function getChainExplorerBase(chainId = 56) {
  if (chainId === 1) return "https://etherscan.io";
  if (chainId === 8453) return "https://basescan.org";
  return "https://bscscan.com";
}

function formatBscScanAddress(address: string, chainId = 56) {
  return `${getChainExplorerBase(chainId)}/address/${address}`;
}

function formatBscScanTx(txhash: string, chainId = 56) {
  return `${getChainExplorerBase(chainId)}/tx/${txhash}`;
}

function formatBscScanSearch(keyword: string, chainId = 56) {
  return `${getChainExplorerBase(chainId)}/search?f=0&q=${encodeURIComponent(keyword)}`;
}

function formatHashDisplay(txhash: string) {
  if (txhash.length <= 18) return txhash;
  return `${txhash.slice(0, 10)}...${txhash.slice(-6)}`;
}

function formatPoolIdDisplay(poolId: string) {
  if (poolId.length <= 14) return poolId;
  return `${poolId.slice(0, 6)}...${poolId.slice(-6)}`;
}

function formatShanghaiDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatUsdRangeBound(value: number | null, side: "low" | "high") {
  if (value == null) return "—";
  if (value === -1) return side === "low" ? "≈0" : "∞";
  return compactNumber(value, value >= 1 ? 4 : 8);
}

function formatUsdPriceRange(low: number | null, high: number | null) {
  if (low == null && high == null) return "—";
  return `${formatUsdRangeBound(low, "low")} - ${formatUsdRangeBound(high, "high")}`;
}

function buildFlowGraph(symbol: string) {
  const rng = createSeededRandom(symbol.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) + 97);
  const layerCounts = [1, 5, 30, 100, 200];
  const layerTitles = ["0 地址", "第一层", "第二层", "第三层", "第四层"];
  const layerKinds = [
    ["Zero Address"],
    ["部署者", "团队钱包", "空投合约", "流动性池", "早期分发"],
    ["做市商", "新钱包", "Smart Money", "DEX Router", "CEX Deposit", "Bridge"],
    ["归集地址", "活跃交易者", "中继钱包", "机器人地址", "临时地址"],
    ["散户地址", "终端地址", "主属集群", "跨链落点", "沉淀地址"],
  ];

  const allLayers: FlowNode[][] = [];
  const links: FlowLink[] = [];
  const totalAmount = 48_600_000;

  const rootNode: FlowNode = {
    id: "L0-000",
    layer: 0,
    address: "0x0000000000000000000000000000000000000000",
    label: "0 地址",
    amount: totalAmount,
    kind: "铸造源头",
    outgoingCount: 5,
  };
  allLayers.push([rootNode]);

  for (let layer = 1; layer < layerCounts.length; layer += 1) {
    const parents = allLayers[layer - 1];
    const targetCount = layerCounts[layer];
    const baseChildren = Math.floor(targetCount / parents.length);
    let remainder = targetCount % parents.length;
    const children: FlowNode[] = [];

    parents.forEach((parent, parentIndex) => {
      const childCount = baseChildren + (remainder > 0 ? 1 : 0);
      remainder = Math.max(remainder - 1, 0);
      const outRatio = layer === 1 ? 1 : clamp(0.82 + rng() * 0.12, 0.78, 0.96);
      const distributable = parent.amount * outRatio;
      const weights = Array.from({ length: childCount }, () => 0.5 + rng() * 1.8);
      const weightSum = weights.reduce((sum, value) => sum + value, 0);

      weights.forEach((weight, childIndex) => {
        const globalIndex = children.length;
        const amount = distributable * (weight / weightSum);
        const kindPool = layerKinds[layer];
        const kind = kindPool[(parentIndex + childIndex) % kindPool.length];
        const id = `L${layer}-${globalIndex.toString().padStart(3, "0")}`;
        const address = shortAddress(`${layer}${parentIndex.toString(16)}`, globalIndex);

        const node: FlowNode = {
          id,
          layer,
          address,
          label: layer <= 2 ? `${kind} ${globalIndex + 1}` : `L${layer}-${globalIndex + 1}`,
          amount: Math.round(amount),
          kind,
          outgoingCount: layer === layerCounts.length - 1 ? 0 : 0,
        };

        children.push(node);
        links.push({
          source: parent.id,
          target: id,
          amount: Math.round(amount),
        });
      });
    });

    allLayers.push(
      children
        .sort((left, right) => right.amount - left.amount)
        .map((node, index, list) => {
          const childCount =
            layer === layerCounts.length - 1
              ? 0
              : Math.floor(layerCounts[layer + 1] / list.length) + (index < layerCounts[layer + 1] % list.length ? 1 : 0);
          return { ...node, outgoingCount: childCount };
        })
    );
  }

  const nodes = allLayers.flat();
  const summaries = allLayers.map((layerNodes, index) => ({
    layer: index,
    title: layerTitles[index],
    count: layerNodes.length,
    totalAmount: layerNodes.reduce((sum, node) => sum + node.amount, 0),
  }));

  return {
    nodes,
    links,
    summaries,
    totalAmount,
  } satisfies FlowGraph;
}

function buildTrend90d(seed: {
  controlBase: number;
  holdersBase: number;
  netFlowBase: number;
  dexBase: number;
  whaleBase: number;
  depthBase: number;
}) {
  const today = new Date("2026-04-15T00:00:00");

  return range(90).map(offset => {
    const date = new Date(today);
    date.setDate(today.getDate() - (89 - offset));
    const wave = Math.sin((offset + 1) / 6);
    const slowWave = Math.cos((offset + 3) / 11);
    const trend = (offset - 45) / 45;
    const controlRate = Number((seed.controlBase + wave * 1.9 + slowWave * 1.2 + trend * 0.7).toFixed(2));
    const holderCount = Math.round(seed.holdersBase + offset * 118 + wave * 540 + slowWave * 360);
    const exchangeNetFlow = Math.round(seed.netFlowBase + wave * 1_500_000 - slowWave * 980_000 + trend * 1_100_000);
    const netFlowRatio = Number((exchangeNetFlow / 410_000_000 * 100).toFixed(2));
    const dexAccIdx = Number(clamp(seed.dexBase + wave * 0.18 - slowWave * 0.08 + trend * 0.06, 0.58, 1.62).toFixed(2));
    const whaleNetOutflow = Math.round(seed.whaleBase + slowWave * 1_200_000 + wave * 720_000 - trend * 800_000);
    const depthSkew = Number(clamp(seed.depthBase + wave * 0.09 + slowWave * 0.04, 0.72, 1.42).toFixed(2));

    return {
      date: date.toISOString().slice(0, 10),
      shortDate: formatDateShort(date),
      controlRate,
      holderCount,
      exchangeNetFlow,
      netFlowRatio,
      dexAccIdx,
      whaleNetOutflow,
      depthSkew,
    };
  });
}

function seriesSlice(trend90d: TrendPoint[], metric: keyof TrendPoint, days: number) {
  return trend90d.slice(-days).map(point => ({
    date: point.shortDate,
    value: Number(point[metric]),
  }));
}

function buildTokenDashboard(config: {
  symbol: string;
  logo: string;
  name: string;
  priceUsd: number;
  totalSupply: number;
  circulatingSupply: number;
  marketCap: number;
  fdv: number;
  controlRate: number;
  holderCount: number;
  exchangeNetFlow: number;
  netFlowRatio: number;
  depthBuy2Total: number;
  depthSell2Total: number;
  dexAccIdx: number;
  whaleNetOutflow: number;
  tagDirection: number;
}) {
  const trend90d = buildTrend90d({
    controlBase: config.controlRate,
    holdersBase: config.holderCount - 10_200,
    netFlowBase: config.exchangeNetFlow - 1_800_000,
    dexBase: config.dexAccIdx,
    whaleBase: config.whaleNetOutflow - 1_400_000,
    depthBase: config.depthBuy2Total / config.depthSell2Total,
  });

  const snapshots = dashboardDates.reduce<Record<string, Snapshot>>((accumulator, date, index) => {
    const priceShift = index * 0.96;
    const holderShift = index * 188;
    const controlShift = index * 0.35;
    const exchangeShift = index * 1_240_000;
    const netFlowValue = config.exchangeNetFlow - exchangeShift;
    const basePrice = config.priceUsd - priceShift;

    accumulator[date] = {
      tokenName: config.name,
      tokenSymbol: config.symbol,
      priceUsd: Number(basePrice.toFixed(4)),
      priceChange24h: Number((index === 0 ? 7.84 : index === 1 ? 4.38 : -2.12).toFixed(2)),
      totalSupply: config.totalSupply,
      circulatingSupply: config.circulatingSupply - index * 800_000,
      marketCap: config.marketCap - index * 6_500_000,
      fdv: config.fdv - index * 8_200_000,
      holderCount: config.holderCount - holderShift,
      holderCountChange1d: index === 0 ? 482 : index === 1 ? 236 : -118,
      controlRate: Number((config.controlRate - controlShift).toFixed(2)),
      controlRateChange1d: Number((index === 0 ? 0.84 : index === 1 ? 0.22 : -0.31).toFixed(2)),
      top10Ratio: Number((22.6 - index * 0.4).toFixed(2)),
      top50Ratio: Number((39.8 - index * 0.5).toFixed(2)),
      top100Ratio: Number((52.7 - index * 0.6).toFixed(2)),
      othersRatio: Number((47.3 + index * 0.6).toFixed(2)),
      explicitControl: 46_200_000 - index * 300_000,
      implicitControl: 28_900_000 - index * 180_000,
      indirectControl: 11_400_000 - index * 150_000,
      controlBalanceTotal: 86_500_000 - index * 630_000,
      top10Balance: 54_800_000 - index * 540_000,
      top50Balance: 96_300_000 - index * 800_000,
      top100Balance: 127_400_000 - index * 920_000,
      exchangeInflow: 6_800_000 - index * 480_000,
      exchangeOutflow: 10_200_000 - index * 630_000,
      exchangeNetFlow: netFlowValue,
      netFlowRatio: Number((config.netFlowRatio - index * 0.21).toFixed(2)),
      netFlowStreak: index === 0 ? -4 : -3,
      exchangeCoverageCount: 126,
      totalBuyVolume: 26_400_000 - index * 1_100_000,
      totalSellVolume: 18_700_000 + index * 920_000,
      buyAddressCount: 12_860 - index * 240,
      sellAddressCount: 8_240 + index * 110,
      top5BuyVolume: 8_900_000 - index * 320_000,
      top5SellVolume: 6_400_000 + index * 290_000,
      buyConcentration: Number((0.34 - index * 0.01).toFixed(2)),
      sellConcentration: Number((0.26 + index * 0.01).toFixed(2)),
      dexAccIdx: Number((config.dexAccIdx - index * 0.05).toFixed(2)),
      whaleAddressCount: 100,
      whaleTotalBalance: 132_400_000 - index * 880_000,
      whaleTotalOutflow: 9_200_000 - index * 620_000,
      whaleTotalInflow: 5_600_000 + index * 410_000,
      whaleNetOutflow: config.whaleNetOutflow - index * 920_000,
      whaleToExchange: 3_200_000 - index * 240_000,
      whaleToNewAddress: 2_450_000 - index * 190_000,
      whaleToDexRouter: 1_760_000 - index * 120_000,
      whaleInternalTransfer: 1_790_000 - index * 70_000,
      whaleOutRatio: Number((6.94 - index * 0.22).toFixed(2)),
      tagNetChanges: [
        { label: "Team Wallet", value: config.tagDirection * (2_600_000 - index * 200_000) },
        { label: "已知做市商", value: config.tagDirection * (1_400_000 - index * 160_000) },
        { label: "疑似做市商", value: -config.tagDirection * (620_000 - index * 80_000) },
        { label: "老鼠仓集群", value: -config.tagDirection * (1_950_000 - index * 150_000) },
        { label: "空投猎人", value: -config.tagDirection * (860_000 - index * 70_000) },
      ],
      increaseRows: [
        {
          address: "0x7A91...0Fc2",
          label: "新鲸鱼地址",
          changeBalance: 2_840_000 - index * 180_000,
          firstSeen: "2026-04-15 08:13",
          href: "https://etherscan.io/address/0x7A9100000000000000000000000000000000Fc2",
        },
        {
          address: "0x6C31...D2a0",
          label: "疑似做市商",
          changeBalance: 1_940_000 - index * 120_000,
          firstSeen: "2026-04-15 07:50",
          href: "https://etherscan.io/address/0x6C310000000000000000000000000000000D2a0",
        },
        {
          address: "0x11e2...A992",
          label: "Smart Money",
          changeBalance: 1_620_000 - index * 100_000,
          firstSeen: "2026-04-15 01:42",
          href: "https://etherscan.io/address/0x11e2000000000000000000000000000000A992",
        },
      ],
      decreaseRows: [
        {
          address: "0x93b0...1E12",
          label: "早期投资人",
          changeBalance: 3_260_000 - index * 200_000,
          currentBalance: 8_300_000 - index * 500_000,
          href: "https://etherscan.io/address/0x93b00000000000000000000000000000001E12",
        },
        {
          address: "0xA1f2...4bd8",
          label: "老鼠仓集群",
          changeBalance: 2_280_000 - index * 180_000,
          currentBalance: 4_900_000 - index * 260_000,
          href: "https://etherscan.io/address/0xA1f20000000000000000000000000000004bd8",
        },
        {
          address: "0xDc88...392E",
          label: "空投猎人",
          changeBalance: 1_760_000 - index * 140_000,
          currentBalance: 2_840_000 - index * 180_000,
          href: "https://etherscan.io/address/0xDc88000000000000000000000000000000392E",
        },
      ],
    };

    return accumulator;
  }, {});

  return {
    symbol: config.symbol,
    logo: config.logo,
    name: config.name,
    dates: snapshots,
    trend90d,
  };
}

const tokenDashboards: TokenDashboard[] = [
  buildTokenDashboard({
    symbol: "BSB",
    logo: "B",
    name: "BSB",
    priceUsd: 0.074,
    totalSupply: 100_000_000,
    circulatingSupply: 78_000_000,
    marketCap: 5_770_000,
    fdv: 7_400_000,
    controlRate: 31.4,
    holderCount: 18_460,
    exchangeNetFlow: -860_000,
    netFlowRatio: -1.1,
    depthBuy2Total: 1_420_000,
    depthSell2Total: 1_110_000,
    dexAccIdx: 1.07,
    whaleNetOutflow: 1_280_000,
    tagDirection: 1,
  }),
  buildTokenDashboard({
    symbol: "GENIUS",
    logo: "G",
    name: "Genius",
    priceUsd: 1.2842,
    totalSupply: 242_000_000,
    circulatingSupply: 164_800_000,
    marketCap: 211_600_000,
    fdv: 310_800_000,
    controlRate: 35.74,
    holderCount: 42_860,
    exchangeNetFlow: -3_400_000,
    netFlowRatio: -2.06,
    depthBuy2Total: 3_840_000,
    depthSell2Total: 2_920_000,
    dexAccIdx: 1.31,
    whaleNetOutflow: 3_600_000,
    tagDirection: 1,
  }),
  buildTokenDashboard({
    symbol: "CRMON",
    logo: "C",
    name: "CRMon",
    priceUsd: 0.8421,
    totalSupply: 420_000_000,
    circulatingSupply: 285_000_000,
    marketCap: 239_900_000,
    fdv: 353_700_000,
    controlRate: 28.44,
    holderCount: 36_540,
    exchangeNetFlow: 2_620_000,
    netFlowRatio: 0.92,
    depthBuy2Total: 2_980_000,
    depthSell2Total: 3_420_000,
    dexAccIdx: 0.88,
    whaleNetOutflow: -1_280_000,
    tagDirection: -1,
  }),
  buildTokenDashboard({
    symbol: "APPON",
    logo: "A",
    name: "AppOn",
    priceUsd: 2.4135,
    totalSupply: 128_000_000,
    circulatingSupply: 74_200_000,
    marketCap: 178_600_000,
    fdv: 308_900_000,
    controlRate: 41.82,
    holderCount: 21_940,
    exchangeNetFlow: -980_000,
    netFlowRatio: -1.32,
    depthBuy2Total: 2_340_000,
    depthSell2Total: 1_840_000,
    dexAccIdx: 1.18,
    whaleNetOutflow: 1_920_000,
    tagDirection: 1,
  }),
];

const trendConfig = [
  { key: "controlRate", label: "控盘率", color: DEEP_BLUE },
  { key: "netFlowRatio", label: "净流入比例", color: DISTRIBUTION_NEGATIVE },
  { key: "whaleNetOutflow", label: "大户净转出", color: RISE_RED },
] as const;

function compactNumber(value: number, fractionDigits = 2) {
  const absolute = Math.abs(value);
  if (absolute >= 100_000_000) return `${(value / 100_000_000).toFixed(fractionDigits)}亿`;
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(fractionDigits)}万`;
  if (absolute >= 1_000) return `${(value / 1_000).toFixed(fractionDigits)}K`;
  return value.toFixed(fractionDigits);
}

function compactCurrency(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (absolute >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (absolute >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toFixed(2)}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

function percentTone(value: number, invert = false) {
  if (value === 0) return "text-[#64748B]";
  const positive = invert ? value < 0 : value > 0;
  return positive ? "text-[#EF4444]" : "text-[#10B981]";
}

function ValueDelta({ value, invert }: { value: number; invert?: boolean }) {
  const positive = invert ? value < 0 : value > 0;
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", percentTone(value, invert))}>
      <Icon className="h-3.5 w-3.5" />
      {value > 0 ? "+" : ""}
      {formatPercent(value)}
    </span>
  );
}

function MiniSparkline({
  values,
  color,
  className,
}: {
  values: number[];
  color: string;
  className?: string;
}) {
  const width = 120;
  const height = 36;
  const padding = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const rangeValue = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = padding + (index / (values.length - 1 || 1)) * (width - padding * 2);
      const y = height - padding - ((value - min) / rangeValue) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-9 w-full", className)} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

function DashboardCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("rounded-[24px] border border-white/80 bg-white/90 shadow-[0_14px_36px_rgba(71,85,105,0.08)]", className)}>
      <CardContent className="p-5">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-[#0F172A]">{title}</div>
            {subtitle ? <div className="mt-1 text-xs text-[#64748B]">{subtitle}</div> : null}
          </div>
          {action}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  delta,
  tooltip,
  sparkline,
  valueClassName,
}: {
  label: string;
  value: string;
  delta?: number;
  tooltip?: string;
  sparkline?: number[];
  valueClassName?: string;
}) {
  return (
    <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium text-[#64748B]">{label}</div>
        {typeof delta === "number" ? <ValueDelta value={delta} /> : null}
      </div>
      <div className={cn("metric-value mt-2 text-[#0F172A]", valueClassName)} title={tooltip}>
        {value}
      </div>
      {sparkline ? <MiniSparkline values={sparkline} color={DEEP_BLUE} className="mt-3" /> : null}
    </div>
  );
}

const FundFlowCanvas = memo(function FundFlowCanvas({
  graph,
  minAmount,
  collapsedNodeIds,
  onToggleCollapse,
  viewportHeight = 980,
  explorerChainId = 56,
}: {
  graph: FlowGraph;
  minAmount: number;
  collapsedNodeIds: Set<string>;
  onToggleCollapse: (nodeId: string) => void;
  viewportHeight?: number;
  explorerChainId?: number;
}) {
  const [copiedNodeId, setCopiedNodeId] = useState<string | null>(null);

  const {
    visibleNodeIds,
    visibleLinks,
    visibleNodes,
    nodesByLayer,
    canvasHeight,
    canvasWidth,
    layerX,
    nodePositions,
  } = useMemo(() => {
    const childrenMap = new Map<string, FlowLink[]>();

    graph.links.forEach(link => {
      const current = childrenMap.get(link.source) ?? [];
      current.push(link);
      childrenMap.set(link.source, current);
    });

    const visibleNodeIds = new Set<string>();
    const visibleLinkIds = new Set<string>();
    const visibleLinks: FlowLink[] = [];
    const rootNodeIds = graph.nodes.filter(node => node.layer === 0).map(node => node.id);
    const expandedNodeIds = new Set<string>();
    const stack = [...rootNodeIds];

    while (stack.length > 0) {
      const nodeId = stack.pop();
      if (!nodeId) continue;
      if (expandedNodeIds.has(nodeId)) continue;
      expandedNodeIds.add(nodeId);
      visibleNodeIds.add(nodeId);
      if (collapsedNodeIds.has(nodeId)) continue;

      const children = (childrenMap.get(nodeId) ?? []).filter(link => link.amount >= minAmount);
      children.forEach(link => {
        const linkId = `${link.source}->${link.target}`;
        if (!visibleLinkIds.has(linkId)) {
          visibleLinkIds.add(linkId);
          visibleLinks.push(link);
        }
        visibleNodeIds.add(link.target);
        if (!expandedNodeIds.has(link.target)) {
          stack.push(link.target);
        }
      });
    }

    const visibleNodes = graph.nodes.filter(node => visibleNodeIds.has(node.id));
    const nodesByLayer = graph.summaries.map(summary =>
      visibleNodes.filter(node => node.layer === summary.layer).sort((left, right) => right.amount - left.amount)
    );

    const layerGap = 360;
    const baseX = 70;
    const layerX = graph.summaries.map((_, index) => baseX + index * layerGap);
    const nodeWidth = 220;
    const verticalPadding = 70;
    const canvasHeight = Math.max(
      1400,
      ...nodesByLayer.map((nodes, layer) => {
        const nodeHeight = layer === 0 ? 42 : 62;
        const gap = layer === 0 ? 20 : 10;
        return nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * gap + verticalPadding * 2;
      })
    );
    const canvasWidth = layerX[layerX.length - 1] + nodeWidth + 200;

    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number; layer: number; node: FlowNode }>();
    nodesByLayer.forEach((layerNodes, layerIndex) => {
      const gap = layerIndex === 0 ? 20 : 10;
      let currentY = verticalPadding;
      layerNodes.forEach(node => {
        const height =
          layerIndex === 0 ? 42 : Math.max(62, Math.min(74, 62 + (graph.totalAmount ? node.amount / graph.totalAmount : 0) * 96));
        nodePositions.set(node.id, {
          x: layerX[layerIndex],
          y: currentY,
          width: layerIndex === 0 ? 150 : nodeWidth,
          height,
          layer: layerIndex,
          node,
        });
        currentY += height + gap;
      });
    });

    return {
      visibleNodeIds,
      visibleLinks,
      visibleNodes,
      nodesByLayer,
      canvasHeight,
      canvasWidth,
      layerX,
      nodePositions,
    };
  }, [graph, minAmount, collapsedNodeIds]);
  const rootLayerCount = nodesByLayer[0]?.length ?? 0;
  const rootLayerTitle = rootLayerCount > 1 ? "0 地址 + 断链来源的七层分发路径" : "0 地址起始的七层分发路径";

  const handleCopyAddress = async (nodeId: string, address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedNodeId(nodeId);
      window.setTimeout(() => {
        setCopiedNodeId(current => (current === nodeId ? null : current));
      }, 1500);
    } catch {
      setCopiedNodeId(null);
    }
  };

  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">{rootLayerTitle}</div>
          <div className="mt-1 text-xs text-[#64748B]">
            {rootLayerCount > 1 ? "第 0 层包含 1 个真实 0 地址和若干断链来源地址。" : "点击地址后的加减号可展开 / 收起下游子树"}
          </div>
        </div>
        <div className="text-sm text-[#64748B]">当前可见地址 {visibleNodes.length} · 当前可见边 {visibleLinks.length}</div>
      </div>

      <div className="overflow-auto rounded-[20px] border border-[#E2E8F0] bg-white" style={{ height: viewportHeight }}>
        <svg width={canvasWidth} height={canvasHeight} className="block">
          {graph.summaries.map((summary, index) => (
            <g key={summary.layer}>
              <text x={layerX[index]} y={30} fill="#1E40AF" fontSize="14" fontWeight="700">
                {summary.title}
              </text>
              <text x={layerX[index]} y={49} fill="#64748B" fontSize="11">
                {nodesByLayer[index].length} / {summary.count} 个地址
              </text>
            </g>
          ))}

          {visibleLinks.map(link => {
            const source = nodePositions.get(link.source);
            const target = nodePositions.get(link.target);
            if (!source || !target) return null;
            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x;
            const endY = target.y + target.height / 2;
            const controlX = (startX + endX) / 2;
            const strokeWidth = Math.max(1.2, Math.min(7, link.amount / graph.totalAmount * 120));
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const ratioText = `${((link.amount / graph.totalAmount) * 100).toFixed(2)}%`;

            return (
              <g key={`${link.source}-${link.target}`}>
                <path
                  d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#93C5FD"
                  strokeOpacity={0.22}
                  strokeWidth={strokeWidth}
                />
                <g>
                  <rect x={midX - 38} y={midY - 12} width={76} height={24} rx={12} ry={12} fill="#FFFFFF" opacity={0.94} />
                  <text x={midX} y={midY - 1} textAnchor="middle" fill="#334155" fontSize="9" fontWeight="700">
                    {compactNumber(link.amount, 1)}
                  </text>
                  <text x={midX} y={midY + 8} textAnchor="middle" fill="#64748B" fontSize="8">
                    {ratioText}
                  </text>
                </g>
              </g>
            );
          })}

          {Array.from(nodePositions.values()).map(({ node, x, y, width, height, layer }) => {
            const fill = layer === 0 ? "#1D4ED8" : layer === 1 ? "#2563EB" : layer === 2 ? "#4F8FF7" : layer === 3 ? "#76ABFA" : "#8CB8FB";
            const isCollapsed = collapsedNodeIds.has(node.id);
            const formattedAddress = formatAddressDisplay(node.address);
            const ratioText = `${((node.amount / graph.totalAmount) * 100).toFixed(2)}%`;
            const balanceText = `持币 ${compactNumber(node.currentBalance ?? 0, 1)}`;
            const darkText = false;
            const titleText = layer === 0 ? node.label : node.kind.length > 10 ? `${node.kind.slice(0, 10)}…` : node.kind;
            const metricText = `${compactNumber(node.amount, 1)} · ${ratioText}`;

            return (
              <g key={node.id} style={{ cursor: "default" }}>
                <rect
                  x={x}
                  y={y}
                  rx={8}
                  ry={8}
                  width={width}
                  height={height}
                  fill={fill}
                  opacity={0.96}
                  stroke="#ffffff"
                  strokeWidth={1}
                />
                {layer > 0 ? (
                  <>
                    <text x={x + 12} y={y + 18} fill={darkText ? "#0F172A" : "#FFFFFF"} fontSize="9.5" fontWeight="700">
                      {titleText}
                    </text>
                    <text
                      x={x + width - 66}
                      y={y + 18}
                      textAnchor="end"
                      fill={darkText ? "#334155" : "#DBEAFE"}
                      fontSize="8.2"
                      fontWeight="600"
                    >
                      {balanceText}
                    </text>
                    <text
                      x={x + 12}
                      y={y + 37}
                      fill={darkText ? "#1E293B" : "#FFFFFF"}
                      fontSize="8.8"
                      fontWeight="600"
                      style={{ cursor: "pointer" }}
                      onClick={event => {
                        event.stopPropagation();
                        window.open(formatBscScanAddress(node.address, explorerChainId), "_blank", "noopener,noreferrer");
                      }}
                    >
                      {formattedAddress}
                    </text>
                    {node.outgoingCount > 0 ? (
                      <g
                        onClick={event => {
                          event.stopPropagation();
                          onToggleCollapse(node.id);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <rect x={x + width - 22} y={y + 26} width={16} height={16} rx={8} ry={8} fill="#FFFFFF" opacity={0.95} />
                        <text x={x + width - 14} y={y + 37} textAnchor="middle" fill="#1E40AF" fontSize="11" fontWeight="700">
                          {isCollapsed ? "+" : "-"}
                        </text>
                      </g>
                    ) : null}
                    <text x={x + 12} y={y + 58} fill={darkText ? "#334155" : "#E2E8F0"} fontSize="8.8">
                      {metricText}
                    </text>
                    <g
                      onClick={event => {
                        event.stopPropagation();
                        handleCopyAddress(node.id, node.address);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {copiedNodeId === node.id ? (
                        <text x={x + width - 22} y={y + 38} fill="#FFFFFF" fontSize="11" fontWeight="700">
                          ✓
                        </text>
                      ) : (
                        <text x={x + width - 22} y={y + 38} fill="#FFFFFF" fontSize="11" fontWeight="700">
                          ⧉
                        </text>
                      )}
                    </g>
                  </>
                ) : (
                  <>
                    <text x={x + 10} y={y + 17} fill="#FFFFFF" fontSize="9.2" fontWeight="700">
                      {node.label}
                    </text>
                    <text x={x + 10} y={y + 31} fill="#DBEAFE" fontSize="8.5">
                      {compactNumber(node.amount, 1)} · {ratioText}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});

const LargeTransferGraphCanvas = memo(function LargeTransferGraphCanvas({
  graph,
  defaultView = "focus",
  explorerChainId = 56,
}: {
  graph: LargeTransferGraph;
  defaultView?: "focus" | "all";
  explorerChainId?: number;
}) {
  const {
    nodes,
    visibleLinks,
    nodePositions,
    width,
    height,
    neighborMap,
    secondaryNeighborMap,
    centerNodeId,
  } = useMemo(() => {
    const width = Math.max(2400, 1200 + graph.nodes.length * 90);
    const height = Math.max(1700, 820 + graph.nodes.length * 58);
    const nodeRadiusBase = 14;
    const collideRadius = 70;
    const simulationNodes: ForceTransferNode[] = graph.nodes.map(node => ({ ...node, x: width / 2, y: height / 2 }));
    const rawLinks = graph.links.map(link => ({ ...link }));
    const simulationLinks: ForceTransferLink[] = rawLinks.map(link => ({ ...link }));
    const neighborMap = new Map<string, Set<string>>();

    rawLinks.forEach(link => {
      const sourceId = link.source;
      const targetId = link.target;
      const sourceNeighbors = neighborMap.get(sourceId) ?? new Set<string>();
      sourceNeighbors.add(targetId);
      neighborMap.set(sourceId, sourceNeighbors);
      const targetNeighbors = neighborMap.get(targetId) ?? new Set<string>();
      targetNeighbors.add(sourceId);
      neighborMap.set(targetId, targetNeighbors);
    });

    const incidentAmount = new Map<string, number>();
    graph.links.forEach(link => {
      incidentAmount.set(link.source, (incidentAmount.get(link.source) ?? 0) + link.amount);
      incidentAmount.set(link.target, (incidentAmount.get(link.target) ?? 0) + link.amount);
    });

    const centerNodeId =
      [...graph.nodes]
        .sort((left, right) => {
          const rightScore =
            (incidentAmount.get(right.id) ?? 0) +
            ((neighborMap.get(right.id)?.size ?? 0) * 100000);
          const leftScore =
            (incidentAmount.get(left.id) ?? 0) +
            ((neighborMap.get(left.id)?.size ?? 0) * 100000);
          return rightScore - leftScore;
        })[0]?.id ?? graph.nodes[0]?.id;

    simulationNodes.forEach(node => {
      if (node.id === centerNodeId) {
        node.x = width / 2;
        node.y = height / 2;
        node.fx = width / 2;
        node.fy = height / 2;
      }
    });

    const simulation = forceSimulation<ForceTransferNode>(simulationNodes)
      .force(
        "link",
        forceLink<ForceTransferNode, ForceTransferLink>(simulationLinks)
          .id(node => node.id)
          .distance(220)
          .strength(0.12)
      )
      .force("charge", forceManyBody().strength(-520))
      .force("collide", forceCollide<ForceTransferNode>(collideRadius))
      .force("center", forceCenter(width / 2, height / 2))
      .force("x", forceX(width / 2).strength(0.012))
      .force("y", forceY(height / 2).strength(0.012))
      .stop();

    for (let index = 0; index < 420; index += 1) {
      simulation.tick();
    }

    const nodePositions = new Map<string, { x: number; y: number; r: number }>();
    simulationNodes.forEach(node => {
      const r = node.id === centerNodeId ? 20 : 14;
      nodePositions.set(node.id, {
        x: Math.min(width - r - 20, Math.max(r + 20, node.x ?? width / 2)),
        y: Math.min(height - r - 20, Math.max(r + 20, node.y ?? height / 2)),
        r,
      });
    });

    const secondaryNeighborMap = new Map<string, Set<string>>();
    neighborMap.forEach((neighbors, nodeId) => {
      const second = new Set<string>();
      neighbors.forEach(neighborId => {
        (neighborMap.get(neighborId) ?? new Set<string>()).forEach(secondNeighborId => {
          if (secondNeighborId !== nodeId && !neighbors.has(secondNeighborId)) {
            second.add(secondNeighborId);
          }
        });
      });
      secondaryNeighborMap.set(nodeId, second);
    });

    return {
      nodes: simulationNodes,
      visibleLinks: rawLinks,
      nodePositions,
      width,
      height,
      neighborMap,
      secondaryNeighborMap,
      centerNodeId,
    };
  }, [graph]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(centerNodeId ?? null);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [graphDetailMode, setGraphDetailMode] = useState<"focus" | "all">(defaultView);
  const [showSecondHop, setShowSecondHop] = useState(false);

  useEffect(() => {
    setSelectedNodeId(centerNodeId ?? null);
    setHoveredNodeId(null);
  }, [centerNodeId, graph]);

  useEffect(() => {
    setGraphDetailMode(defaultView);
  }, [defaultView, graph]);

  const activeNodeId = hoveredNodeId ?? selectedNodeId;
  const primaryNeighbors = activeNodeId ? neighborMap.get(activeNodeId) ?? new Set<string>() : new Set<string>();
  const secondaryNeighbors = activeNodeId ? secondaryNeighborMap.get(activeNodeId) ?? new Set<string>() : new Set<string>();
  const focusNodeIds = activeNodeId
    ? new Set<string>([
        activeNodeId,
        ...Array.from(primaryNeighbors),
        ...(showSecondHop ? Array.from(secondaryNeighbors) : []),
      ])
    : new Set<string>();
  const renderedLinks =
    graphDetailMode === "focus" && activeNodeId
      ? visibleLinks.filter(link => focusNodeIds.has(link.source) && focusNodeIds.has(link.target))
      : visibleLinks;
  const renderedNodes =
    graphDetailMode === "focus" && activeNodeId
      ? nodes.filter(node => focusNodeIds.has(node.id))
      : nodes;

  const focusLayout = useMemo(() => {
    const focalId = selectedNodeId ?? centerNodeId ?? null;
    if (!focalId) return null;

    const focalNode = nodes.find(node => node.id === focalId) ?? null;
    if (!focalNode) return null;

    const inboundLinks = visibleLinks.filter(link => link.target === focalId).sort((a, b) => b.amount - a.amount);
    const outboundLinks = visibleLinks.filter(link => link.source === focalId).sort((a, b) => b.amount - a.amount);
    const inboundNodes = inboundLinks
      .map(link => nodes.find(node => node.id === link.source))
      .filter(Boolean) as ForceTransferNode[];
    const outboundNodes = outboundLinks
      .map(link => nodes.find(node => node.id === link.target))
      .filter(Boolean) as ForceTransferNode[];

    const secondInboundLinks = showSecondHop
      ? visibleLinks.filter(link => inboundNodes.some(node => node.id === link.target) && link.source !== focalId && !inboundNodes.some(node => node.id === link.source))
      : [];
    const secondOutboundLinks = showSecondHop
      ? visibleLinks.filter(link => outboundNodes.some(node => node.id === link.source) && link.target !== focalId && !outboundNodes.some(node => node.id === link.target))
      : [];

    const secondInboundNodes = Array.from(
      new Map(
        secondInboundLinks
          .sort((a, b) => b.amount - a.amount)
          .map(link => {
            const node = nodes.find(item => item.id === link.source);
            return node ? [node.id, node] : null;
          })
          .filter(Boolean) as Array<[string, ForceTransferNode]>
      ).values()
    );
    const secondOutboundNodes = Array.from(
      new Map(
        secondOutboundLinks
          .sort((a, b) => b.amount - a.amount)
          .map(link => {
            const node = nodes.find(item => item.id === link.target);
            return node ? [node.id, node] : null;
          })
          .filter(Boolean) as Array<[string, ForceTransferNode]>
      ).values()
    );

    const width = 2200;
    const height = 1280;
    const centerX = width / 2;
    const centerY = height / 2;
    const positions = new Map<string, { x: number; y: number; r: number; tier: 0 | 1 | 2; side: "center" | "left" | "right" }>();
    const radiusForTier = (tier: 0 | 1 | 2) => {
      if (tier === 0) return 18;
      if (tier === 1) return 13;
      return 11;
    };

    positions.set(focalNode.id, { x: centerX, y: centerY, r: radiusForTier(0), tier: 0, side: "center" });

    const placeColumn = (
      targetNodes: ForceTransferNode[],
      side: "left" | "right",
      x: number,
      tier: 1 | 2
    ) => {
      if (targetNodes.length === 0) return;
      const startY = 170;
      const availableHeight = height - 260;
      const spacing = Math.min(availableHeight / Math.max(1, targetNodes.length), 108);
      const totalHeight = spacing * Math.max(0, targetNodes.length - 1);
      const offsetY = centerY - totalHeight / 2;
      targetNodes.forEach((node, index) => {
        positions.set(node.id, {
          x,
          y: Math.max(startY, offsetY + spacing * index),
          r: radiusForTier(tier),
          tier,
          side,
        });
      });
    };

    placeColumn(inboundNodes, "left", 560, 1);
    placeColumn(outboundNodes, "right", width - 560, 1);
    placeColumn(secondInboundNodes, "left", 210, 2);
    placeColumn(secondOutboundNodes, "right", width - 210, 2);

    const visibleNodeIds = new Set<string>([
      focalNode.id,
      ...inboundNodes.map(node => node.id),
      ...outboundNodes.map(node => node.id),
      ...secondInboundNodes.map(node => node.id),
      ...secondOutboundNodes.map(node => node.id),
    ]);
    const visibleFocusLinks = visibleLinks.filter(link => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target));

    return {
      focalNode,
      positions,
      links: visibleFocusLinks,
      width,
      height,
      inboundCount: inboundNodes.length,
      outboundCount: outboundNodes.length,
      totalVisibleNodes: visibleNodeIds.size,
    };
  }, [selectedNodeId, centerNodeId, nodes, visibleLinks, showSecondHop]);

  const maxLinkAmount = renderedLinks.reduce((max, link) => Math.max(max, link.amount), 0);
  const colorForKind = (kind: string) => {
    if (/binance|bybit|gate|okx|cex/i.test(kind)) return "#1D4ED8";
    if (/contract|合约/i.test(kind)) return "#7C3AED";
    if (/wallet|钱包/i.test(kind)) return "#2563EB";
    return "#60A5FA";
  };

  return (
    <div data-large-transfer-graph-root className="rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[#64748B]">
          默认先聚焦核心地址；左边看资金来源，右边看资金去向。点击节点可切换中心，双击空白可回到核心地址。
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-[#D7E3F4] bg-white p-1">
            {[
              { key: "focus", label: "核心视图" },
              { key: "all", label: "全部节点" },
            ].map(option => (
              <button
                key={option.key}
                type="button"
                onClick={() => setGraphDetailMode(option.key as "focus" | "all")}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm font-medium transition",
                  graphDetailMode === option.key ? "bg-[#1D4ED8] text-white" : "text-[#475569] hover:text-[#1D4ED8]"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedNodeId ? (
            <Button
              variant="secondary"
              className="h-9 rounded-full"
              onClick={() => setShowSecondHop(current => !current)}
            >
              {showSecondHop ? "隐藏二阶" : "显示二阶"}
            </Button>
          ) : null}
          <div className="text-xs text-[#64748B]">
            当前页地址 {graph.nodes.length} · 当前页路径 {graph.links.length} · 当前页总额 {compactNumber(graph.totalAmount)}
          </div>
        </div>
      </div>
      <div className="overflow-auto rounded-[18px] border border-[#E2E8F0] bg-white/65" style={{ height: 980 }}>
        <svg
          width={graphDetailMode === "focus" ? focusLayout?.width ?? width : width}
          height={graphDetailMode === "focus" ? focusLayout?.height ?? height : height}
          className="block"
        >
          <rect
            x={0}
            y={0}
            width={graphDetailMode === "focus" ? focusLayout?.width ?? width : width}
            height={graphDetailMode === "focus" ? focusLayout?.height ?? height : height}
            fill="transparent"
            onClick={() => setSelectedNodeId(null)}
            onDoubleClick={() => setSelectedNodeId(centerNodeId ?? null)}
          />

          {graphDetailMode === "focus" && focusLayout ? (
            <>
              <text x={110} y={46} fill="#1E40AF" fontSize="18" fontWeight="700">
                资金来源
              </text>
              <text x={focusLayout.width - 220} y={46} fill="#1E40AF" fontSize="18" fontWeight="700">
                资金去向
              </text>
              <text x={focusLayout.width / 2} y={46} textAnchor="middle" fill="#0F172A" fontSize="16" fontWeight="700">
                {focusLayout.focalNode.label} · {formatAddressDisplay(focusLayout.focalNode.address)}
              </text>

              {focusLayout.links.map(link => {
                const source = focusLayout.positions.get(link.source);
                const target = focusLayout.positions.get(link.target);
                if (!source || !target) return null;
                const dx = target.x - source.x;
                const dy = target.y - source.y;
                const distance = Math.sqrt(dx * dx + dy * dy) || 1;
                const startX = source.x + (dx / distance) * source.r;
                const startY = source.y + (dy / distance) * source.r;
                const endX = target.x - (dx / distance) * target.r;
                const endY = target.y - (dy / distance) * target.r;
                const labelX = (startX + endX) / 2;
                const labelY = (startY + endY) / 2 - 10;
                const isDirect =
                  link.source === focusLayout.focalNode.id || link.target === focusLayout.focalNode.id;
                const strokeWidth = isDirect ? 2.1 : 1.3;

                return (
                  <g key={link.id}>
                    <path
                      d={`M ${startX} ${startY} L ${endX} ${endY}`}
                      fill="none"
                      stroke={isDirect ? "rgba(37,99,235,0.7)" : "rgba(148,163,184,0.35)"}
                      strokeWidth={strokeWidth}
                      strokeLinecap="round"
                      markerEnd="url(#large-transfer-arrow)"
                    />
                    {isDirect ? (
                      <>
                        <rect x={labelX - 52} y={labelY - 11} width={104} height={22} rx={11} fill="rgba(255,255,255,0.96)" stroke="rgba(148,163,184,0.22)" />
                        <text x={labelX} y={labelY + 2} textAnchor="middle" fill="#0F172A" fontSize="10" fontWeight="700">
                          {compactNumber(link.amount)} · {formatPercent(link.ratioOfSupply ?? 0)}
                        </text>
                      </>
                    ) : null}
                  </g>
                );
              })}
            </>
          ) : (
            renderedLinks.map(link => {
            const source = nodePositions.get(link.source);
            const target = nodePositions.get(link.target);
            if (!source || !target) return null;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const distance = Math.sqrt(dx * dx + dy * dy) || 1;
            const startX = source.x + (dx / distance) * source.r;
            const startY = source.y + (dy / distance) * source.r;
            const endX = target.x - (dx / distance) * target.r;
            const endY = target.y - (dy / distance) * target.r;
            const strokeWidth = 1.5;
            const labelX = (startX + endX) / 2;
            const labelY = (startY + endY) / 2 - 8;
            const isHighlighted =
              !selectedNodeId ||
              link.source === selectedNodeId ||
              link.target === selectedNodeId ||
              primaryNeighbors.has(link.source) ||
              primaryNeighbors.has(link.target) ||
              secondaryNeighbors.has(link.source) ||
              secondaryNeighbors.has(link.target);

            return (
              <g key={link.id}>
                <path
                  d={`M ${startX} ${startY} L ${endX} ${endY}`}
                  fill="none"
                  stroke={isHighlighted ? "rgba(37,99,235,0.6)" : "rgba(148,163,184,0.28)"}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  markerEnd="url(#large-transfer-arrow)"
                />
                {isHighlighted && selectedNodeId ? (
                  <>
                    <rect x={labelX - 58} y={labelY - 12} width={116} height={24} rx={12} fill="rgba(255,255,255,0.94)" stroke="rgba(148,163,184,0.22)" />
                    <text x={labelX} y={labelY - 1} textAnchor="middle" fill="#0F172A" fontSize="10.5" fontWeight="700">
                      {compactNumber(link.amount)} · {formatPercent(link.ratioOfSupply ?? 0)}
                    </text>
                  </>
                ) : null}
              </g>
            );
          }))}

          <defs>
            <marker id="large-transfer-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(37,99,235,0.72)" />
            </marker>
          </defs>

          {(graphDetailMode === "focus" && focusLayout ? nodes.filter(node => focusLayout.positions.has(node.id)) : renderedNodes).map(node => {
            const position =
              graphDetailMode === "focus" && focusLayout
                ? focusLayout.positions.get(node.id)
                : nodePositions.get(node.id);
            if (!position) return null;
            const focusPosition = graphDetailMode === "focus" && focusLayout ? focusLayout.positions.get(node.id) ?? null : null;
            const isSelected = selectedNodeId === node.id;
            const isPrimary = primaryNeighbors.has(node.id);
            const isSecondary = secondaryNeighbors.has(node.id);
            const fade = selectedNodeId && !isSelected && !isPrimary && !isSecondary ? 0.22 : 1;
            const radius = position.r;
            const fill = colorForKind(node.kind);
            const showLabel = graphDetailMode === "focus" ? true : isSelected || isPrimary;
            const focusAnchor =
              focusPosition
                ? focusPosition.side === "left"
                  ? "end"
                  : focusPosition.side === "right"
                    ? "start"
                    : "middle"
                : "middle";
            const focusLabelX =
              focusPosition
                ? focusPosition.side === "left"
                  ? position.x - radius - 10
                  : focusPosition.side === "right"
                    ? position.x + radius + 10
                    : position.x
                : position.x;
            const focusLabelY =
              focusPosition && focusPosition.side === "center"
                ? position.y + radius + 18
                : position.y - 8;
            return (
              <g
                key={node.id}
                style={{ cursor: "pointer", opacity: fade }}
                onClick={event => {
                  event.stopPropagation();
                  setSelectedNodeId(current => (current === node.id ? null : node.id));
                }}
              >
                <circle
                  cx={position.x}
                  cy={position.y}
                  r={radius}
                  fill={fill}
                  fillOpacity={0.9}
                  stroke={isSelected ? "#0F172A" : "#FFFFFF"}
                  strokeWidth={isSelected ? 2.5 : 1.2}
                />
                {showLabel ? (
                  <>
                    <text x={focusLabelX} y={focusLabelY} textAnchor={focusAnchor} fill="#1E3A8A" fontSize={graphDetailMode === "focus" ? 10.5 : 11} fontWeight="700">
                      {node.label}
                    </text>
                    <text
                      x={focusLabelX}
                      y={focusLabelY + 16}
                      textAnchor={focusAnchor}
                      fill="#0F172A"
                      fontSize={graphDetailMode === "focus" ? 11.5 : 12}
                      fontWeight="700"
                      style={{ cursor: "pointer" }}
                      onClick={event => {
                        event.stopPropagation();
                        window.open(formatBscScanAddress(node.address, explorerChainId), "_blank", "noopener,noreferrer");
                      }}
                    >
                      {formatAddressDisplay(node.address)}
                    </text>
                    <text x={focusLabelX} y={focusLabelY + 30} textAnchor={focusAnchor} fill="#64748B" fontSize="10">
                      {compactNumber(node.amount)} · {node.transferCount} 笔
                    </text>
                  </>
                ) : null}
                <title>{`${node.label}\n${node.address}\n${compactNumber(node.amount)} · ${node.transferCount} 笔`}</title>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});

const LargeTransferBilateralCanvas = memo(function LargeTransferBilateralCanvas({
  graph,
  scope,
  explorerChainId = 56,
}: {
  graph: LargeTransferBilateralGraph;
  scope: "dex" | "cex";
  explorerChainId?: number;
}) {
  const { nodesByColumn, nodePositions, canvasWidth, canvasHeight, columnX } = useMemo(() => {
    const columns = [0, 1, 2, 3, 4].map(column =>
      graph.nodes
        .filter(node => node.column === column)
        .sort((left, right) => right.amount - left.amount)
    ) as LargeTransferBilateralNode[][];
    const columnGap = 400;
    const baseX = 80;
    const nodeWidth = 228;
    const topPadding = 90;
    const rowGap = 18;
    const nodeHeight = 72;
    const canvasHeight = Math.max(
      1240,
      ...columns.map(nodes => nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * rowGap + topPadding * 2)
    );
    const canvasWidth = baseX + columnGap * 4 + nodeWidth + 180;
    const columnX = [0, 1, 2, 3, 4].map(index => baseX + index * columnGap);
    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number; node: LargeTransferBilateralNode }>();

    columns.forEach((nodes, columnIndex) => {
      const totalHeight = nodes.length * nodeHeight + Math.max(0, nodes.length - 1) * rowGap;
      let currentY = Math.max(topPadding, canvasHeight / 2 - totalHeight / 2);
      nodes.forEach(node => {
        nodePositions.set(node.id, {
          x: columnX[columnIndex],
          y: currentY,
          width: nodeWidth,
          height: nodeHeight,
          node,
        });
        currentY += nodeHeight + rowGap;
      });
    });

    return {
      nodesByColumn: columns,
      nodePositions,
      canvasWidth,
      canvasHeight,
      columnX,
    };
  }, [graph]);

  const columnTitles =
    scope === "dex"
      ? ["来源二层", "净卖出地址", "DEX 地址", "净买入地址", "去向二层"]
      : ["来源二层", "转入 CEX 前一层", "CEX 地址", "从 CEX 流出地址", "去向二层"];

  const colorForKind = (kind: string, isCenter = false) => {
    if (isCenter) return "#1D4ED8";
    if (/binance|bybit|gate|okx|cex/i.test(kind)) return "#2563EB";
    if (/contract|合约/i.test(kind)) return "#7C3AED";
    return "#60A5FA";
  };

  const colorLegend = [
    { color: "#1D4ED8", label: `${scope === "dex" ? "DEX" : "CEX"} 核心地址` },
    { color: "#2563EB", label: "交易所 / CEX 标签地址" },
    { color: "#7C3AED", label: "合约 / 池子 / Router 地址" },
    { color: "#60A5FA", label: "普通地址 / 未知地址" },
  ];

  return (
    <div className="rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[#0F172A]">{scope === "dex" ? "DEX 大额流向图谱" : "CEX 大额流向图谱"}</div>
          <div className="mt-1 text-xs text-[#64748B]">
            中间为{scope === "dex" ? "DEX" : "CEX"}核心地址，左侧追溯上游来源，右侧查看后续去向。
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748B]">
            {colorLegend.map(item => (
              <span key={item.label} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                {item.label}
              </span>
            ))}
          </div>
          <div className="text-sm text-[#64748B]">
            当前可见地址 {graph.nodes.length} · 当前可见路径 {graph.links.length} · 当前总额 {compactNumber(graph.totalAmount)}
          </div>
        </div>
      </div>

      <div className="overflow-auto rounded-[20px] border border-[#E2E8F0] bg-white" style={{ height: 980 }}>
        <svg width={canvasWidth} height={canvasHeight} className="block">
          <defs>
            <marker id={`bilateral-arrow-${scope}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto">
              <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(37,99,235,0.72)" />
            </marker>
          </defs>

          {columnTitles.map((title, index) => (
            <g key={title}>
              <text x={columnX[index]} y={34} fill="#1E40AF" fontSize="16" fontWeight="700">
                {title}
              </text>
              <text x={columnX[index]} y={54} fill="#64748B" fontSize="11">
                {nodesByColumn[index].length} / {nodesByColumn[index].length} 个地址
              </text>
            </g>
          ))}

          {graph.links.map(link => {
            const source = nodePositions.get(link.source);
            const target = nodePositions.get(link.target);
            if (!source || !target) return null;
            const startX = source.x + source.width;
            const startY = source.y + source.height / 2;
            const endX = target.x;
            const endY = target.y + target.height / 2;
            const controlX = (startX + endX) / 2;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;
            const ratioText = formatPercent(link.ratioOfSupply ?? 0);

            return (
              <g key={link.id}>
                <path
                  d={`M ${startX} ${startY} C ${controlX} ${startY}, ${controlX} ${endY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="rgba(147,197,253,0.55)"
                  strokeWidth={1.7}
                  markerEnd={`url(#bilateral-arrow-${scope})`}
                />
                <rect x={midX - 44} y={midY - 12} width={88} height={24} rx={12} fill="#FFFFFF" opacity={0.97} stroke="rgba(148,163,184,0.18)" />
                <text x={midX} y={midY - 1} textAnchor="middle" fill="#334155" fontSize="9" fontWeight="700">
                  {compactNumber(link.amount, 1)}
                </text>
                <text x={midX} y={midY + 8} textAnchor="middle" fill="#64748B" fontSize="8">
                  {ratioText}
                </text>
              </g>
            );
          })}

          {Array.from(nodePositions.values()).map(({ node, x, y, width, height }) => {
            const isCenter = graph.centerIds.includes(node.id);
            const fill = colorForKind(node.kind, isCenter);
            const titleText = node.label.length > 22 ? `${node.label.slice(0, 22)}…` : node.label;
            const roleText = isCenter
              ? `${scope === "dex" ? "DEX" : "CEX"} 核心地址`
              : node.kind && node.kind !== node.label && node.kind !== "普通地址"
                ? node.kind
                : null;
            return (
              <g key={node.id}>
                <rect x={x} y={y} rx={10} ry={10} width={width} height={height} fill={fill} opacity={0.96} stroke="#FFFFFF" strokeWidth={1} />
                <text x={x + 12} y={y + 20} fill="#FFFFFF" fontSize="10" fontWeight="700">
                  {titleText}
                </text>
                {roleText ? (
                  <text x={x + 12} y={y + 31} fill="#DBEAFE" fontSize="8.5" fontWeight="600">
                    {roleText.length > 26 ? `${roleText.slice(0, 26)}…` : roleText}
                  </text>
                ) : null}
                <text
                  x={x + 12}
                  y={roleText ? y + 48 : y + 40}
                  fill="#FFFFFF"
                  fontSize="11"
                  fontWeight="700"
                  style={{ cursor: "pointer" }}
                  onClick={event => {
                    event.stopPropagation();
                    window.open(formatBscScanAddress(node.address, explorerChainId), "_blank", "noopener,noreferrer");
                  }}
                >
                  {formatAddressDisplay(node.address)}
                </text>
                <text x={x + 12} y={roleText ? y + 64 : y + 56} fill="#DBEAFE" fontSize="9">
                  {compactNumber(node.amount, 1)} · {node.transferCount} 笔
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
});

export default function OnChainBoard() {
  const initialSearchParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialSymbol = (initialSearchParams.get("symbol") ?? "BSB").trim().toUpperCase() || "BSB";
  const initialTab = initialSearchParams.get("tab");
  const initialExpandDate = initialSearchParams.get("expandDate");
  const initialActiveView =
    initialTab === "fund-flow" ||
    initialTab === "holders" ||
    initialTab === "pool-adds" ||
    initialTab === "large-transfers" ||
    initialTab === "cex-flows"
      ? initialTab
      : "overview";
  const initialTrack = initialActiveView === "pool-adds" ? "pool-discovery" : "token-analysis";

  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  const [selectedChainId, setSelectedChainId] = useState<number>(56);
  const [tokenQuery, setTokenQuery] = useState("");
  const [activeTrack, setActiveTrack] = useState<"token-analysis" | "pool-discovery">(initialTrack);
  const [activeView, setActiveView] = useState<"overview" | "fund-flow" | "holders" | "cex-flows" | "pool-adds" | "large-transfers">(initialActiveView);
  const [selectedTokenDetail, setSelectedTokenDetail] = useState<string | null>(null);
  const [selectedPoolRegistryId, setSelectedPoolRegistryId] = useState<string | null>(null);
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [isFlowFullscreenOpen, setIsFlowFullscreenOpen] = useState(false);
  const [flowMinAmount, setFlowMinAmount] = useState(0);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<Set<string>>(new Set());
  const [holderPage, setHolderPage] = useState(1);
  const [poolPage, setPoolPage] = useState(1);
  const [largeTransferSearch, setLargeTransferSearch] = useState("");
  const [largeTransferInput, setLargeTransferInput] = useState("");
  const [largeTransferSortOrder, setLargeTransferSortOrder] = useState<"asc" | "desc">("desc");
  const [largeTransferMode, setLargeTransferMode] = useState<"list" | "graph">("list");
  const [largeTransferScope, setLargeTransferScope] = useState<LargeTransferScope>("all");
  const [trendDays, setTrendDays] = useState<30 | 60 | 90>(30);
  const [visibleTrendKeys, setVisibleTrendKeys] = useState<string[]>(["controlRate", "netFlowRatio"]);
  const [copiedHolderTokenAddress, setCopiedHolderTokenAddress] = useState(false);
  const [copiedLargeTransferAddress, setCopiedLargeTransferAddress] = useState<string | null>(null);
  const [copiedCexTokenAddress, setCopiedCexTokenAddress] = useState(false);
  const [copiedPoolAddsTokenAddress, setCopiedPoolAddsTokenAddress] = useState(false);
  const [expandedCexFlowDates, setExpandedCexFlowDates] = useState<Set<string>>(new Set(initialExpandDate ? [initialExpandDate] : []));
  const [isTokenPickerOpen, setIsTokenPickerOpen] = useState(false);
  const tokenPickerRef = useRef<HTMLDivElement | null>(null);
  const tokenAnalysisTabs = [
    { key: "overview", label: "总览" },
    { key: "fund-flow", label: "资金流图" },
    { key: "holders", label: "Holder" },
    { key: "cex-flows", label: "CEX流入流出" },
    { key: "large-transfers", label: "大额转账" },
  ] as const;
  const onchainTokensQuery = trpc.onchain.listTokens.useQuery(
    { limit: 60, chainId: selectedChainId },
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const onchainPoolsQuery = trpc.onchain.listPools.useQuery(
    { page: poolPage, pageSize: 100, query: activeTrack === "pool-discovery" ? tokenQuery.trim() || undefined : undefined },
    {
      enabled: activeTrack === "pool-discovery",
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const overviewQuery = trpc.onchain.getOverview.useQuery(
    {
      symbol: selectedSymbol,
      tokenId: selectedTokenId ?? undefined,
      chainId: selectedChainId,
    },
    {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const fundFlowQuery = trpc.onchain.getFundFlow.useQuery(
    {
      symbol: selectedSymbol,
      tokenId: selectedTokenId ?? undefined,
      chainId: selectedChainId,
      depth: 7,
      limitPerLayer: 36,
    },
    {
      enabled: activeView === "fund-flow" || activeView === "large-transfers",
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const holdersQuery = trpc.onchain.getHolders.useQuery(
    {
      symbol: selectedSymbol,
      tokenId: selectedTokenId ?? undefined,
      chainId: selectedChainId,
      page: holderPage,
      pageSize: 100,
    },
    {
      enabled: activeView === "holders",
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const largeTransfersQuery = trpc.onchain.getLargeTransfers.useQuery(
    {
      symbol: selectedSymbol,
      tokenId: selectedTokenId ?? undefined,
      chainId: selectedChainId,
      page: 1,
      pageSize: 500,
      search: largeTransferSearch || undefined,
      sortOrder: largeTransferSortOrder,
    },
    {
      enabled: activeView === "large-transfers",
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const cexFlowsQuery = trpc.onchain.getCexFlows.useQuery(
    {
      symbol: selectedSymbol,
      tokenId: selectedTokenId ?? undefined,
      chainId: selectedChainId,
    },
    {
      enabled: activeView === "cex-flows",
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    }
  );
  const poolAddsQuery = trpc.onchain.getPoolAdds.useQuery(
    {
      symbol: selectedSymbol,
      tokenId: selectedTokenId ?? undefined,
      chainId: selectedChainId,
    },
    {
      enabled: activeTrack === "token-analysis" && activeView === "pool-adds" && selectedSymbol.trim().length > 0,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    }
  );
  const poolAddsByPoolQuery = trpc.onchain.getPoolAddsByPool.useQuery(
    {
      poolRegistryId: selectedPoolRegistryId ?? "",
    },
    {
      enabled: activeTrack === "pool-discovery" && activeView === "pool-adds" && selectedPoolRegistryId != null,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    }
  );

  const initialFlowAddressSet = useMemo(
    () => new Set((fundFlowQuery.data?.nodes ?? []).map(node => node.address.toLowerCase())),
    [fundFlowQuery.data?.nodes]
  );
  const scopedLargeTransferItems = useMemo(
    () =>
      buildScopedLargeTransferItems(
        (largeTransfersQuery.data?.items as LargeTransferRecord[] | undefined) ?? [],
        largeTransferScope,
        initialFlowAddressSet
      ),
    [largeTransfersQuery.data?.items, largeTransferScope, initialFlowAddressSet]
  );
  const scopedLargeTransferGraphItems = useMemo(
    () =>
      largeTransferScope === "dex" || largeTransferScope === "cex"
        ? buildNetTransferItems(scopedLargeTransferItems)
        : scopedLargeTransferItems,
    [scopedLargeTransferItems, largeTransferScope]
  );

  const largeTransferGraph = useMemo(() => {
    if (!scopedLargeTransferGraphItems.length) return null;
    return buildLargeTransferGraph(scopedLargeTransferGraphItems);
  }, [scopedLargeTransferGraphItems]);
  const largeTransferBilateralGraph = useMemo(() => {
    if (largeTransferScope !== "dex" && largeTransferScope !== "cex") return null;
    if (!scopedLargeTransferItems.length) return null;
    return buildLargeTransferBilateralGraph(scopedLargeTransferItems, largeTransferScope);
  }, [scopedLargeTransferItems, largeTransferScope]);

  const flowTokenOptions = useMemo<OnchainTokenOption[]>(() => {
    const items = onchainTokensQuery.data?.items ?? [];
    if (items.length > 0) {
      return items.map(item => ({
        symbol: item.symbol,
        name: item.name,
        tokenId: item.tokenId,
        chainId: item.chainId ?? selectedChainId,
        transferCount: item.transferCount,
        holderCount: item.holderCount,
        dexActionCount: item.dexActionCount,
      }));
    }

    if (onchainTokensQuery.isLoading) {
      return [];
    }

    return fallbackOnchainTokenOptions.filter(item => item.chainId === selectedChainId);
  }, [onchainTokensQuery.data?.items, onchainTokensQuery.isLoading, selectedChainId]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    if (isFlowFullscreenOpen) {
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFlowFullscreenOpen]);

  useEffect(() => {
    if (!isFlowFullscreenOpen || typeof window === "undefined") return undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFlowFullscreenOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFlowFullscreenOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (!tokenPickerRef.current?.contains(event.target as Node)) {
        setIsTokenPickerOpen(false);
      }
    };
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (flowTokenOptions.length === 0) return;
    const hasSelected = flowTokenOptions.some(
      token =>
        token.symbol === selectedSymbol &&
        (selectedTokenId == null || token.tokenId === selectedTokenId) &&
        token.chainId === selectedChainId
    );
    if (!hasSelected) {
      setSelectedSymbol(flowTokenOptions[0].symbol);
      setSelectedTokenId(flowTokenOptions[0].tokenId);
    }
  }, [flowTokenOptions, selectedChainId, selectedSymbol, selectedTokenId]);

  const selectedTokenMeta =
    flowTokenOptions.find(
      item =>
        item.symbol === selectedSymbol &&
        item.chainId === selectedChainId &&
        (selectedTokenId == null || item.tokenId === selectedTokenId)
    ) ?? flowTokenOptions[0];
  const isTokenDetailOpen = activeTrack === "token-analysis" && selectedTokenDetail !== null;
  const isPoolDetailOpen =
    activeTrack === "pool-discovery" &&
    (selectedPoolRegistryId !== null || selectedPoolId !== null);
  const recommendedFlowTokens = flowTokenOptions.slice(0, 3);
  const dashboard =
    tokenDashboards.find(item => item.symbol === selectedSymbol) ??
    tokenDashboards.find(item => item.symbol === selectedTokenMeta?.symbol) ??
    tokenDashboards[0];
  const latestDashboardDate = dashboardDates[0];
  const snapshot = dashboard.dates[latestDashboardDate] ?? dashboard.dates["2026-04-15"];
  const overview = overviewQuery.data;
  const overviewIsLoading =
    activeView === "overview" && (overviewQuery.isLoading || (!overviewQuery.data && !overviewQuery.error));
  const overviewHasError = activeView === "overview" && !!overviewQuery.error;
  const trendWindow = dashboard.trend90d.slice(-trendDays);

  const overviewTokenName = overview?.name ?? snapshot.tokenName;
  const overviewTokenSymbol = overview?.symbol ?? snapshot.tokenSymbol;
  const overviewPriceUsd = overview?.currentPrice ?? snapshot.priceUsd;
  const overviewPriceChange24h = overview?.priceChange24h ?? snapshot.priceChange24h;
  const overviewTotalSupply = overview?.totalSupply ?? snapshot.totalSupply;
  const overviewCirculatingSupply = overview?.circulatingSupply ?? snapshot.circulatingSupply;
  const overviewMarketCap = overview?.marketCap ?? snapshot.marketCap;
  const overviewFdv = overview?.fdv ?? snapshot.fdv;
  const overviewHolderCount = overview?.tokenHolderCount ?? snapshot.holderCount;
  const overviewHolderDelta =
    overview?.holderCountChange24h ??
    (snapshot.holderCountChange1d / Math.max(snapshot.holderCount - snapshot.holderCountChange1d, 1)) * 100;
  const overviewLogo = overviewTokenSymbol.slice(0, 1).toUpperCase() || dashboard.logo;
  const overviewTop10Balance = overview?.top10Balance ?? snapshot.top10Balance;
  const overviewTop10Ratio = overview?.top10Ratio ?? snapshot.top10Ratio;
  const overviewTop50Balance = overview?.top50Balance ?? snapshot.top50Balance;
  const overviewTop50Ratio = overview?.top50Ratio ?? snapshot.top50Ratio;
  const overviewTop100Balance = overview?.top100Balance ?? snapshot.top100Balance;
  const overviewTop100Ratio = overview?.top100Ratio ?? snapshot.top100Ratio;
  const overviewIncreaseRows =
    overview?.increaseRows && overview.increaseRows.length > 0
      ? overview.increaseRows.map(row => ({
          address: formatAddressDisplay(row.address),
          label: row.label,
          changeBalance: row.changeBalance,
          currentBalance: row.currentBalance ?? undefined,
          firstSeen: row.firstSeen ?? "—",
          href: formatBscScanAddress(row.address, selectedChainId),
        }))
      : snapshot.increaseRows;
  const overviewDecreaseRows =
    overview?.decreaseRows && overview.decreaseRows.length > 0
      ? overview.decreaseRows.map(row => ({
          address: formatAddressDisplay(row.address),
          label: row.label,
          changeBalance: row.changeBalance,
          currentBalance: row.currentBalance ?? undefined,
          href: formatBscScanAddress(row.address, selectedChainId),
        }))
      : snapshot.decreaseRows;

  const controlSpark = seriesSlice(dashboard.trend90d, "controlRate", 7).map(item => item.value);
  const whaleSpark = seriesSlice(dashboard.trend90d, "whaleNetOutflow", 7).map(item => item.value);
  const holderTrendData =
    overview?.holderHistory && overview.holderHistory.length > 0
      ? overview.holderHistory.map(point => ({
          date: point.snapshotDate.slice(5),
          holderCount: point.holderCount,
        }))
      : dashboard.trend90d.slice(-30).map(point => ({
          date: point.shortDate,
          holderCount: point.holderCount,
        }));
  const controlRateTrendData = dashboard.trend90d.slice(-30).map(point => ({
    date: point.shortDate,
    controlRate: point.controlRate,
  }));

  const topNData = [
    { name: "Top 10", ratio: snapshot.top10Ratio, color: "#1D4ED8" },
    { name: "11-50", ratio: Number((snapshot.top50Ratio - snapshot.top10Ratio).toFixed(2)), color: "#3B82F6" },
    { name: "51-100", ratio: Number((snapshot.top100Ratio - snapshot.top50Ratio).toFixed(2)), color: "#93C5FD" },
    { name: "Others", ratio: snapshot.othersRatio, color: "#E2E8F0" },
  ];

  const exchangeHistoryData = trendWindow.map(point => ({
    date: point.shortDate,
    value: point.exchangeNetFlow,
    fill: point.exchangeNetFlow >= 0 ? RISE_RED : FALL_GREEN,
  }));

  const dexCompareData = [
    { name: "买入", value: snapshot.totalBuyVolume, fill: RISE_RED },
    { name: "卖出", value: snapshot.totalSellVolume, fill: FALL_GREEN },
  ];
  const dexTrendData = trendWindow.map((point, index) => {
    const base = 18_000_000 + index * 120_000;
    const buyVolume = Math.round(base * point.dexAccIdx);
    const sellVolume = Math.round(base * (2.02 - point.dexAccIdx));
    return {
      date: point.shortDate,
      buyVolume,
      sellVolume,
    };
  });

  const whaleFlowData = [
    {
      name: "今日流向",
      交易所: snapshot.whaleToExchange,
      新地址: snapshot.whaleToNewAddress,
      "DEX Router": snapshot.whaleToDexRouter,
      内部转账: snapshot.whaleInternalTransfer,
    },
  ];

  const combinedTrendData = trendWindow.map(point => ({
    date: point.shortDate,
    controlRate: point.controlRate,
    netFlowRatio: point.netFlowRatio,
    whaleNetOutflow: point.whaleNetOutflow,
  }));

  const normalizedTokenQuery = tokenQuery.trim().toLowerCase();
  const tokenMatches = flowTokenOptions.filter(token => {
    if (!normalizedTokenQuery) return true;
    const exactSelected =
      token.symbol.toLowerCase() === selectedSymbol.toLowerCase() &&
      normalizedTokenQuery === selectedSymbol.toLowerCase() &&
      token.chainId === selectedChainId;
    if (exactSelected) return true;
    return token.symbol.toLowerCase().includes(normalizedTokenQuery) || token.name.toLowerCase().includes(normalizedTokenQuery);
  });
  const visibleTokenOptions =
    isTokenPickerOpen && normalizedTokenQuery === selectedSymbol.toLowerCase() ? flowTokenOptions : tokenMatches;
  const filteredTokenList = tokenMatches;
  const filteredPoolList = onchainPoolsQuery.data?.items ?? [];
  const selectedPool = useMemo(() => {
    const items = onchainPoolsQuery.data?.items ?? [];
    return (
      items.find(item => item.poolRegistryId === selectedPoolRegistryId) ??
      items.find(item => item.poolId === selectedPoolId) ??
      null
    );
  }, [onchainPoolsQuery.data?.items, selectedPoolId, selectedPoolRegistryId]);
  const fundFlowGraph: FlowGraph = fundFlowQuery.data
    ? {
        nodes: fundFlowQuery.data.nodes,
        links: fundFlowQuery.data.links.map(link => ({
          source: link.source,
          target: link.target,
          amount: link.amount,
        })),
        summaries: fundFlowQuery.data.summaries,
        totalAmount: fundFlowQuery.data.totalAmount,
      }
    : {
        nodes: [],
        links: [],
        summaries: [
          { layer: 0, title: "0 地址", count: 0, totalAmount: 0 },
          { layer: 1, title: "第一层", count: 0, totalAmount: 0 },
          { layer: 2, title: "第二层", count: 0, totalAmount: 0 },
          { layer: 3, title: "第三层", count: 0, totalAmount: 0 },
          { layer: 4, title: "第四层", count: 0, totalAmount: 0 },
          { layer: 5, title: "第五层", count: 0, totalAmount: 0 },
          { layer: 6, title: "第六层", count: 0, totalAmount: 0 },
          { layer: 7, title: "第七层", count: 0, totalAmount: 0 },
        ],
        totalAmount: 0,
      };
  const hasFundFlowResult = Boolean(fundFlowQuery.data);
  const hasFundFlowNodes = fundFlowGraph.nodes.length > 0;
  const initialLargeFlowGraph: FlowGraph = useMemo(() => {
    if (!fundFlowQuery.data || !largeTransfersQuery.data?.thresholdAmount) {
      return {
        nodes: [],
        links: [],
        summaries: fundFlowGraph.summaries,
        totalAmount: 0,
      };
    }
    const threshold = largeTransfersQuery.data.thresholdAmount;
    const visibleLinks = fundFlowQuery.data.links.filter(link => link.amount >= threshold);
    const visibleNodeIds = new Set<string>();
    visibleLinks.forEach(link => {
      visibleNodeIds.add(link.source);
      visibleNodeIds.add(link.target);
    });
    const visibleNodes = fundFlowQuery.data.nodes.filter(node => visibleNodeIds.has(node.id));
    const summaries = fundFlowQuery.data.summaries.map(summary => {
      const layerNodes = visibleNodes.filter(node => node.layer === summary.layer);
      return {
        ...summary,
        count: layerNodes.length,
        totalAmount: layerNodes.reduce((sum, node) => sum + node.amount, 0),
      };
    });
    return {
      nodes: visibleNodes,
      links: visibleLinks.map(link => ({
        source: link.source,
        target: link.target,
        amount: link.amount,
      })),
      summaries,
      totalAmount: visibleLinks.reduce((sum, link) => sum + link.amount, 0),
    };
  }, [fundFlowQuery.data, largeTransfersQuery.data?.thresholdAmount, fundFlowGraph.summaries]);

  useEffect(() => {
    setCollapsedNodeIds(new Set());
    setFlowMinAmount(0);
  }, [selectedSymbol]);

  useEffect(() => {
    setHolderPage(1);
  }, [selectedSymbol]);

  useEffect(() => {
    setPoolPage(1);
  }, [activeTrack, tokenQuery]);

  useEffect(() => {
    setLargeTransferSearch("");
    setLargeTransferInput("");
    setLargeTransferSortOrder("desc");
    setLargeTransferScope("all");
    setCopiedLargeTransferAddress(null);
  }, [selectedSymbol]);
  useEffect(() => {
    setExpandedCexFlowDates(new Set());
    setCopiedCexTokenAddress(false);
    setCopiedPoolAddsTokenAddress(false);
  }, [selectedSymbol]);

  const handleRefresh = () => {
    fundFlowQuery.refetch();
    if (activeView === "cex-flows") {
      cexFlowsQuery.refetch();
    }
    if (activeView === "pool-adds") {
      poolAddsQuery.refetch();
    }
  };

  useEffect(() => {
    if (activeView === "pool-adds" && selectedSymbol.trim().length > 0) {
      void poolAddsQuery.refetch();
    }
  }, [activeView, selectedSymbol]);

  const handleCopyHolderTokenAddress = async () => {
    if (!holdersQuery.data?.tokenAddress) return;
    try {
      await navigator.clipboard.writeText(holdersQuery.data.tokenAddress);
      setCopiedHolderTokenAddress(true);
      window.setTimeout(() => setCopiedHolderTokenAddress(false), 1200);
    } catch {
      setCopiedHolderTokenAddress(false);
    }
  };

  const handleTokenSearch = () => {
    if (activeTrack === "token-analysis") {
      const match = tokenMatches[0];
      if (match) {
        setSelectedSymbol(match.symbol);
        setSelectedTokenId(match.tokenId);
        setTokenQuery(match.symbol);
        setSelectedTokenDetail(`${match.chainId ?? selectedChainId}:${match.tokenId}`);
        setActiveView("overview");
        setIsTokenPickerOpen(false);
      }
      return;
    }

    if (activeTrack === "pool-discovery") {
      const firstPool = filteredPoolList[0];
      if (firstPool) {
        const nextSymbol =
          (firstPool.coreTokenSymbol && firstPool.coreTokenSymbol.trim()) ||
          (firstPool.token0Symbol && firstPool.token0Symbol.trim()) ||
          selectedSymbol;
        setSelectedPoolRegistryId(firstPool.poolRegistryId);
        setSelectedSymbol(nextSymbol.toUpperCase());
        setTokenQuery(nextSymbol.toUpperCase());
        setActiveView("pool-adds");
      }
    }
  };

  const handleSelectChain = (chainId: number) => {
    setSelectedChainId(chainId);
    setSelectedTokenId(null);
    setSelectedTokenDetail(null);
    setSelectedSymbol("");
    setTokenQuery("");
    setIsTokenPickerOpen(false);
    setActiveTrack("token-analysis");
    setActiveView("overview");
  };

  const handleSelectToken = (token: OnchainTokenOption) => {
    setSelectedSymbol(token.symbol);
    setSelectedTokenId(token.tokenId);
    setTokenQuery(token.symbol);
    setIsTokenPickerOpen(false);
    setActiveTrack("token-analysis");
    setSelectedTokenDetail(`${token.chainId ?? selectedChainId}:${token.tokenId}`);
    setSelectedPoolRegistryId(null);
    setActiveView("overview");
  };

  const handleLargeTransferSearch = () => {
    setLargeTransferSearch(largeTransferInput.trim());
  };

  const handleCopyLargeTransferAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedLargeTransferAddress(address);
      window.setTimeout(() => {
        setCopiedLargeTransferAddress(current => (current === address ? null : current));
      }, 1200);
    } catch {
      setCopiedLargeTransferAddress(null);
    }
  };

  const handleCopyCexTokenAddress = async () => {
    if (!cexFlowsQuery.data?.tokenAddress) return;
    try {
      await navigator.clipboard.writeText(cexFlowsQuery.data.tokenAddress);
      setCopiedCexTokenAddress(true);
      window.setTimeout(() => setCopiedCexTokenAddress(false), 1200);
    } catch {
      setCopiedCexTokenAddress(false);
    }
  };

  const handleCopyPoolAddsTokenAddress = async () => {
    if (!poolAddsQuery.data?.tokenAddress) return;
    try {
      await navigator.clipboard.writeText(poolAddsQuery.data.tokenAddress);
      setCopiedPoolAddsTokenAddress(true);
      window.setTimeout(() => setCopiedPoolAddsTokenAddress(false), 1200);
    } catch {
      setCopiedPoolAddsTokenAddress(false);
    }
  };

  const toggleExpandedCexDate = (date: string) => {
    setExpandedCexFlowDates(current => {
      const next = new Set(current);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  const toggleCollapsedNode = (nodeId: string) => {
    setCollapsedNodeIds(current => {
      const next = new Set(current);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="space-y-3 px-1">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "token-analysis", label: "代币分析", description: "围绕 Binance Alpha 代币查看链上分析详情" },
            { key: "pool-discovery", label: "池子发现", description: "围绕 Pancake 新池发现更早的交易与加池机会" },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => {
                const nextTrack = item.key as "token-analysis" | "pool-discovery";
                setActiveTrack(nextTrack);
                setIsTokenPickerOpen(false);
                if (nextTrack === "token-analysis") {
                  setSelectedPoolRegistryId(null);
                  setSelectedTokenDetail(null);
                  setTokenQuery("");
                  setActiveView("overview");
                } else {
                  setSelectedTokenDetail(null);
                  setSelectedPoolRegistryId(null);
                  setTokenQuery("");
                  setActiveView("pool-adds");
                }
              }}
              className={cn(
                "rounded-[20px] border px-4 py-3 text-left transition",
                activeTrack === item.key
                  ? "border-[#BFDBFE] bg-[#EFF6FF] shadow-[0_8px_18px_rgba(30,64,175,0.12)]"
                  : "border-white/80 bg-white text-[#475569] hover:bg-[#F8FBFF]"
              )}
            >
              <div className={cn("text-sm font-semibold", activeTrack === item.key ? "text-[#1E40AF]" : "text-[#0F172A]")}>{item.label}</div>
              <div className="mt-1 text-xs text-[#64748B]">{item.description}</div>
            </button>
          ))}
        </div>
      </div>

      {!((activeTrack === "token-analysis" && isTokenDetailOpen) || (activeTrack === "pool-discovery" && isPoolDetailOpen)) ? (
      <section className="rounded-[28px] border border-white/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(239,246,255,0.88))] p-5 shadow-[0_16px_40px_rgba(30,64,175,0.08)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="page-title text-[#0F172A]">{activeTrack === "token-analysis" ? "代币分析" : "池子发现"}</h1>
          </div>

          {!isTokenDetailOpen && !isPoolDetailOpen ? (
          <div className={cn("grid gap-3 xl:items-center", activeTrack === "token-analysis" ? "md:grid-cols-[minmax(0,420px)_220px_auto_auto]" : "md:grid-cols-[minmax(0,420px)_auto_auto]")}>
            <div ref={tokenPickerRef} className="relative min-w-[280px]">
              <label className="flex items-center gap-3 rounded-[18px] border border-[#DBEAFE] bg-white px-4 py-3 text-sm shadow-[0_6px_18px_rgba(148,163,184,0.08)]">
                <Search className="h-4 w-4 text-[#64748B]" />
                <input
                  value={tokenQuery}
                  onFocus={() => {
                    if (activeTrack === "token-analysis") setIsTokenPickerOpen(true);
                  }}
                  onChange={event => {
                    setTokenQuery(event.target.value);
                    if (activeTrack === "token-analysis") setIsTokenPickerOpen(true);
                  }}
                  onKeyDown={event => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleTokenSearch();
                    }
                    if (event.key === "Escape") {
                      setIsTokenPickerOpen(false);
                    }
                  }}
                  placeholder={activeTrack === "token-analysis" ? "搜索或选择代币 Symbol / 名称" : "搜索池子本币 / 配对币 / 池子地址"}
                  className="w-full bg-transparent font-medium text-[#0F172A] outline-none"
                />
                {activeTrack === "token-analysis" ? (
                  <button
                    type="button"
                    onClick={() => setIsTokenPickerOpen(open => !open)}
                    className="shrink-0 text-[#64748B] transition hover:text-[#1D4ED8]"
                    aria-label="展开代币下拉"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isTokenPickerOpen && "rotate-180")} />
                  </button>
                ) : null}
              </label>

              {activeTrack === "token-analysis" && isTokenPickerOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-30 overflow-hidden rounded-[20px] border border-[#DBEAFE] bg-white shadow-[0_20px_40px_rgba(15,23,42,0.12)]">
                  <div className="flex items-center justify-between border-b border-[#EFF6FF] px-4 py-2 text-xs text-[#64748B]">
                    <span>可下拉选择链上有数据的代币</span>
                    <span>{visibleTokenOptions.length} 个结果</span>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto py-2">
                    {visibleTokenOptions.length > 0 ? (
                      visibleTokenOptions.slice(0, 20).map(token => (
                        <button
                          key={`${token.chainId ?? "na"}-${token.tokenId}`}
                          type="button"
                          onClick={() => handleSelectToken(token)}
                          className={cn(
                            "flex w-full items-center justify-between px-4 py-2.5 text-left transition hover:bg-[#F8FBFF]",
                            token.symbol === selectedSymbol &&
                              token.tokenId === selectedTokenMeta?.tokenId &&
                              token.chainId === selectedChainId &&
                              "bg-[#EFF6FF]"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-[#0F172A]">{token.symbol}</div>
                            <div className="truncate text-xs text-[#64748B]">
                              {token.name}
                              {token.chainId != null ? ` · ${ONCHAIN_CHAIN_OPTIONS.find(option => option.id === token.chainId)?.label ?? token.chainId}` : ""}
                            </div>
                          </div>
                          <div className="ml-4 shrink-0 text-right text-[11px] text-[#94A3B8]">
                            <div>{token.transferCount.toLocaleString()} transfers</div>
                            <div>{token.holderCount.toLocaleString()} holders</div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-sm text-[#64748B]">没有匹配的代币，试试别的 symbol 或名称。</div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {activeTrack === "token-analysis" ? (
              <div className="flex h-[50px] items-center gap-2 rounded-[18px] border border-[#DBEAFE] bg-white px-2 shadow-[0_6px_18px_rgba(148,163,184,0.08)]">
                {ONCHAIN_CHAIN_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => handleSelectChain(option.id)}
                    className={cn(
                      "rounded-full px-3 py-2 text-sm font-medium transition",
                      selectedChainId === option.id
                        ? "bg-[#1E40AF] text-white shadow-[0_8px_18px_rgba(30,64,175,0.20)]"
                        : "text-[#475569] hover:bg-[#EFF6FF]"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}

            <Button className="h-[50px] rounded-[18px] bg-[#1E40AF] px-5 hover:bg-[#1D4ED8]" onClick={handleTokenSearch}>
              <Search className="mr-2 h-4 w-4" />
              搜索
            </Button>

            <Button className="h-[50px] rounded-[18px] bg-[#1E40AF] px-5 hover:bg-[#1D4ED8]" onClick={handleRefresh}>
              <RefreshCw className="mr-2 h-4 w-4" />
              刷新
            </Button>
          </div>
          ) : null}
        </div>

        {activeTrack === "token-analysis" && isTokenDetailOpen ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#64748B]">
          {tokenMatches.slice(0, 3).map(token => (
            <button
              key={`${token.chainId ?? "na"}-${token.tokenId}`}
              onClick={() => handleSelectToken(token)}
              className={cn(
                "rounded-full px-3 py-1.5 transition",
                token.symbol === selectedSymbol && token.tokenId === selectedTokenMeta?.tokenId && token.chainId === selectedChainId
                  ? "bg-[#DBEAFE] text-[#1D4ED8]"
                  : "bg-white text-[#475569]"
              )}
            >
              {token.symbol} · {token.name}
            </button>
          ))}
        </div>
        ) : null}
      </section>
      ) : null}

      <div className="space-y-3 px-1">
        {((activeTrack === "token-analysis" && isTokenDetailOpen) || (activeTrack === "pool-discovery" && isPoolDetailOpen)) ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="rounded-full bg-[#1E40AF] text-white hover:bg-[#1D4ED8]"
            onClick={() => {
              if (activeTrack === "token-analysis") {
                setSelectedTokenDetail(null);
                setTokenQuery("");
                setActiveView("overview");
              } else {
                setSelectedPoolRegistryId(null);
                setSelectedPoolId(null);
                setTokenQuery("");
                setActiveView("pool-adds");
              }
            }}
          >
            返回列表
          </Button>
          <div className="text-sm text-[#64748B]">
            {activeTrack === "token-analysis"
              ? `${selectedTokenMeta?.symbol ?? selectedSymbol} · 代币详情`
              : `${selectedPool?.coreTokenSymbol ?? selectedPool?.token0Symbol ?? "池子"} · 池子详情`}
          </div>
        </div>
        ) : null}

        {(activeTrack === "token-analysis" && isTokenDetailOpen) ? (
        <div className="flex flex-wrap gap-2">
          {[...tokenAnalysisTabs, { key: "pool-adds", label: "加池记录" } as const].map(item => (
          <button
            key={item.key}
            onClick={() => setActiveView(item.key as "overview" | "fund-flow" | "holders" | "cex-flows" | "pool-adds" | "large-transfers")}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition",
              activeView === item.key
                ? "bg-[#1E40AF] text-white shadow-[0_8px_18px_rgba(30,64,175,0.24)]"
                : "bg-white text-[#475569] hover:bg-[#EFF6FF]"
            )}
          >
            {item.label}
          </button>
        ))}
        </div>
        ) : null}
      </div>

      {activeTrack === "token-analysis" && !isTokenDetailOpen ? (
        <section className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">代币列表</h2>
              <p className="mt-1 text-sm text-[#64748B]">按 Binance Alpha 代币维度进入链上分析详情。</p>
            </div>
            <div className="text-xs text-[#64748B]">
              {onchainTokensQuery.isLoading ? "加载中..." : `${flowTokenOptions.length} 个代币`}
            </div>
          </div>
          <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead>代币</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead className="text-right">Transfer</TableHead>
                  <TableHead className="text-right">Holder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onchainTokensQuery.isLoading && filteredTokenList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-28 text-center text-sm text-[#64748B]">
                      正在加载代币列表...
                    </TableCell>
                  </TableRow>
                ) : filteredTokenList.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-28 text-center text-sm text-[#64748B]">
                      暂无代币数据
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTokenList.map(token => (
                    <TableRow
                      key={`${token.chainId ?? "na"}-${token.tokenId}`}
                      role="button"
                      tabIndex={0}
                      className="cursor-pointer transition hover:bg-[#F8FAFC] focus-visible:bg-[#EFF6FF] focus-visible:outline-none"
                      onClick={() => handleSelectToken(token)}
                      onKeyDown={event => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectToken(token);
                        }
                      }}
                    >
                      <TableCell className="font-semibold text-[#0F172A]">{token.symbol}</TableCell>
                      <TableCell className="text-[#475569]">{token.name}</TableCell>
                      <TableCell className="text-right">{token.transferCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{token.holderCount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : activeTrack === "pool-discovery" && !isPoolDetailOpen ? (
        <section className="rounded-[24px] border border-white/80 bg-white/90 p-5 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-[#0F172A]">池子列表</h2>
              <p className="mt-1 text-sm text-[#64748B]">按 Pancake 新池维度做早期发现，查看核心本币、配对币与开盘信息。</p>
              <p className="mt-1 text-xs text-[#94A3B8]">搜索会在全部池子数据里执行，并按建池/开盘时间倒序返回。</p>
            </div>
            <div className="text-xs text-[#64748B]">
              {onchainPoolsQuery.isLoading
                ? "加载中..."
                : `${onchainPoolsQuery.data?.total ?? onchainPoolsQuery.data?.items.length ?? 0} 个池子`}
            </div>
          </div>
          <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#F8FAFC]">
                  <TableHead>核心本币</TableHead>
                  <TableHead>配对币</TableHead>
                  <TableHead>加时间锁时间</TableHead>
                  <TableHead>建池时间</TableHead>
                  <TableHead>开盘时间</TableHead>
                  <TableHead>首次加池</TableHead>
                  <TableHead className="text-right">首次价格</TableHead>
                  <TableHead>DEX</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {onchainPoolsQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-[#64748B]">池子列表加载中...</TableCell>
                  </TableRow>
                ) : onchainPoolsQuery.error ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-[#DC2626]">
                      池子列表加载失败
                      {onchainPoolsQuery.error.message ? `：${onchainPoolsQuery.error.message}` : ""}
                    </TableCell>
                  </TableRow>
                ) : filteredPoolList.length ? (
                  filteredPoolList.map(pool => {
                    const nextSymbol =
                      (pool.coreTokenSymbol && pool.coreTokenSymbol.trim()) ||
                      (pool.token0Symbol && pool.token0Symbol.trim()) ||
                      selectedSymbol;
                    return (
                      <TableRow
                        key={`${pool.poolRegistryId}-${pool.poolAddress ?? pool.poolId ?? "pool"}`}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer transition hover:bg-[#F8FAFC] focus-visible:bg-[#EFF6FF] focus-visible:outline-none"
                        onClick={() => {
                          setSelectedPoolRegistryId(pool.poolRegistryId);
                          setSelectedPoolId(pool.poolId);
                          setSelectedSymbol(nextSymbol.toUpperCase());
                          setTokenQuery(nextSymbol.toUpperCase());
                          setActiveTrack("pool-discovery");
                          setActiveView("pool-adds");
                        }}
                        onKeyDown={event => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedPoolRegistryId(pool.poolRegistryId);
                            setSelectedPoolId(pool.poolId);
                            setSelectedSymbol(nextSymbol.toUpperCase());
                            setTokenQuery(nextSymbol.toUpperCase());
                            setActiveTrack("pool-discovery");
                            setActiveView("pool-adds");
                          }
                        }}
                      >
                        <TableCell className="font-semibold text-[#0F172A]">{pool.coreTokenSymbol ?? pool.token0Symbol ?? "—"}</TableCell>
                        <TableCell className="text-[#475569]">{pool.quoteTokenSymbol ?? pool.token1Symbol ?? "—"}</TableCell>
                        <TableCell>{pool.poolLockTime ? formatShanghaiDateTime(pool.poolLockTime) : "—"}</TableCell>
                        <TableCell>{pool.poolCreatedTime ? formatShanghaiDateTime(pool.poolCreatedTime) : "—"}</TableCell>
                        <TableCell>{pool.startedTime ? formatShanghaiDateTime(pool.startedTime) : "—"}</TableCell>
                        <TableCell>{pool.firstAddLiquidityTime ? formatShanghaiDateTime(pool.firstAddLiquidityTime) : "—"}</TableCell>
                        <TableCell className="text-right">{pool.firstAddPrice != null ? compactNumber(pool.firstAddPrice, 6) : "—"}</TableCell>
                        <TableCell>{pool.dexName ?? "Pancake"}</TableCell>
                      </TableRow>
                    );
                  })
                ) : normalizedTokenQuery ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-[#64748B]">当前搜索条件下没有匹配的池子</TableCell>
                  </TableRow>
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-sm text-[#64748B]">当前暂无池子发现数据。</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="mt-4 flex items-center justify-end gap-3">
            <div className="text-sm text-[#64748B]">
              {onchainPoolsQuery.data
                ? `${onchainPoolsQuery.data.page} / ${Math.max(1, Math.ceil(onchainPoolsQuery.data.total / onchainPoolsQuery.data.pageSize))}`
                : "—"}
            </div>
            <Button
              variant="secondary"
              className="rounded-full"
              disabled={poolPage <= 1}
              onClick={() => setPoolPage(current => Math.max(1, current - 1))}
            >
              上一页
            </Button>
            <Button
              variant="secondary"
              className="rounded-full"
              disabled={
                !onchainPoolsQuery.data ||
                poolPage >= Math.max(1, Math.ceil(onchainPoolsQuery.data.total / onchainPoolsQuery.data.pageSize))
              }
              onClick={() =>
                setPoolPage(current =>
                  onchainPoolsQuery.data
                    ? Math.min(Math.max(1, Math.ceil(onchainPoolsQuery.data.total / onchainPoolsQuery.data.pageSize)), current + 1)
                    : current
                )
              }
            >
              下一页
            </Button>
          </div>
        </section>
      ) : null}

      {activeTrack === "token-analysis" && isTokenDetailOpen && activeView === "fund-flow" ? (
        <div className="space-y-6">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {fundFlowGraph.summaries.map(summary => (
              <Card key={summary.layer} className="min-w-[170px] flex-1 rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">{summary.title}</div>
                  <div className="mt-1 text-xl font-semibold text-[#0F172A]">{summary.count}</div>
                  <div className="mt-1 text-xs text-[#475569]">流转 {compactNumber(summary.totalAmount)}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="rounded-[18px] border border-[#DBEAFE] bg-[#F8FBFF] px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1D4ED8]">金额筛选</div>
                <div className="mt-1 text-lg font-semibold text-[#0F172A]">{compactNumber(flowMinAmount)}</div>
              </div>
              <div className="min-w-[280px] flex-1 rounded-[18px] border border-[#E2E8F0] bg-white px-4 py-3">
                <input
                  type="range"
                  min={0}
                  max={1_200_000}
                  step={20_000}
                  value={flowMinAmount}
                  onChange={event => setFlowMinAmount(Number(event.target.value))}
                  className="w-full"
                />
                <div className="mt-1 text-xs text-[#64748B]">只展示大于当前阈值的转账边，点击节点右上角 `+ / -` 可展开或收起子地址</div>
              </div>
              <Button
                variant="secondary"
                className="h-11 rounded-full"
                onClick={() => setIsFlowFullscreenOpen(true)}
                disabled={fundFlowQuery.isLoading || fundFlowGraph.nodes.length === 0}
              >
                <Expand className="mr-2 h-4 w-4" />
                全屏查看
              </Button>
            </div>
            {fundFlowQuery.isLoading ? (
              <div className="flex h-[720px] items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                正在加载真实资金流向...
              </div>
            ) : fundFlowQuery.error ? (
              <div className="flex h-[720px] flex-col items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] px-6 text-center">
                <div className="text-base font-semibold text-[#0F172A]">资金流向加载失败</div>
                <div className="mt-2 max-w-[720px] text-sm text-[#64748B]">
                  当前没有成功取回 {selectedSymbol} 的资金流结果。你可以点右上角刷新重试，或者先切到推荐币种继续查看。
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {recommendedFlowTokens.map(token => (
                    <button
                      key={`${token.chainId ?? "na"}-${token.tokenId}`}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-sm font-medium text-[#1D4ED8]"
                    >
                      查看 {token.symbol}
                    </button>
                  ))}
                </div>
              </div>
            ) : !hasFundFlowResult ? (
              <div className="flex h-[720px] flex-col items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] px-6 text-center">
                <div className="text-base font-semibold text-[#0F172A]">当前未取到 {selectedSymbol} 的资金流结果</div>
                <div className="mt-2 max-w-[720px] text-sm text-[#64748B]">
                  这通常意味着当前币种还没有映射到可用的链上合约地址，或者数据源暂时没有返回结果。
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {recommendedFlowTokens.map(token => (
                    <button
                      key={`${token.chainId ?? "na"}-${token.tokenId}`}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-sm font-medium text-[#1D4ED8]"
                    >
                      试试 {token.symbol}
                    </button>
                  ))}
                </div>
              </div>
            ) : !hasFundFlowNodes ? (
              <div className="flex h-[720px] flex-col items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] px-6 text-center">
                <div className="text-base font-semibold text-[#0F172A]">{selectedSymbol} 当前没有可展示的资金流路径</div>
                <div className="mt-2 max-w-[720px] text-sm text-[#64748B]">
                  当前币种已经取回结果，但在所选日期和当前阈值下还没有可画出的分发路径。你可以先保持金额筛选为 0，或者切到推荐币种查看真实样例。
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {recommendedFlowTokens.map(token => (
                    <button
                      key={`${token.chainId ?? "na"}-${token.tokenId}`}
                      type="button"
                      onClick={() => handleSelectToken(token)}
                      className="rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-sm font-medium text-[#1D4ED8]"
                    >
                      查看 {token.symbol}
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-xs text-[#94A3B8]">
                  推荐样例：{recommendedFlowTokens.map(token => token.symbol).join(" / ")}
                </div>
              </div>
            ) : !isFlowFullscreenOpen ? (
              <FundFlowCanvas
                graph={fundFlowGraph}
                minAmount={flowMinAmount}
                collapsedNodeIds={collapsedNodeIds}
                onToggleCollapse={toggleCollapsedNode}
                explorerChainId={selectedChainId}
              />
            ) : (
              <div className="flex h-[720px] items-center justify-center rounded-[24px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                已切换到全屏查看
              </div>
            )}
          </div>

        </div>
      ) : null}

      {activeTrack === "token-analysis" && isTokenDetailOpen && activeView === "holders" ? (
        (() => {
          const holderItemsWithCumulative =
            holdersQuery.data?.items.map((item, index, items) => ({
              ...item,
              cumulativeRatio: items.slice(0, index + 1).reduce((sum, current) => sum + (current.ratioOfSupply ?? 0), 0),
            })) ?? [];

          return (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-5">
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Snapshot</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">{holdersQuery.data?.snapshotDate ?? "—"}</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">总 Holder</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">{holdersQuery.data?.total?.toLocaleString() ?? "—"}</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Token Address</div>
                {holdersQuery.data?.tokenAddress ? (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={formatBscScanAddress(holdersQuery.data.tokenAddress, selectedChainId)}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-sm font-semibold text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                      title={holdersQuery.data.tokenAddress}
                    >
                      {formatAddressDisplay(holdersQuery.data.tokenAddress)}
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyHolderTokenAddress}
                      className="shrink-0 text-[#64748B] transition hover:text-[#1D4ED8]"
                      title={copiedHolderTokenAddress ? "已复制" : "复制地址"}
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-[#0F172A]">—</div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">分页</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {holdersQuery.data ? `${holdersQuery.data.page} / ${Math.max(1, Math.ceil(holdersQuery.data.total / holdersQuery.data.pageSize))}` : "—"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[#0F172A]">Holder 列表</div>
                <div className="mt-1 text-sm text-[#64748B]">展示当前币种最近一期快照中的地址余额、占总代币供应量比例、标签和变化信息</div>
              </div>
            </div>

            {holdersQuery.isLoading ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                正在加载 Holder 数据...
              </div>
            ) : holdersQuery.error ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                Holder 数据加载失败
              </div>
            ) : !holdersQuery.data || holdersQuery.data.items.length === 0 ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                当前币种暂无 Holder 快照数据
              </div>
            ) : (
              <>
                <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>地址</TableHead>
                        <TableHead>标签</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead className="text-right">余额</TableHead>
                        <TableHead className="text-right">占比</TableHead>
                        <TableHead className="text-right">累积占比</TableHead>
                        <TableHead className="text-right">24h 变化</TableHead>
                        <TableHead className="text-right">7d 变化</TableHead>
                        <TableHead className="text-center">新地址</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {holderItemsWithCumulative.map((item, index) => (
                        <TableRow key={`${item.address}-${index}`}>
                          <TableCell>{(((holdersQuery.data?.page ?? 1) - 1) * (holdersQuery.data?.pageSize ?? 100) + index + 1).toLocaleString()}</TableCell>
                          <TableCell>
                            <button
                              type="button"
                              className="font-mono text-sm text-[#1D4ED8] underline"
                              onClick={() => window.open(formatBscScanAddress(item.address, selectedChainId), "_blank", "noopener,noreferrer")}
                            >
                              {formatAddressDisplay(item.address)}
                            </button>
                          </TableCell>
                          <TableCell>{item.label}</TableCell>
                          <TableCell>{item.kind}</TableCell>
                          <TableCell className="text-right">{item.balance != null ? compactNumber(item.balance) : "—"}</TableCell>
                          <TableCell className="text-right">{item.ratioOfSupply != null ? `${item.ratioOfSupply.toFixed(item.ratioOfSupply >= 1 ? 2 : 4)}%` : "—"}</TableCell>
                          <TableCell className="text-right">{`${item.cumulativeRatio.toFixed(item.cumulativeRatio >= 1 ? 2 : 4)}%`}</TableCell>
                          <TableCell className={cn("text-right", item.balanceChange24h != null && item.balanceChange24h >= 0 ? "text-[#2563EB]" : "text-[#F59E0B]")}>
                            {item.balanceChange24h != null ? `${item.balanceChange24h >= 0 ? "+" : ""}${compactNumber(item.balanceChange24h)}` : "—"}
                          </TableCell>
                          <TableCell className={cn("text-right", item.balanceChange7d != null && item.balanceChange7d >= 0 ? "text-[#2563EB]" : "text-[#F59E0B]")}>
                            {item.balanceChange7d != null ? `${item.balanceChange7d >= 0 ? "+" : ""}${compactNumber(item.balanceChange7d)}` : "—"}
                          </TableCell>
                          <TableCell className="text-center">{item.isNew ? "是" : "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-[#64748B]">
                    {holdersQuery.data ? `第 ${holdersQuery.data.page} / ${Math.max(1, Math.ceil(holdersQuery.data.total / holdersQuery.data.pageSize))} 页，每页 ${holdersQuery.data.pageSize} 条` : "—"}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      className="h-10 rounded-full"
                      disabled={holderPage <= 1 || holdersQuery.isLoading}
                      onClick={() => setHolderPage(current => Math.max(1, current - 1))}
                    >
                      上一页
                    </Button>
                    <Button
                      variant="secondary"
                      className="h-10 rounded-full"
                      disabled={
                        holdersQuery.isLoading ||
                        !holdersQuery.data ||
                        holderPage >= Math.max(1, Math.ceil(holdersQuery.data.total / holdersQuery.data.pageSize))
                      }
                      onClick={() =>
                        setHolderPage(current =>
                          holdersQuery.data ? Math.min(Math.ceil(holdersQuery.data.total / holdersQuery.data.pageSize), current + 1) : current
                        )
                      }
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
          );
        })()
      ) : null}

      {activeTrack === "token-analysis" && isTokenDetailOpen && activeView === "cex-flows" ? (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">总流入</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {cexFlowsQuery.data ? compactNumber(cexFlowsQuery.data.totalInflow) : "—"}
                </div>
                <div className="mt-1 text-xs text-[#64748B]">非交易所地址流入交易所</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">总流出</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {cexFlowsQuery.data ? compactNumber(cexFlowsQuery.data.totalOutflow) : "—"}
                </div>
                <div className="mt-1 text-xs text-[#64748B]">交易所地址流出到非交易所</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">净流入</div>
                <div className={cn("mt-1 text-base font-semibold", (cexFlowsQuery.data?.totalNetflow ?? 0) >= 0 ? "text-[#2563EB]" : "text-[#F59E0B]")}>
                  {cexFlowsQuery.data ? `${cexFlowsQuery.data.totalNetflow >= 0 ? "+" : ""}${compactNumber(cexFlowsQuery.data.totalNetflow)}` : "—"}
                </div>
                <div className="mt-1 text-xs text-[#64748B]">总流入 - 总流出</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">覆盖天数</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {cexFlowsQuery.data ? cexFlowsQuery.data.dayCount.toLocaleString() : "—"}
                </div>
                <div className="mt-1 text-xs text-[#64748B]">按天统计交易所流入流出</div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[#0F172A]">CEX 流入流出列表</div>
                <div className="mt-1 text-sm text-[#64748B]">列表先展示每日总流入 / 总流出，点击某一日可展开查看该日各交易所明细。</div>
              </div>
              <div className="flex items-center gap-2">
                {cexFlowsQuery.data?.tokenAddress ? (
                  <>
                    <a
                      href={formatBscScanAddress(cexFlowsQuery.data.tokenAddress, selectedChainId)}
                      target="_blank"
                      rel="noreferrer"
                      className="max-w-[240px] truncate rounded-full border border-[#DBEAFE] bg-white px-3 py-2 text-sm font-medium text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                      title={cexFlowsQuery.data.tokenAddress}
                    >
                      {formatAddressDisplay(cexFlowsQuery.data.tokenAddress)}
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyCexTokenAddress}
                      className="rounded-full border border-[#DBEAFE] bg-white px-3 py-2 text-sm text-[#64748B] transition hover:text-[#1D4ED8]"
                      title={copiedCexTokenAddress ? "已复制" : "复制地址"}
                    >
                      {copiedCexTokenAddress ? "✓" : <Copy className="h-4 w-4" />}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {cexFlowsQuery.isLoading ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                正在加载 CEX 流入流出数据...
              </div>
            ) : cexFlowsQuery.error ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                CEX 流入流出数据加载失败
              </div>
            ) : !cexFlowsQuery.data || cexFlowsQuery.data.days.length === 0 ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                当前币种暂无可识别的交易所流入流出数据
              </div>
            ) : (
              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[64px]">展开</TableHead>
                      <TableHead>日期</TableHead>
                      <TableHead className="text-right">总流入</TableHead>
                      <TableHead className="text-right">总流出</TableHead>
                      <TableHead className="text-right">净流入</TableHead>
                      <TableHead className="text-right">交易所数</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cexFlowsQuery.data.days.map(day => {
                      const expanded = expandedCexFlowDates.has(day.date);
                      return [
                        <TableRow key={day.date}>
                          <TableCell>
                            <button
                              type="button"
                              className="flex h-8 w-8 items-center justify-center rounded-full border border-[#DBEAFE] bg-white text-[#1D4ED8] transition hover:bg-[#EFF6FF]"
                              onClick={() => toggleExpandedCexDate(day.date)}
                              title={expanded ? "收起明细" : "展开明细"}
                            >
                              <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                            </button>
                          </TableCell>
                          <TableCell className="font-medium text-[#0F172A]">{day.date}</TableCell>
                          <TableCell className="text-right text-[#2563EB]">{compactNumber(day.inflow)}</TableCell>
                          <TableCell className="text-right text-[#F59E0B]">{compactNumber(day.outflow)}</TableCell>
                          <TableCell className={cn("text-right font-medium", day.netflow >= 0 ? "text-[#2563EB]" : "text-[#F59E0B]")}>
                            {day.netflow >= 0 ? "+" : ""}{compactNumber(day.netflow)}
                          </TableCell>
                          <TableCell className="text-right">{day.exchangeCount}</TableCell>
                          <TableCell className="text-right">
                            <a
                              href={`/onchain/cex-flow/${selectedSymbol}?date=${encodeURIComponent(day.date)}&direction=all&returnTab=cex-flows&expandDate=${encodeURIComponent(day.date)}`}
                              className="inline-flex items-center rounded-full border border-[#DBEAFE] bg-white px-3 py-1.5 text-xs font-medium text-[#1D4ED8] transition hover:bg-[#EFF6FF]"
                            >
                              看明细
                            </a>
                          </TableCell>
                        </TableRow>,
                        expanded ? (
                          <TableRow key={`${day.date}-expanded`} className="bg-[#F8FBFF]">
                            <TableCell colSpan={7} className="px-4 py-3">
                              <div className="overflow-hidden rounded-[16px] border border-[#DBEAFE] bg-white">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>交易所</TableHead>
                                      <TableHead className="text-right">流入</TableHead>
                                      <TableHead className="text-right">流出</TableHead>
                                      <TableHead className="text-right">净流入</TableHead>
                                      <TableHead className="text-right">流入笔数</TableHead>
                                      <TableHead className="text-right">流出笔数</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {day.exchanges.map(exchange => (
                                      <TableRow key={`${day.date}-${exchange.exchange}`}>
                                        <TableCell className="font-medium">{exchange.exchange}</TableCell>
                                        <TableCell className="text-right text-[#2563EB]">{compactNumber(exchange.inflow)}</TableCell>
                                        <TableCell className="text-right text-[#F59E0B]">{compactNumber(exchange.outflow)}</TableCell>
                                        <TableCell className={cn("text-right font-medium", exchange.netflow >= 0 ? "text-[#2563EB]" : "text-[#F59E0B]")}>
                                          {exchange.netflow >= 0 ? "+" : ""}{compactNumber(exchange.netflow)}
                                        </TableCell>
                                        <TableCell className="text-right">{exchange.inflowTxCount}</TableCell>
                                        <TableCell className="text-right">{exchange.outflowTxCount}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        ) : null,
                      ];
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {(((activeTrack === "token-analysis" && isTokenDetailOpen) || (activeTrack === "pool-discovery" && isPoolDetailOpen)) && activeView === "pool-adds") ? (
        <div className="space-y-6">
          {(() => {
            const activePoolAddsData =
              activeTrack === "pool-discovery" ? poolAddsByPoolQuery.data : poolAddsQuery.data;
            const activePoolAddsError =
              activeTrack === "pool-discovery" ? poolAddsByPoolQuery.error : poolAddsQuery.error;
            const activePoolAddsLoading =
              activeTrack === "pool-discovery" ? poolAddsByPoolQuery.isLoading : poolAddsQuery.isLoading;
            const visiblePoolAddItems =
              activeTrack === "pool-discovery"
                ? poolAddsByPoolQuery.data?.items ?? []
                : poolAddsQuery.data?.items ?? [];
            const visiblePoolAddTotal =
              activeTrack === "pool-discovery" ? (poolAddsByPoolQuery.data?.total ?? 0) : (poolAddsQuery.data?.total ?? 0);
            const visibleEarliestAdd = visiblePoolAddItems[0]?.blockTime ?? activePoolAddsData?.earliestBlockTime ?? null;
            const visibleEarliestStarted =
              (activeTrack === "pool-discovery" ? selectedPool?.startedTime ?? null : null) ??
              visiblePoolAddItems[0]?.startedTime ??
              activePoolAddsData?.earliestStartedTime ??
              null;
            const activePoolAddsByPoolData = activeTrack === "pool-discovery" ? poolAddsByPoolQuery.data : null;
            const detailPoolAddress =
              activePoolAddsByPoolData?.poolAddress ??
              visiblePoolAddItems.find(item => item.poolAddress)?.poolAddress ??
              (activeTrack === "pool-discovery" ? selectedPool?.poolAddress ?? null : null) ??
              null;
            const detailPoolSize =
              activeTrack === "pool-discovery"
                ? visiblePoolAddItems.reduce((sum, item) => sum + (item.value ?? 0), 0)
                : null;
            return (
              <>
          {activeTrack === "pool-discovery" && selectedPool ? (
            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">核心本币</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.coreTokenSymbol ?? selectedPool.token0Symbol ?? "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">本币合约地址</div>
                  {selectedPool.coreTokenAddress ? (
                    <div className="mt-1 flex items-center gap-2">
                      <a
                        href={formatBscScanAddress(selectedPool.coreTokenAddress, selectedPool.chainId ?? selectedChainId)}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-semibold text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                        title={selectedPool.coreTokenAddress}
                      >
                        {formatAddressDisplay(selectedPool.coreTokenAddress)}
                      </a>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(selectedPool.coreTokenAddress!)}
                        className="text-[#64748B] transition hover:text-[#1D4ED8]"
                        title="复制地址"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm font-semibold text-[#0F172A]">—</div>
                  )}
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">配对币</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.quoteTokenSymbol ?? selectedPool.token1Symbol ?? "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">池子地址</div>
                  {detailPoolAddress ? (
                    <div className="mt-1 flex items-center gap-2">
                      <a
                        href={formatBscScanAddress(detailPoolAddress)}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-sm font-semibold text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                        title={detailPoolAddress}
                      >
                        {formatAddressDisplay(detailPoolAddress)}
                      </a>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(detailPoolAddress)}
                        className="text-[#64748B] transition hover:text-[#1D4ED8]"
                        title="复制地址"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm font-semibold text-[#0F172A]">—</div>
                  )}
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">加时间锁时间</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.poolLockTime ? formatShanghaiDateTime(selectedPool.poolLockTime) : "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">建池时间</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.poolCreatedTime ? formatShanghaiDateTime(selectedPool.poolCreatedTime) : "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">开盘时间</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.startedTime ? formatShanghaiDateTime(selectedPool.startedTime) : "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">首次加池</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.firstAddLiquidityTime ? formatShanghaiDateTime(selectedPool.firstAddLiquidityTime) : "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">池子大小</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{detailPoolSize != null ? compactCurrency(detailPoolSize) : "—"}</div>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
                <CardContent className="p-3.5">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">首次价格</div>
                  <div className="mt-1 text-base font-semibold text-[#0F172A]">{selectedPool.firstAddPrice != null ? compactNumber(selectedPool.firstAddPrice, 6) : "—"}</div>
                </CardContent>
              </Card>
            </div>
          ) : null}
          {activeTrack === "token-analysis" ? (
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">加池记录数</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {activePoolAddsData ? visiblePoolAddTotal.toLocaleString() : "—"}
                </div>
                <div className="mt-1 text-xs text-[#64748B]">仅展示最早 20 笔 `action_type = add_liquidity` 记录</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">最早加池时间</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {visibleEarliestAdd ? formatShanghaiDateTime(visibleEarliestAdd) : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">开盘时间</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {visibleEarliestStarted ? formatShanghaiDateTime(visibleEarliestStarted) : "—"}
                </div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Token Address</div>
                {poolAddsQuery.data?.tokenAddress ? (
                  <div className="mt-1 flex items-center gap-2">
                    <a
                      href={formatBscScanAddress(poolAddsQuery.data?.tokenAddress ?? "", selectedChainId)}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-sm font-semibold text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                      title={poolAddsQuery.data?.tokenAddress ?? ""}
                    >
                      {formatAddressDisplay(poolAddsQuery.data?.tokenAddress ?? "")}
                    </a>
                    <button
                      type="button"
                      onClick={handleCopyPoolAddsTokenAddress}
                      className="text-[#64748B] transition hover:text-[#1D4ED8]"
                      title={copiedPoolAddsTokenAddress ? "已复制" : "复制地址"}
                    >
                      {copiedPoolAddsTokenAddress ? "✓" : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-[#0F172A]">—</div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">当前展示</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {activePoolAddsData ? `${visiblePoolAddItems.length} / ${visiblePoolAddTotal}` : "—"}
                </div>
              </CardContent>
            </Card>
          </div>
          ) : null}

          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
            <div className="mb-4">
              <div className="text-lg font-semibold text-[#0F172A]">加池记录</div>
              <div className="mt-1 text-sm text-[#64748B]">
                这里只展示 BigQuery `token_dex_pool_action_raw` 中 `action_type = add_liquidity` 的记录，并结合
                `token_dex_pool_raw` 与 `pool_started_timestamp_raw` 查看池子身份、建池时间、时间锁与开盘时间。
              </div>
            </div>

            {activePoolAddsLoading ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                正在加载加池记录...
              </div>
            ) : activePoolAddsError ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                加池记录加载失败
                {activePoolAddsError.message ? `：${activePoolAddsError.message}` : ""}
              </div>
            ) : !activePoolAddsData || visiblePoolAddItems.length === 0 ? (
              <div className="flex h-[520px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                {activeTrack === "pool-discovery" ? "当前池子暂无可展示的加池记录" : "当前币种暂无可展示的加池记录"}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-[20px] border border-[#E2E8F0] bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>开盘时间</TableHead>
                      <TableHead>加池地址</TableHead>
                      <TableHead>Pool ID</TableHead>
                      <TableHead>配对币 Symbol</TableHead>
                      <TableHead className="text-right">本币数量</TableHead>
                      <TableHead className="text-right">配对币数量</TableHead>
                      <TableHead className="text-right">价格</TableHead>
                      <TableHead className="text-right">价格区间（U）</TableHead>
                      <TableHead className="text-right">近似价值</TableHead>
                      <TableHead>交易 Hash</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visiblePoolAddItems.map((item, index) => (
                      <TableRow key={`${item.traderAddress}-${item.poolAddress ?? item.quoteTokenAddress ?? "na"}-${item.blockTime ?? index}`}>
                        <TableCell className="whitespace-nowrap">{formatShanghaiDateTime(item.blockTime)}</TableCell>
                        <TableCell>
                          {item.startedTime ? formatShanghaiDateTime(item.startedTime) : "—"}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="font-medium text-[#1D4ED8] hover:underline"
                            onClick={() => window.open(formatBscScanAddress(item.traderAddress, selectedChainId), "_blank", "noopener,noreferrer")}
                          >
                            {formatAddressDisplay(item.traderAddress)}
                          </button>
                        </TableCell>
                        <TableCell>
                          {item.poolId ? (
                            <button
                              type="button"
                              className="font-medium text-[#1D4ED8] hover:underline"
                              onClick={() => window.open(formatBscScanSearch(item.poolId!, selectedChainId), "_blank", "noopener,noreferrer")}
                            >
                              {formatPoolIdDisplay(item.poolId)}
                            </button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>{item.quoteTokenSymbol || "—"}</TableCell>
                        <TableCell className="text-right">{item.tokenAmount != null ? compactNumber(item.tokenAmount) : "—"}</TableCell>
                        <TableCell className="text-right">{item.quoteTokenAmount != null ? compactNumber(item.quoteTokenAmount) : "—"}</TableCell>
                        <TableCell className="text-right">{item.price != null ? compactNumber(item.price, 6) : "—"}</TableCell>
                        <TableCell className="text-right">{formatUsdPriceRange(item.rangeLow ?? null, item.rangeHigh ?? null)}</TableCell>
                        <TableCell className="text-right">{item.value != null ? `$${compactNumber(item.value)}` : "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.txhash ? (
                            <button
                              type="button"
                              className="font-medium text-[#1D4ED8] hover:underline"
                              onClick={() => window.open(formatBscScanTx(item.txhash!, selectedChainId), "_blank", "noopener,noreferrer")}
                            >
                              {formatHashDisplay(item.txhash)}
                            </button>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
              </>
            );
          })()}
        </div>
      ) : null}

      {activeTrack === "token-analysis" && isTokenDetailOpen && activeView === "large-transfers" ? (
        <div className="space-y-6">
          <div className="grid gap-3 md:grid-cols-4">
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">大额阈值</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {largeTransfersQuery.data?.thresholdAmount != null ? compactNumber(largeTransfersQuery.data.thresholdAmount) : "—"}
                </div>
                <div className="mt-1 text-xs text-[#64748B]">总代币量的 0.01%</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">总记录数</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">{largeTransfersQuery.data?.total?.toLocaleString() ?? "—"}</div>
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">Token Address</div>
                {largeTransfersQuery.data?.tokenAddress ? (
                  <a
                    href={formatBscScanAddress(largeTransfersQuery.data.tokenAddress, selectedChainId)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 block truncate text-sm font-semibold text-[#1D4ED8] hover:text-[#1E40AF] hover:underline"
                    title={largeTransfersQuery.data.tokenAddress}
                  >
                    {formatAddressDisplay(largeTransfersQuery.data.tokenAddress)}
                  </a>
                ) : (
                  <div className="mt-1 text-sm font-semibold text-[#0F172A]">—</div>
                )}
              </CardContent>
            </Card>
            <Card className="rounded-[18px] border border-white/80 bg-white/90 shadow-[0_10px_24px_rgba(71,85,105,0.08)]">
              <CardContent className="p-3.5">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#64748B]">当前结果</div>
                <div className="mt-1 text-base font-semibold text-[#0F172A]">
                  {largeTransfersQuery.data ? `${scopedLargeTransferItems.length} / ${largeTransfersQuery.data.total}` : "—"}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="rounded-[24px] border border-white/80 bg-white/90 p-4 shadow-[0_14px_36px_rgba(71,85,105,0.08)]">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[#0F172A]">{scopeLabel(largeTransferScope)}{largeTransferMode === "graph" ? "图谱" : "列表"}</div>
                <div className="mt-1 text-sm text-[#64748B]">
                  初始看阈值以上的大额转账；DEX / CEX 模式会围绕相关地址补一层上游和下游，便于判断是否存在打散或回流。
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-full border border-[#D7E3F4] bg-white p-1">
                  {[
                    { key: "all", label: "全部" },
                    { key: "initial", label: "初始大额流向" },
                    { key: "dex", label: "DEX 大额流向" },
                    { key: "cex", label: "CEX 大额流向" },
                  ].map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setLargeTransferScope(option.key as LargeTransferScope)}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition",
                        largeTransferScope === option.key ? "bg-[#1D4ED8] text-white" : "text-[#475569] hover:text-[#1D4ED8]"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="inline-flex rounded-full border border-[#D7E3F4] bg-white p-1">
                  {[
                    { key: "list", label: "列表" },
                    { key: "graph", label: "图模式" },
                  ].map(option => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setLargeTransferMode(option.key as "list" | "graph")}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm font-medium transition",
                        largeTransferMode === option.key ? "bg-[#1D4ED8] text-white" : "text-[#475569] hover:text-[#1D4ED8]"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="flex h-10 items-center rounded-full border border-[#D7E3F4] bg-white px-3">
                  <Search className="mr-2 h-4 w-4 text-[#64748B]" />
                  <input
                    value={largeTransferInput}
                    onChange={event => setLargeTransferInput(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") {
                        handleLargeTransferSearch();
                      }
                    }}
                    placeholder="搜索 from / to 地址"
                    className="w-[220px] border-0 bg-transparent text-sm text-[#0F172A] outline-none"
                  />
                  {largeTransferInput || largeTransferSearch ? (
                    <button
                      type="button"
                      className="ml-2 text-xs text-[#64748B] transition hover:text-[#1D4ED8]"
                      onClick={() => {
                        setLargeTransferInput("");
                        setLargeTransferSearch("");
                      }}
                    >
                      清空
                    </button>
                  ) : null}
                </div>
                <Button variant="secondary" className="h-10 rounded-full" onClick={handleLargeTransferSearch}>
                  搜索地址
                </Button>
                <Button
                  variant="secondary"
                  className="h-10 rounded-full"
                  onClick={() => {
                    setLargeTransferSortOrder(current => (current === "desc" ? "asc" : "desc"));
                  }}
                >
                  时间{largeTransferSortOrder === "desc" ? "倒序" : "正序"}
                </Button>
              </div>
            </div>

            {largeTransfersQuery.isLoading ? (
              <div className="flex h-[560px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                正在加载大额转账数据...
              </div>
            ) : largeTransfersQuery.error ? (
              <div className="flex h-[560px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                大额转账数据加载失败
              </div>
            ) : !largeTransfersQuery.data || scopedLargeTransferItems.length === 0 ? (
              <div className="flex h-[560px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                当前币种暂无符合条件的{scopeLabel(largeTransferScope)}记录
              </div>
            ) : largeTransferMode === "graph" && largeTransferScope === "initial" ? (
              initialLargeFlowGraph.nodes.length > 0 ? (
                <FundFlowCanvas
                  graph={initialLargeFlowGraph}
                  minAmount={largeTransfersQuery.data?.thresholdAmount ?? 0}
                  collapsedNodeIds={collapsedNodeIds}
                  onToggleCollapse={toggleCollapsedNode}
                  viewportHeight={900}
                  explorerChainId={selectedChainId}
                />
              ) : (
                <div className="flex h-[560px] items-center justify-center rounded-[20px] border border-[#E2E8F0] bg-[#FCFDFF] text-sm text-[#64748B]">
                  初始 5 层转账里暂无符合阈值的大额流向
                </div>
              )
            ) : largeTransferMode === "graph" && (largeTransferScope === "dex" || largeTransferScope === "cex") && largeTransferBilateralGraph ? (
              <LargeTransferBilateralCanvas
                graph={largeTransferBilateralGraph}
                scope={largeTransferScope}
                explorerChainId={selectedChainId}
              />
            ) : largeTransferMode === "graph" && largeTransferGraph ? (
              <LargeTransferGraphCanvas
                graph={largeTransferGraph}
                defaultView={largeTransferScope === "initial" ? "focus" : "all"}
                explorerChainId={selectedChainId}
              />
            ) : (
              <div className="overflow-hidden rounded-[20px] border border-[#E2E8F0] bg-white">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>时间</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>From 标签</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>To 标签</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead className="text-right">占总量</TableHead>
                      <TableHead>Tx</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scopedLargeTransferItems.map(item => (
                      <TableRow key={`${item.txhash}-${item.logIndex ?? "na"}-${item.fromAddress}-${item.toAddress}`}>
                        <TableCell className="whitespace-nowrap">{formatShanghaiDateTime(item.blockTime)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="font-mono text-sm text-[#1D4ED8] underline"
                              onClick={() => window.open(formatBscScanAddress(item.fromAddress, selectedChainId), "_blank", "noopener,noreferrer")}
                            >
                              {formatAddressDisplay(item.fromAddress)}
                            </button>
                            <button
                              type="button"
                              className="text-[#64748B] transition hover:text-[#1D4ED8]"
                              onClick={() => handleCopyLargeTransferAddress(item.fromAddress)}
                              title={copiedLargeTransferAddress === item.fromAddress ? "已复制" : "复制地址"}
                            >
                              {copiedLargeTransferAddress === item.fromAddress ? "✓" : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>{item.fromLabel}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="font-mono text-sm text-[#1D4ED8] underline"
                              onClick={() => window.open(formatBscScanAddress(item.toAddress, selectedChainId), "_blank", "noopener,noreferrer")}
                            >
                              {formatAddressDisplay(item.toAddress)}
                            </button>
                            <button
                              type="button"
                              className="text-[#64748B] transition hover:text-[#1D4ED8]"
                              onClick={() => handleCopyLargeTransferAddress(item.toAddress)}
                              title={copiedLargeTransferAddress === item.toAddress ? "已复制" : "复制地址"}
                            >
                              {copiedLargeTransferAddress === item.toAddress ? "✓" : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </TableCell>
                        <TableCell>{item.toLabel}</TableCell>
                        <TableCell className="text-right">{item.amount != null ? compactNumber(item.amount) : "—"}</TableCell>
                        <TableCell className="text-right">{item.ratioOfSupply != null ? formatPercent(item.ratioOfSupply) : "—"}</TableCell>
                        <TableCell>
                          <a
                            href={`https://bscscan.com/tx/${item.txhash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-xs text-[#1D4ED8] underline"
                          >
                            {item.txhash.slice(0, 10)}...
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {isFlowFullscreenOpen && fundFlowGraph.nodes.length > 0 ? (
        <div className="fixed inset-0 z-[120] bg-slate-950/38 backdrop-blur-[2px]">
          <div className="absolute inset-3 flex min-h-0 flex-col overflow-hidden rounded-[28px] border border-white/60 bg-[#f4f8ff] shadow-[0_25px_80px_rgba(15,23,42,0.25)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[#D8E5F5] px-6 py-4">
              <div>
                <div className="text-xl font-semibold text-[#0F172A]">资金流图全屏查看</div>
                <div className="mt-1 text-sm text-[#64748B]">
                  {selectedSymbol} · 当前阈值 {compactNumber(flowMinAmount)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden text-sm text-[#64748B] lg:block">
                  可见地址 {fundFlowGraph.nodes.length} · 总边 {fundFlowGraph.links.length}
                </div>
                <Button variant="secondary" className="h-11 rounded-full" onClick={() => setIsFlowFullscreenOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  关闭
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden p-4">
              <FundFlowCanvas
                graph={fundFlowGraph}
                minAmount={flowMinAmount}
                collapsedNodeIds={collapsedNodeIds}
                onToggleCollapse={toggleCollapsedNode}
                viewportHeight={typeof window !== "undefined" ? Math.max(640, window.innerHeight - 170) : 760}
                explorerChainId={selectedChainId}
              />
            </div>
          </div>
        </div>
      ) : null}

      {activeTrack === "token-analysis" && isTokenDetailOpen && activeView === "overview" ? (
        overviewIsLoading ? (
          <DashboardCard title="总览加载中" subtitle="正在拉取链上代币基础信息与持仓概览">
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[24px] border border-dashed border-[#DBEAFE] bg-[#F8FBFF] px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-sm">
                <RefreshCw className="h-6 w-6 animate-spin text-[#1D4ED8]" />
              </div>
              <div className="space-y-1">
                <div className="text-base font-semibold text-[#0F172A]">正在加载 {selectedSymbol} 的总览数据</div>
                <div className="text-sm text-[#64748B]">真实数据未返回前，不展示本地 mock 内容。</div>
              </div>
            </div>
          </DashboardCard>
        ) : overviewHasError ? (
          <DashboardCard title="总览加载失败" subtitle="链上总览真实数据暂时不可用">
            <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[24px] border border-dashed border-[#FECACA] bg-[#FFFBFB] px-6 text-center">
              <div className="text-base font-semibold text-[#0F172A]">当前未能拉取 {selectedSymbol} 的总览数据</div>
              <div className="max-w-[560px] text-sm text-[#64748B]">
                请点击右上角“刷新”重试；如果只有总览失败而资金流 / Holder 正常，通常是总览聚合查询暂时未返回。
              </div>
            </div>
          </DashboardCard>
        ) : (
        <>
      <DashboardCard
        title="A. 代币基础信息"
        subtitle="顶部快览区"
        action={<span className="rounded-full bg-[#EFF6FF] px-3 py-1 text-xs font-medium text-[#1D4ED8]">Snapshot</span>}
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_320px]">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[20px] border border-[#E2E8F0] bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 md:col-span-2">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#DBEAFE] text-2xl font-semibold text-[#1D4ED8]">
                  {overviewLogo}
                </div>
                <div>
                  <div className="metric-value text-[#0F172A]">{overviewTokenName}</div>
                  <div className="mt-1 text-sm text-[#64748B]">{overviewTokenSymbol}</div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-end gap-3">
                <div className="metric-value-strong text-[#0F172A]">
                  {overviewPriceUsd != null ? compactCurrency(overviewPriceUsd) : "—"}
                </div>
                <div className={cn("pb-1 text-lg font-medium", percentTone(overviewPriceChange24h ?? 0))}>
                  {(overviewPriceChange24h ?? 0) > 0 ? "+" : ""}
                  {overviewPriceChange24h != null ? formatPercent(overviewPriceChange24h) : "—"}
                </div>
              </div>
            </div>

            <MetricTile
              label="总发行量"
              value={overviewTotalSupply != null ? compactNumber(overviewTotalSupply) : "—"}
              tooltip={overviewTotalSupply != null ? overviewTotalSupply.toLocaleString() : undefined}
            />
            <MetricTile
              label="流通量"
              value={
                overviewCirculatingSupply != null && overviewTotalSupply
                  ? `${compactNumber(overviewCirculatingSupply)} / ${formatPercent(
                      (overviewCirculatingSupply / overviewTotalSupply) * 100
                    )}`
                  : "—"
              }
              tooltip={overviewCirculatingSupply != null ? overviewCirculatingSupply.toLocaleString() : undefined}
            />
            <MetricTile
              label="市值 / FDV"
              value={
                overviewMarketCap != null && overviewFdv != null
                  ? `${compactCurrency(overviewMarketCap)} / ${compactCurrency(overviewFdv)}`
                  : "—"
              }
            />
            <MetricTile
              label="持币人数"
              value={overviewHolderCount != null ? overviewHolderCount.toLocaleString() : "—"}
              delta={Number.isFinite(overviewHolderDelta) ? overviewHolderDelta : undefined}
            />
            <MetricTile
              label="控盘率"
              value={formatPercent(snapshot.controlRate)}
              delta={snapshot.controlRateChange1d}
              sparkline={controlSpark}
              valueClassName="text-[#1D4ED8]"
            />
          </div>

          <div className="rounded-[22px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
            <div className="text-sm font-semibold text-[#0F172A]">Top N 占比结构</div>
            <div className="mt-4 space-y-4">
              <div className="flex h-5 overflow-hidden rounded-full bg-[#E2E8F0]">
                {topNData.map(item => (
                  <div key={item.name} style={{ width: `${item.ratio}%`, backgroundColor: item.color }} />
                ))}
              </div>
              <div className="space-y-3">
                {topNData.map(item => (
                  <div key={item.name} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-[#334155]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </div>
                    <div className="font-medium text-[#0F172A]">{formatPercent(item.ratio)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard title="B. 控盘结构" subtitle="显性 / 隐性 / 间接 / 自由流通">
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricTile label="显性控盘" value={compactNumber(snapshot.explicitControl)} />
              <MetricTile label="隐性控盘" value={compactNumber(snapshot.implicitControl)} />
              <MetricTile label="间接控盘" value={compactNumber(snapshot.indirectControl)} />
              <MetricTile label="合计控盘" value={compactNumber(snapshot.controlBalanceTotal)} />
            </div>
            <div className="rounded-[22px] border border-[#DBEAFE] bg-[#F8FBFF] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[#0F172A]">控盘率 30 天趋势</div>
                  <div className="mt-1 text-xs text-[#64748B]">带坐标轴，便于看阶段变化</div>
                </div>
                <div className="metric-value-strong text-[#1E3A8A]">{formatPercent(snapshot.controlRate)}</div>
              </div>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={controlRateTrendData}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} domain={["dataMin - 1", "dataMax + 1"]} />
                    <Tooltip formatter={(value: number) => formatPercent(value)} />
                    <Line type="monotone" dataKey="controlRate" stroke={DEEP_BLUE} strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="C. 持仓集中度" subtitle="Top 10 / 50 / 100 地址与持币人数趋势">
          <div className="grid gap-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <MetricTile
                label="Top 10 持有量"
                value={
                  overviewTop10Balance != null && overviewTop10Ratio != null
                    ? `${compactNumber(overviewTop10Balance)} / ${formatPercent(overviewTop10Ratio)}`
                    : "—"
                }
              />
              <MetricTile
                label="Top 50 持有量"
                value={
                  overviewTop50Balance != null && overviewTop50Ratio != null
                    ? `${compactNumber(overviewTop50Balance)} / ${formatPercent(overviewTop50Ratio)}`
                    : "—"
                }
              />
              <MetricTile
                label="Top 100 持有量"
                value={
                  overviewTop100Balance != null && overviewTop100Ratio != null
                    ? `${compactNumber(overviewTop100Balance)} / ${formatPercent(overviewTop100Ratio)}`
                    : "—"
                }
              />
            </div>
            <div className="rounded-[22px] border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-[#0F172A]">持币人数 30 天柱形图</div>
                  <div className="mt-1 text-xs text-[#64748B]">用日维度看新增持有人变化更直观</div>
                </div>
                <div className="metric-value-strong text-[#1D4ED8]">
                  {overviewHolderCount != null ? overviewHolderCount.toLocaleString() : "—"}
                </div>
              </div>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={holderTrendData}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} interval={2} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={value => compactNumber(Number(value), 1)} />
                    <Tooltip formatter={(value: number) => value.toLocaleString()} />
                    <Bar dataKey="holderCount" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard
        title="D. 交易所流向（链上口径）"
        subtitle={`数据口径：链上 Transfer 事件，交易所钱包标签已覆盖 ${snapshot.exchangeCoverageCount} 个地址`}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile label="今日流入" value={compactNumber(snapshot.exchangeInflow)} />
          <MetricTile label="今日流出" value={compactNumber(snapshot.exchangeOutflow)} />
          <MetricTile
            label="净流入"
            value={compactNumber(snapshot.exchangeNetFlow)}
            valueClassName={snapshot.exchangeNetFlow >= 0 ? "text-[#EF4444]" : "text-[#10B981]"}
          />
          <MetricTile label="净流入 / 流通量" value={formatPercent(snapshot.netFlowRatio)} valueClassName={snapshot.netFlowRatio >= 0 ? "text-[#EF4444]" : "text-[#10B981]"} />
          <MetricTile
            label="连续净流动天数"
            value={`${Math.abs(snapshot.netFlowStreak)} 天`}
            valueClassName={snapshot.netFlowStreak >= 0 ? "text-[#EF4444]" : "text-[#10B981]"}
          />
        </div>
        <div className="mt-5 h-[290px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={exchangeHistoryData}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={value => compactNumber(Number(value), 1)} />
              <Tooltip formatter={(value: number) => compactNumber(value)} />
              <ReferenceLine y={0} stroke="#94A3B8" />
              <Bar dataKey="value" radius={[8, 8, 8, 8]}>
                {exchangeHistoryData.map(item => (
                  <Cell key={item.date} fill={item.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashboardCard title="F. DEX 买卖结构" subtitle="去掉吸筹指数，只保留更清楚的买卖对比图">
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricTile label="总买入量" value={compactCurrency(snapshot.totalBuyVolume)} />
            <MetricTile label="总卖出量" value={compactCurrency(snapshot.totalSellVolume)} />
            <MetricTile label="买入地址数" value={snapshot.buyAddressCount.toLocaleString()} />
            <MetricTile label="卖出地址数" value={snapshot.sellAddressCount.toLocaleString()} />
            <MetricTile label="Top5 买入量" value={compactCurrency(snapshot.top5BuyVolume)} />
            <MetricTile label="Top5 卖出量" value={compactCurrency(snapshot.top5SellVolume)} />
          </div>
          <div className="mt-5 space-y-6">
            <div className="rounded-[22px] border border-[#F1F5F9] bg-[#FCFDFF] p-4">
              <div className="mb-4 text-sm font-semibold text-[#0F172A]">今日总买入 vs 总卖出</div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dexCompareData}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={value => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => compactCurrency(value)} />
                    <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                      {dexCompareData.map(item => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-[22px] border border-[#F1F5F9] bg-[#FCFDFF] p-4">
              <div className="mb-4 text-sm font-semibold text-[#0F172A]">近 {trendDays} 天买卖量趋势</div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dexTrendData}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={value => compactCurrency(Number(value))} />
                    <Tooltip formatter={(value: number) => compactCurrency(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="buyVolume" stroke={RISE_RED} strokeWidth={3} dot={false} name="买入量" />
                    <Line type="monotone" dataKey="sellVolume" stroke={FALL_GREEN} strokeWidth={3} dot={false} name="卖出量" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="G. 大户行为" subtitle="定义：持仓 Top 100 地址">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <MetricTile label="大户地址数" value={snapshot.whaleAddressCount.toString()} />
            <MetricTile label="大户总持仓" value={compactNumber(snapshot.whaleTotalBalance)} />
            <MetricTile label="今日转出" value={compactNumber(snapshot.whaleTotalOutflow)} />
            <MetricTile label="今日转入" value={compactNumber(snapshot.whaleTotalInflow)} />
            <MetricTile
              label="净转出"
              value={compactNumber(snapshot.whaleNetOutflow)}
              sparkline={whaleSpark}
              valueClassName={snapshot.whaleNetOutflow >= 0 ? "text-[#F59E0B]" : "text-[#2563EB]"}
            />
          </div>
          <div className="mt-5 space-y-6">
            <div className="rounded-[22px] border border-[#F1F5F9] bg-[#FCFDFF] p-4">
              <div className="mb-4 text-sm font-semibold text-[#0F172A]">大户流向分布</div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={whaleFlowData}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fill: "#64748B", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={value => compactNumber(Number(value), 1)} />
                    <Tooltip formatter={(value: number) => compactNumber(value)} />
                    <Legend />
                    <Bar dataKey="交易所" stackId="a" fill="#EF4444" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="新地址" stackId="a" fill="#2563EB" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="DEX Router" stackId="a" fill="#10B981" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="内部转账" stackId="a" fill="#94A3B8" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="rounded-[22px] border border-[#F1F5F9] bg-[#FCFDFF] p-4">
                <div className="mb-4 text-sm font-semibold text-[#0F172A]">大户净转出 30 天趋势</div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendWindow.map(point => ({ date: point.shortDate, whaleNetOutflow: point.whaleNetOutflow }))}>
                      <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#64748B", fontSize: 12 }} tickFormatter={value => compactNumber(Number(value), 1)} />
                      <Tooltip formatter={(value: number) => compactNumber(value)} />
                      <ReferenceLine y={0} stroke="#94A3B8" />
                      <Line type="monotone" dataKey="whaleNetOutflow" stroke={DISTRIBUTION_NEGATIVE} strokeWidth={3} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="rounded-[20px] border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-sm">
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-[#64748B]">→ 交易所</span><span className="font-medium text-[#0F172A]">{compactNumber(snapshot.whaleToExchange)}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">→ 新地址</span><span className="font-medium text-[#0F172A]">{compactNumber(snapshot.whaleToNewAddress)}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">→ DEX Router</span><span className="font-medium text-[#0F172A]">{compactNumber(snapshot.whaleToDexRouter)}</span></div>
                  <div className="flex justify-between"><span className="text-[#64748B]">转出比例</span><span className="font-medium text-[#0F172A]">{formatPercent(snapshot.whaleOutRatio)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard title="H. 新增 / 流失 Top 10 持仓地址" subtitle="点击地址可跳转 Etherscan，后续可接地址深挖页">
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-[22px] border border-[#DBEAFE] bg-[#F8FBFF] p-4">
            <div className="mb-3 text-sm font-semibold text-[#0F172A]">今日新进 Top 的地址</div>
            <Table>
              <TableHeader>
                <TableRow className="border-[#DBEAFE]">
                  <TableHead>地址</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead className="text-right">新增余额</TableHead>
                  <TableHead>首次出现</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overviewIncreaseRows.map(row => (
                  <TableRow key={row.address} className="border-[#E2E8F0]">
                    <TableCell>
                      <a className="font-medium text-[#1D4ED8] hover:underline" href={row.href} target="_blank" rel="noreferrer">
                        {row.address}
                      </a>
                    </TableCell>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right font-medium">{compactNumber(row.changeBalance)}</TableCell>
                    <TableCell>{row.firstSeen}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="rounded-[22px] border border-[#FDE68A] bg-[#FFFDF5] p-4">
            <div className="mb-3 text-sm font-semibold text-[#0F172A]">今日 Top 中余额减少最多的地址</div>
            <Table>
              <TableHeader>
                <TableRow className="border-[#FDE68A]">
                  <TableHead>地址</TableHead>
                  <TableHead>标签</TableHead>
                  <TableHead className="text-right">减少余额</TableHead>
                  <TableHead className="text-right">当前余额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overviewDecreaseRows.map(row => (
                  <TableRow key={row.address} className="border-[#E2E8F0]">
                    <TableCell>
                      <a className="font-medium text-[#1D4ED8] hover:underline" href={row.href} target="_blank" rel="noreferrer">
                        {row.address}
                      </a>
                    </TableCell>
                    <TableCell>{row.label}</TableCell>
                    <TableCell className="text-right font-medium">{compactNumber(row.changeBalance)}</TableCell>
                    <TableCell className="text-right">{compactNumber(row.currentBalance ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard title="I. 重点标签地址净变化" subtitle="筹码流向采用蓝 / 橙，避免涨跌红绿歧义">
        <div className="space-y-4">
          {snapshot.tagNetChanges.map(item => (
            <div key={item.label} className="grid items-center gap-3 md:grid-cols-[180px_minmax(0,1fr)_100px]">
              <div className="text-sm font-medium text-[#334155]">{item.label}</div>
              <div className="relative h-4 overflow-hidden rounded-full bg-[#E2E8F0]">
                <div
                  className="absolute left-1/2 top-0 h-full"
                  style={{
                    width: `${Math.min(Math.abs(item.value) / 40_000, 50)}%`,
                    transform: item.value >= 0 ? "translateX(0)" : "translateX(-100%)",
                    backgroundColor: item.value >= 0 ? ACCUMULATION_POSITIVE : DISTRIBUTION_NEGATIVE,
                  }}
                />
                <div className="absolute left-1/2 top-0 h-full w-px bg-white" />
              </div>
              <div className={cn("text-right text-sm font-semibold", item.value >= 0 ? "text-[#2563EB]" : "text-[#C2410C]")}>
                {item.value > 0 ? "+" : ""}
                {compactNumber(item.value)}
              </div>
            </div>
          ))}
        </div>
      </DashboardCard>

      <DashboardCard
        title="J. 30 天多指标综合趋势"
        subtitle='找"信号共振"：净流入、控盘率和大户净转出一起看'
        action={
          <div className="flex items-center gap-2 rounded-full bg-[#F8FAFC] p-1">
            {[30, 60, 90].map(days => (
              <button
                key={days}
                onClick={() => setTrendDays(days as 30 | 60 | 90)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition",
                  trendDays === days ? "bg-[#1E40AF] text-white" : "text-[#475569]"
                )}
              >
                {days} 天
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-wrap gap-3">
          {trendConfig.map(item => (
            <label key={item.key} className="inline-flex items-center gap-2 rounded-full border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-sm text-[#334155]">
              <Checkbox
                checked={visibleTrendKeys.includes(item.key)}
                onCheckedChange={checked =>
                  setVisibleTrendKeys(current =>
                    checked ? [...current, item.key] : current.filter(key => key !== item.key)
                  )
                }
              />
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </label>
          ))}
        </div>

        <div className="mt-5 h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={combinedTrendData}>
              <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: "#64748B", fontSize: 12 }} />
              <YAxis yAxisId="left" tick={{ fill: "#64748B", fontSize: 12 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748B", fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {visibleTrendKeys.includes("controlRate") ? (
                <Line yAxisId="left" type="monotone" dataKey="controlRate" stroke={DEEP_BLUE} strokeWidth={2.4} dot={false} name="控盘率" />
              ) : null}
              {visibleTrendKeys.includes("netFlowRatio") ? (
                <Line yAxisId="right" type="monotone" dataKey="netFlowRatio" stroke={DISTRIBUTION_NEGATIVE} strokeWidth={2.4} dot={false} name="净流入比例" />
              ) : null}
              {visibleTrendKeys.includes("whaleNetOutflow") ? (
                <Line yAxisId="right" type="monotone" dataKey="whaleNetOutflow" stroke={RISE_RED} strokeWidth={2.4} dot={false} name="大户净转出" />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-[22px] border border-[#DBEAFE] bg-[#EFF6FF] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1D4ED8]">
            <TrendingUp className="h-4 w-4" />
            吸筹信号
          </div>
          <div className="mt-2 text-sm leading-6 text-[#475569]">
            {snapshot.exchangeNetFlow < 0 && snapshot.totalBuyVolume > snapshot.totalSellVolume
              ? "交易所净流出且 DEX 买入量高于卖出量，说明链上承接相对更强。"
              : "当前吸筹信号一般，建议继续观察交易所净流出和标签地址增持是否同步。"}
          </div>
        </div>
        <div className="rounded-[22px] border border-[#FDE68A] bg-[#FFFBEA] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#B45309]">
            <Droplets className="h-4 w-4" />
            派发风险
          </div>
          <div className="mt-2 text-sm leading-6 text-[#475569]">
            {snapshot.whaleNetOutflow > 0
              ? "大户净转出仍在高位，若同步流向交易所和 DEX Router，需要警惕派发窗口。"
              : "大户净转出尚未形成持续压力，风险更多来自局部地址减持。"}
          </div>
        </div>
        <div className="rounded-[22px] border border-[#E2E8F0] bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A]">
            <TrendingDown className="h-4 w-4" />
            人工判断提示
          </div>
          <div className="mt-2 text-sm leading-6 text-[#475569]">
            看板只呈现原始信号，不做自动评分。建议重点对照净流向、标签地址净变化和大户路径。
          </div>
        </div>
        </div>
        </>
        )
      ) : null}
    </div>
  );
}
