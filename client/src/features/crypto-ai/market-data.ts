export type MarketType = "all" | "spot" | "perps";

export type ListedToken = {
  rank: number;
  symbol: string;
  name: string;
  listedAt: string;
  price: number;
  totalSupply: string;
  circulatingSupply: string;
  fdv: string;
  marketCap: string;
  exchanges: Array<{ name: string; type: MarketType }>;
  recentVenue: string;
  volume24h: string;
  logoText: string;
  logoTone: string;
};

export const exchangeOptions = [
  "Binance",
  "OKX",
  "Bitget",
  "Bybit",
  "Gate",
  "Kraken",
  "Coinbase",
  "Bithumb",
  "Upbit",
  "KuCoin",
  "Binance Alpha",
  "Bybit Alpha",
  "OKX Boost",
];

export const listedTokens: ListedToken[] = [
  {
    rank: 1,
    symbol: "USDS",
    name: "USDS",
    listedAt: "2026/4/17",
    price: 0.99975,
    totalSupply: "11.40B",
    circulatingSupply: "11.40B",
    fdv: "$11,397,352,010.00",
    marketCap: "$11,397,352,010.00",
    exchanges: [
      { name: "Binance", type: "spot" },
      { name: "OKX", type: "spot" },
      { name: "Bybit", type: "spot" },
      { name: "Binance Alpha", type: "spot" },
    ],
    recentVenue: "OKX Spot",
    volume24h: "$49,636,087.11",
    logoText: "S",
    logoTone: "bg-orange-400",
  },
  {
    rank: 2,
    symbol: "UP",
    name: "Superform",
    listedAt: "2026/4/10",
    price: 0.064398,
    totalSupply: "1.00B",
    circulatingSupply: "139.22M",
    fdv: "$64,397,800.86",
    marketCap: "$8,965,743.71",
    exchanges: [
      { name: "Binance", type: "spot" },
      { name: "OKX", type: "spot" },
      { name: "Gate", type: "spot" },
      { name: "Binance Alpha", type: "spot" },
    ],
    recentVenue: "Gate Spot",
    volume24h: "$3,802,639.26",
    logoText: "U",
    logoTone: "bg-lime-400 text-zinc-900",
  },
  {
    rank: 3,
    symbol: "IWM",
    name: "IWM",
    listedAt: "2026/4/10",
    price: 258.86003,
    totalSupply: "0",
    circulatingSupply: "0",
    fdv: "$0.00",
    marketCap: "$0.00",
    exchanges: [{ name: "OKX", type: "perps" }],
    recentVenue: "OKX Perps",
    volume24h: "$0.00",
    logoText: "2K",
    logoTone: "bg-rose-950 text-white",
  },
  {
    rank: 4,
    symbol: "CRWV",
    name: "CRWV",
    listedAt: "2026/4/10",
    price: 102.87075,
    totalSupply: "0",
    circulatingSupply: "0",
    fdv: "$0.00",
    marketCap: "$0.00",
    exchanges: [{ name: "OKX", type: "perps" }],
    recentVenue: "OKX Perps",
    volume24h: "$0.00",
    logoText: "◌",
    logoTone: "bg-zinc-100 text-zinc-700",
  },
  {
    rank: 5,
    symbol: "SPACEX",
    name: "SpaceX",
    listedAt: "2026/4/9",
    price: 693.17505,
    totalSupply: "6,665.435",
    circulatingSupply: "6,665.435",
    fdv: "$4,620,313.36",
    marketCap: "$4,620,313.36",
    exchanges: [{ name: "Gate", type: "perps" }],
    recentVenue: "Gate Perps",
    volume24h: "$2,766,571.63",
    logoText: "X",
    logoTone: "bg-zinc-900 text-white",
  },
  {
    rank: 6,
    symbol: "NIGHT",
    name: "Midnight",
    listedAt: "2026/4/9",
    price: 0.039064,
    totalSupply: "24.00B",
    circulatingSupply: "16.61B",
    fdv: "$937,528,058.50",
    marketCap: "$648,745,954.90",
    exchanges: [
      { name: "Binance", type: "spot" },
      { name: "Bitget", type: "spot" },
      { name: "Bybit", type: "spot" },
    ],
    recentVenue: "Bitget Spot",
    volume24h: "$122,495,405.60",
    logoText: "◉",
    logoTone: "bg-zinc-950 text-white",
  },
  {
    rank: 7,
    symbol: "OFC",
    name: "OneFootball Credits",
    listedAt: "2026/4/9",
    price: 0.056486,
    totalSupply: "1.00B",
    circulatingSupply: "0",
    fdv: "$56,486,174.13",
    marketCap: "$0.00",
    exchanges: [
      { name: "OKX", type: "perps" },
      { name: "Binance", type: "spot" },
      { name: "KuCoin", type: "spot" },
    ],
    recentVenue: "OKX Perps",
    volume24h: "$22,665,510.17",
    logoText: "◍",
    logoTone: "bg-zinc-900 text-white",
  },
  {
    rank: 8,
    symbol: "KITE",
    name: "Kite",
    listedAt: "2026/4/9",
    price: 0.13347,
    totalSupply: "10.00B",
    circulatingSupply: "1.80B",
    fdv: "$1,334,696,900.00",
    marketCap: "$240,245,442.00",
    exchanges: [
      { name: "OKX", type: "perps" },
      { name: "Bitget", type: "spot" },
      { name: "Bybit", type: "spot" },
      { name: "KuCoin", type: "spot" },
      { name: "Binance Alpha", type: "spot" },
    ],
    recentVenue: "OKX Perps",
    volume24h: "$69,844,259.30",
    logoText: "◔",
    logoTone: "bg-stone-200 text-stone-700",
  },
  {
    rank: 9,
    symbol: "CHECK",
    name: "Anichess",
    listedAt: "2026/4/8",
    price: 0.026878,
    totalSupply: "1.00B",
    circulatingSupply: "329.91M",
    fdv: "$26,877,797.68",
    marketCap: "$8,867,318.82",
    exchanges: [
      { name: "Gate", type: "spot" },
      { name: "Binance", type: "spot" },
      { name: "Bybit", type: "spot" },
      { name: "Binance Alpha", type: "spot" },
    ],
    recentVenue: "Gate Spot",
    volume24h: "$22,056,509.60",
    logoText: "C",
    logoTone: "bg-zinc-950 text-white",
  },
];

