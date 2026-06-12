export type TokenReport = {
  id: string;
  tokenId: number;
  symbol: string;
  name: string;
  tags: string[];
  sectors: string[];
  cex: Array<{
    venue: string;
    status: string;
  }>;
  grade: string;
  endorsement: string;
  highlights: string[];
  publicSale: Array<{
    label: string;
    value: string;
  }>;
  tokenomicSummary: string[];
  tokenomics: Array<{
    category: string;
    allocation: string;
    tge: string;
    notes: string;
  }>;
  tgeBreakdown: Array<{
    side: string;
    ratio: string;
    items: string[];
  }>;
  chainData: Array<{
    chain: string;
    amount: string;
    ratio: string;
  }>;
  bscAllocation: string[];
  lpSetup: string[];
};

const TOKEN_REPORTS: TokenReport[] = [
  {
    id: "solstice-slx",
    tokenId: 1804,
    symbol: "SLX",
    name: "Solstice",
    tags: ["币安 Alpha项目", "Kraken路线图项目"],
    sectors: ["Solana DeFi", "合成美元", "收益层", "稳定币收益协议"],
    cex: [
      {
        venue: "Binance Alpha",
        status: "2026/05/25 20:00 币安 Alpha 开盘",
      },
      {
        venue: "Kraken",
        status: "已公告 Coming soon，具体开盘时间未确认",
      },
    ],
    grade: "B级项目",
    endorsement:
      "Solstice 由积累了 10 亿美元资本的风投公司 Deus X Capital 孵化，创始人 Tim Grant 是 Deus X Capital CEO；联合创始人 Ben Nadareski 是 Deus X Capital 投资总监。",
    highlights: [
      "Solstice 做的是 Solana 上的收益型稳定币协议，核心叙事是把机构级收益策略带到链上，通过 USX / eUSX 承接稳定币资金需求，不是单纯发币叙事。",
      "项目由 Deus X Capital 孵化，团队背景偏机构金融方向，整体定位更偏“机构收益 + Solana DeFi”的结合，和普通稳定币项目相比，更强调链上收益资产与机构策略的结合。",
      "官方称策略从 2023 年开始运行，管理过 2 亿美元以上资金；TVL 已突破 400M，说明项目已有一定资金规模和产品运行数据，不是空壳型发币项目。",
    ],
    publicSale: [
      { label: "渠道", value: "Legion Public Sale" },
      { label: "价格", value: "$0.13" },
      { label: "对应 FDV", value: "130M" },
      { label: "数量", value: "2,854,223 SLX，约占总量 0.29%" },
      { label: "总募资", value: "约 $371,049" },
    ],
    tokenomicSummary: [
      "总量 10 亿",
      "TGE 初始流通约 24%",
    ],
    tokenomics: [
      {
        category: "Foundation",
        allocation: "24%",
        tge: "50% 解锁，即 12%",
        notes: "项目方核心金库，承担前期资源投入与交易所配发来源。",
      },
      {
        category: "Community",
        allocation: "37.71%",
        tge: "21.2% 解锁，即约 7.995%",
        notes: "主要用于社区激励与生态扩张。",
      },
      {
        category: "Team & Advisors",
        allocation: "20%",
        tge: "0%，12 个月 cliff，24 个月线性",
        notes: "团队与顾问长期绑定，无 TGE 抛压。",
      },
      {
        category: "Airdrops",
        allocation: "10%",
        tge: "1.715%",
        notes: "按用户 allocation size 分层解锁。",
      },
      {
        category: "Strategic TVL Partners",
        allocation: "8%",
        tge: "25% 解锁，即 2%",
        notes: "偏战略生态流动性合作伙伴。",
      },
    ],
    tgeBreakdown: [
      {
        side: "用户侧",
        ratio: "约 3.305%",
        items: [
          "airdrop 约 1.715%（按官方初始流通约 24% 反推）",
          "Binance Alpha 1%（来自 Foundation 已解锁池子）",
          "OKX Boost 0.3%（来自 Foundation 已解锁池子）",
          "Public Sale 0.29%",
        ],
      },
      {
        side: "项目方侧",
        ratio: "约 20.695%",
        items: [
          "Foundation TGE 解锁 12%",
          "Community TGE 解锁约 7.995%",
          "Strategic TVL Partners TGE 解锁 2%",
        ],
      },
    ],
    chainData: [
      { chain: "BSC", amount: "21M SLX", ratio: "约 2.1%" },
      { chain: "Solana", amount: "979M SLX", ratio: "约 97.9%" },
    ],
    bscAllocation: [
      "Binance wallet：10.00M SLX",
      "OKX wallet：3.00M SLX",
      "Pancake LP：约 3.85M SLX",
      "其他 / 未识别地址：需继续观察",
    ],
    lpSetup: [
      "开盘价：$0.13，对应 FDV 130M",
      "0 ~ ∞：150k USDC + 1.15M SLX，属于全范围流动性",
      "0.13 - 1.3：1.53M SLX，形成上方卖单压力",
      "0.13 - 0.65：1.15M SLX，形成上方卖单压力",
      "0.065 - 0.13：350k USDC，形成下方买单支撑",
    ],
  },
];

export function findTokenReport(input: {
  tokenId?: number | null;
  symbol?: string | null;
  name?: string | null;
}) {
  const normalizedSymbol = input.symbol?.trim().toUpperCase();
  const normalizedName = input.name?.trim().toLowerCase();

  return (
    TOKEN_REPORTS.find(report => {
      if (input.tokenId != null && report.tokenId === input.tokenId) return true;
      if (normalizedSymbol && report.symbol === normalizedSymbol) return true;
      if (normalizedName && report.name.toLowerCase() === normalizedName) return true;
      return false;
    }) ?? null
  );
}
