import { drizzle } from "drizzle-orm/mysql2";
import { coins, exchanges, listings, activities, tokenUnlocks } from "../drizzle/schema.js";

const db = drizzle(process.env.DATABASE_URL);

async function seed() {
  console.log("🌱 Seeding database...");

  // 创建交易所
  const exchangeData = [
    { id: "binance", name: "Binance", logoUrl: "https://cryptologos.cc/logos/binance-coin-bnb-logo.png" },
    { id: "coinbase", name: "Coinbase", logoUrl: "https://cryptologos.cc/logos/coinbase-coin-logo.png" },
    { id: "okx", name: "OKX", logoUrl: "https://cryptologos.cc/logos/okb-okb-logo.png" },
    { id: "bybit", name: "Bybit", logoUrl: "https://cryptologos.cc/logos/bybit-logo.png" },
    { id: "upbit", name: "Upbit", logoUrl: "https://cryptologos.cc/logos/upbit-logo.png" },
  ];

  for (const exchange of exchangeData) {
    await db.insert(exchanges).values(exchange).onDuplicateKeyUpdate({ set: { name: exchange.name } });
  }
  console.log("✅ Exchanges created");

  // 创建币种
  const coinData = [
    {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      description: "Bitcoin is the first successful internet money based on peer-to-peer technology; whereby no central bank or authority is involved in the transaction and production of the Bitcoin currency.",
      logoUrl: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
      website: "https://bitcoin.org",
      whitepaperUrl: "https://bitcoin.org/bitcoin.pdf",
      currentPrice: 9500000, // $95,000 in cents
      marketCap: 185000000000000, // $1.85T in cents
      fdv: 200000000000000,
      totalSupply: 21000000,
      circulatingSupply: 19500000,
    },
    {
      id: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      description: "Ethereum is a decentralized open-source blockchain system that features its own cryptocurrency, Ether. ETH works as a platform for numerous other cryptocurrencies, as well as for the execution of decentralized smart contracts.",
      logoUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
      website: "https://ethereum.org",
      whitepaperUrl: "https://ethereum.org/en/whitepaper/",
      currentPrice: 350000, // $3,500 in cents
      marketCap: 42000000000000, // $420B in cents
      fdv: 42000000000000,
      totalSupply: 120000000,
      circulatingSupply: 120000000,
    },
    {
      id: "solana",
      symbol: "SOL",
      name: "Solana",
      description: "Solana is a highly functional open source project that banks on blockchain technology's permissionless nature to provide decentralized finance (DeFi) solutions.",
      logoUrl: "https://cryptologos.cc/logos/solana-sol-logo.png",
      website: "https://solana.com",
      whitepaperUrl: "https://solana.com/solana-whitepaper.pdf",
      currentPrice: 14000, // $140 in cents
      marketCap: 6500000000000, // $65B in cents
      fdv: 7500000000000,
      totalSupply: 580000000,
      circulatingSupply: 465000000,
    },
    {
      id: "cardano",
      symbol: "ADA",
      name: "Cardano",
      description: "Cardano is a proof-of-stake blockchain platform that says its goal is to allow changemakers, innovators and visionaries to bring about positive global change.",
      logoUrl: "https://cryptologos.cc/logos/cardano-ada-logo.png",
      website: "https://cardano.org",
      whitepaperUrl: "https://cardano.org/white-paper/",
      currentPrice: 95, // $0.95 in cents
      marketCap: 3300000000000, // $33B in cents
      fdv: 4300000000000,
      totalSupply: 45000000000,
      circulatingSupply: 35000000000,
    },
  ];

  for (const coin of coinData) {
    await db.insert(coins).values(coin).onDuplicateKeyUpdate({ set: { currentPrice: coin.currentPrice } });
  }
  console.log("✅ Coins created");

  // 创建上币信息
  const listingData = [
    // Bitcoin listings
    {
      coinId: "bitcoin",
      exchangeId: "binance",
      hasSpot: true,
      hasFutures: true,
      spotListingTime: new Date("2017-07-14"),
      futuresListingTime: new Date("2019-09-13"),
      listingPrice: 250000, // $2,500
      listingVolume24h: 5000000000, // $50M
      listingCirculatingSupply: 16500000,
      listingFdv: 5250000000000, // $52.5B
      currentVolume24h: 2500000000000, // $25B
      currentDepthUp2: 500000000, // $5M
      currentDepthDown2: 500000000,
    },
    {
      coinId: "bitcoin",
      exchangeId: "coinbase",
      hasSpot: true,
      hasFutures: false,
      spotListingTime: new Date("2015-01-26"),
      listingPrice: 22000, // $220
      listingVolume24h: 1000000000, // $10M
      listingCirculatingSupply: 13900000,
      listingFdv: 306000000000, // $3.06B
      currentVolume24h: 1800000000000, // $18B
      currentDepthUp2: 400000000,
      currentDepthDown2: 400000000,
    },
    // Ethereum listings
    {
      coinId: "ethereum",
      exchangeId: "binance",
      hasSpot: true,
      hasFutures: true,
      spotListingTime: new Date("2017-07-14"),
      futuresListingTime: new Date("2020-02-10"),
      listingPrice: 30000, // $300
      listingVolume24h: 2000000000, // $20M
      listingCirculatingSupply: 92000000,
      listingFdv: 2760000000000, // $27.6B
      currentVolume24h: 1500000000000, // $15B
      currentDepthUp2: 300000000,
      currentDepthDown2: 300000000,
    },
    {
      coinId: "ethereum",
      exchangeId: "coinbase",
      hasSpot: true,
      hasFutures: false,
      spotListingTime: new Date("2016-05-21"),
      listingPrice: 1200, // $12
      listingVolume24h: 500000000, // $5M
      listingCirculatingSupply: 72000000,
      listingFdv: 86400000000, // $864M
      currentVolume24h: 1200000000000, // $12B
      currentDepthUp2: 250000000,
      currentDepthDown2: 250000000,
    },
    // Solana listings
    {
      coinId: "solana",
      exchangeId: "binance",
      hasSpot: true,
      hasFutures: true,
      spotListingTime: new Date("2020-08-11"),
      futuresListingTime: new Date("2021-02-02"),
      listingPrice: 150, // $1.5
      listingVolume24h: 50000000, // $500K
      listingCirculatingSupply: 260000000,
      listingFdv: 87000000000, // $870M
      currentVolume24h: 400000000000, // $4B
      currentDepthUp2: 80000000,
      currentDepthDown2: 80000000,
    },
    {
      coinId: "solana",
      exchangeId: "okx",
      hasSpot: true,
      hasFutures: true,
      spotListingTime: new Date("2020-09-15"),
      futuresListingTime: new Date("2021-03-10"),
      listingPrice: 280, // $2.8
      listingVolume24h: 30000000, // $300K
      listingCirculatingSupply: 270000000,
      listingFdv: 75600000000, // $756M
      currentVolume24h: 300000000000, // $3B
      currentDepthUp2: 60000000,
      currentDepthDown2: 60000000,
    },
  ];

  for (const listing of listingData) {
    await db.insert(listings).values(listing);
  }
  console.log("✅ Listings created");

  // 创建活动
  const activityData = [
    {
      coinId: "bitcoin",
      exchangeId: "binance",
      title: "Bitcoin Futures Trading Competition",
      content: "Join our BTC futures trading competition with a prize pool of $100,000",
      url: "https://www.binance.com/en/support/announcement/bitcoin-futures-competition",
      publishTime: new Date("2024-01-15"),
    },
    {
      coinId: "ethereum",
      exchangeId: "binance",
      title: "ETH Staking Rewards Increased",
      content: "Ethereum staking APY increased to 5.2%",
      url: "https://www.binance.com/en/support/announcement/eth-staking-update",
      publishTime: new Date("2024-02-20"),
    },
    {
      coinId: "solana",
      exchangeId: "binance",
      title: "SOL Trading Fee Discount",
      content: "Get 50% off on SOL trading fees for the next 7 days",
      url: "https://www.binance.com/en/support/announcement/sol-fee-discount",
      publishTime: new Date("2024-03-10"),
    },
    {
      coinId: "solana",
      exchangeId: "coinbase",
      title: "Solana Now Available on Coinbase",
      content: "Coinbase is pleased to announce support for Solana (SOL)",
      url: "https://blog.coinbase.com/solana-sol-is-launching-on-coinbase",
      publishTime: new Date("2021-06-17"),
    },
  ];

  for (const activity of activityData) {
    await db.insert(activities).values(activity);
  }
  console.log("✅ Activities created");

  // 创建解锁信息
  const unlockData = [
    {
      coinId: "solana",
      unlockDate: new Date("2024-06-01"),
      unlockAmount: 5000000,
      percentageOfTotalSupply: 862, // 8.62%
      recipientCategory: "Team",
    },
    {
      coinId: "solana",
      unlockDate: new Date("2024-09-01"),
      unlockAmount: 8000000,
      percentageOfTotalSupply: 1379, // 13.79%
      recipientCategory: "Investors",
    },
    {
      coinId: "solana",
      unlockDate: new Date("2024-12-01"),
      unlockAmount: 12000000,
      percentageOfTotalSupply: 2069, // 20.69%
      recipientCategory: "Community",
    },
    {
      coinId: "cardano",
      unlockDate: new Date("2024-07-15"),
      unlockAmount: 2000000000,
      percentageOfTotalSupply: 444, // 4.44%
      recipientCategory: "Foundation",
    },
    {
      coinId: "cardano",
      unlockDate: new Date("2025-01-15"),
      unlockAmount: 3000000000,
      percentageOfTotalSupply: 667, // 6.67%
      recipientCategory: "Ecosystem",
    },
  ];

  for (const unlock of unlockData) {
    await db.insert(tokenUnlocks).values(unlock);
  }
  console.log("✅ Token unlocks created");

  console.log("🎉 Seeding completed!");
}

seed().catch((error) => {
  console.error("❌ Seeding failed:", error);
  process.exit(1);
});