export type PositionTimeframe = "1h" | "4h" | "12h" | "1d";

export type PositionExchangeRow = {
  exchangeId: string;
  exchange: string;
  pair: string;
  price1: number;
  price2: number;
  change24h: number;
  volume24h: string;
  marketShare: string;
  fundingRate: string;
  positionValue: string;
};

export const positionSummarySeries: Record<
  PositionTimeframe,
  Array<{
    label: string;
    totalOpenInterest: number;
    fundingRate: number;
  }>
> = {
  "1h": [
    { label: "01:00", totalOpenInterest: 43.2, fundingRate: 0.008 },
    { label: "05:00", totalOpenInterest: 44.8, fundingRate: 0.011 },
    { label: "09:00", totalOpenInterest: 46.1, fundingRate: 0.009 },
    { label: "13:00", totalOpenInterest: 45.5, fundingRate: 0.012 },
    { label: "17:00", totalOpenInterest: 47.0, fundingRate: 0.01 },
    { label: "21:00", totalOpenInterest: 45.9, fundingRate: 0.007 },
  ],
  "4h": [
    { label: "3/20", totalOpenInterest: 41.5, fundingRate: 0.006 },
    { label: "3/24", totalOpenInterest: 43.1, fundingRate: 0.011 },
    { label: "3/28", totalOpenInterest: 45.7, fundingRate: 0.013 },
    { label: "4/1", totalOpenInterest: 44.6, fundingRate: 0.008 },
    { label: "4/5", totalOpenInterest: 46.8, fundingRate: 0.012 },
    { label: "4/9", totalOpenInterest: 47.5, fundingRate: 0.01 },
    { label: "4/14", totalOpenInterest: 45.9, fundingRate: 0.007 },
  ],
  "12h": [
    { label: "Mar 18", totalOpenInterest: 40.8, fundingRate: 0.004 },
    { label: "Mar 22", totalOpenInterest: 42.4, fundingRate: 0.006 },
    { label: "Mar 26", totalOpenInterest: 44.3, fundingRate: 0.011 },
    { label: "Mar 30", totalOpenInterest: 46.0, fundingRate: 0.013 },
    { label: "Apr 3", totalOpenInterest: 44.8, fundingRate: 0.009 },
    { label: "Apr 7", totalOpenInterest: 47.2, fundingRate: 0.012 },
    { label: "Apr 11", totalOpenInterest: 48.5, fundingRate: 0.014 },
    { label: "Apr 14", totalOpenInterest: 45.9, fundingRate: 0.007 },
  ],
  "1d": [
    { label: "3/15", totalOpenInterest: 39.8, fundingRate: 0.003 },
    { label: "3/18", totalOpenInterest: 41.2, fundingRate: 0.005 },
    { label: "3/21", totalOpenInterest: 42.6, fundingRate: 0.004 },
    { label: "3/24", totalOpenInterest: 44.1, fundingRate: 0.009 },
    { label: "3/27", totalOpenInterest: 43.9, fundingRate: 0.007 },
    { label: "3/30", totalOpenInterest: 46.2, fundingRate: 0.012 },
    { label: "4/2", totalOpenInterest: 45.1, fundingRate: 0.008 },
    { label: "4/5", totalOpenInterest: 47.6, fundingRate: 0.013 },
    { label: "4/8", totalOpenInterest: 48.2, fundingRate: 0.011 },
    { label: "4/11", totalOpenInterest: 49.0, fundingRate: 0.015 },
    { label: "4/14", totalOpenInterest: 45.9, fundingRate: 0.007 },
  ],
};

export const positionExchangeRows: PositionExchangeRow[] = [
  {
    exchangeId: "binance",
    exchange: "Binance",
    pair: "LIT/USDT",
    price1: 1.62,
    price2: 1.62,
    change24h: -0.06,
    volume24h: "$84.25M",
    marketShare: "13.88%",
    fundingRate: "<0.01%",
    positionValue: "$45.90M",
  },
  {
    exchangeId: "aster",
    exchange: "Aster",
    pair: "LIT/USDT",
    price1: 1.62,
    price2: 1.62,
    change24h: -0.05,
    volume24h: "$2.10M",
    marketShare: "0.35%",
    fundingRate: "<0.01%",
    positionValue: "$908,620.04",
  },
  {
    exchangeId: "kucoin",
    exchange: "KuCoin",
    pair: "LIT/USDT",
    price1: 1.62,
    price2: 1.62,
    change24h: -0.12,
    volume24h: "$2.76M",
    marketShare: "0.45%",
    fundingRate: "-0.03%",
    positionValue: "$1.11M",
  },
  {
    exchangeId: "bitmex",
    exchange: "BitMEX",
    pair: "LIT/USDT",
    price1: 1.61,
    price2: 1.62,
    change24h: 1.03,
    volume24h: "$14,812",
    marketShare: "0.00%",
    fundingRate: "+0.01%",
    positionValue: "$6,855.97",
  },
  {
    exchangeId: "okx",
    exchange: "OKX",
    pair: "LIT/USDT",
    price1: 1.63,
    price2: 1.63,
    change24h: 0.04,
    volume24h: "$60.82M",
    marketShare: "10.02%",
    fundingRate: "<0.01%",
    positionValue: "$8.95M",
  },
  {
    exchangeId: "bybit",
    exchange: "Bybit",
    pair: "LIT/USDT",
    price1: 1.62,
    price2: 1.62,
    change24h: -0.04,
    volume24h: "$44.06M",
    marketShare: "7.26%",
    fundingRate: "<0.01%",
    positionValue: "$14.49M",
  },
  {
    exchangeId: "hyperliquid",
    exchange: "Hyperliquid",
    pair: "LIT/USD",
    price1: 1.63,
    price2: 1.62,
    change24h: -0.05,
    volume24h: "$29.27M",
    marketShare: "4.82%",
    fundingRate: "<0.01%",
    positionValue: "$50.09M",
  },
  {
    exchangeId: "gate",
    exchange: "Gate",
    pair: "LIT/USDT",
    price1: 1.62,
    price2: 1.62,
    change24h: -0.13,
    volume24h: "$2.72M",
    marketShare: "0.45%",
    fundingRate: "<0.01%",
    positionValue: "$1.21M",
  },
  {
    exchangeId: "htx",
    exchange: "HTX",
    pair: "LIT/USDT",
    price1: 1.61,
    price2: 1.62,
    change24h: 0.43,
    volume24h: "$706,197",
    marketShare: "0.12%",
    fundingRate: "<0.01%",
    positionValue: "$25,445.54",
  },
];

export const positionDetailDailyRows = [
  ["2026/3/16", "$700.22K", "$635.92K", "$1.34M", "0.96%"],
  ["2026/3/17", "$567.87K", "$562.75K", "$1.13M", "0.91%"],
  ["2026/3/18", "$678.27K", "$677.53K", "$1.36M", "0.11%"],
  ["2026/3/19", "$670.44K", "$632.34K", "$1.30M", "5.85%"],
  ["2026/3/20", "$508.50K", "$472.83K", "$981.33K", "7.27%"],
  ["2026/3/21", "$603.64K", "$533.65K", "$1.14M", "12.31%"],
  ["2026/3/22", "$625.80K", "$624.32K", "$1.25M", "0.24%"],
  ["2026/3/23", "$551.14K", "$592.08K", "$1.14M", "7.16%"],
  ["2026/3/24", "$641.49K", "$635.79K", "$1.28M", "0.89%"],
  ["2026/3/25", "$586.74K", "$588.60K", "$1.18M", "0.32%"],
];
