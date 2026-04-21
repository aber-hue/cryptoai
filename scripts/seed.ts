import { drizzle } from "drizzle-orm/mysql2";
import { coins, exchanges, listings, activities, tokenUnlocks, addressHoldings } from "../drizzle/schema";

const db = drizzle(process.env.DATABASE_URL!);

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

  // 创建20个币种
  const coinData = [
    {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      description: "The first decentralized cryptocurrency and digital payment system.",
      logoUrl: "https://cryptologos.cc/logos/bitcoin-btc-logo.png",
      website: "https://bitcoin.org",
      whitepaperUrl: "https://bitcoin.org/bitcoin.pdf",
      currentPrice: 9500000,
      marketCap: 185000000000000,
      fdv: 200000000000000,
      totalSupply: 21000000,
      circulatingSupply: 19500000,
    },
    {
      id: "ethereum",
      symbol: "ETH",
      name: "Ethereum",
      description: "A decentralized platform for smart contracts and dApps.",
      logoUrl: "https://cryptologos.cc/logos/ethereum-eth-logo.png",
      website: "https://ethereum.org",
      whitepaperUrl: "https://ethereum.org/en/whitepaper/",
      currentPrice: 350000,
      marketCap: 42000000000000,
      fdv: 42000000000000,
      totalSupply: 120000000,
      circulatingSupply: 120000000,
    },
    {
      id: "solana",
      symbol: "SOL",
      name: "Solana",
      description: "A high-performance blockchain supporting builders around the world.",
      logoUrl: "https://cryptologos.cc/logos/solana-sol-logo.png",
      website: "https://solana.com",
      whitepaperUrl: "https://solana.com/solana-whitepaper.pdf",
      currentPrice: 14000,
      marketCap: 6500000000000,
      fdv: 7500000000000,
      totalSupply: 580000000,
      circulatingSupply: 465000000,
    },
    {
      id: "cardano",
      symbol: "ADA",
      name: "Cardano",
      description: "A proof-of-stake blockchain platform for changemakers and innovators.",
      logoUrl: "https://cryptologos.cc/logos/cardano-ada-logo.png",
      website: "https://cardano.org",
      whitepaperUrl: "https://cardano.org/white-paper/",
      currentPrice: 95,
      marketCap: 3300000000000,
      fdv: 4300000000000,
      totalSupply: 45000000000,
      circulatingSupply: 35000000000,
    },
    {
      id: "ripple",
      symbol: "XRP",
      name: "Ripple",
      description: "A digital payment protocol for fast and low-cost international money transfers.",
      logoUrl: "https://cryptologos.cc/logos/xrp-xrp-logo.png",
      website: "https://ripple.com",
      whitepaperUrl: null,
      currentPrice: 60,
      marketCap: 3200000000000,
      fdv: 6000000000000,
      totalSupply: 100000000000,
      circulatingSupply: 53000000000,
    },
    {
      id: "polkadot",
      symbol: "DOT",
      name: "Polkadot",
      description: "A multi-chain protocol connecting and securing unique blockchains.",
      logoUrl: "https://cryptologos.cc/logos/polkadot-new-dot-logo.png",
      website: "https://polkadot.network",
      whitepaperUrl: "https://polkadot.network/whitepaper/",
      currentPrice: 750,
      marketCap: 1050000000000,
      fdv: 1200000000000,
      totalSupply: 1600000000,
      circulatingSupply: 1400000000,
    },
    {
      id: "avalanche",
      symbol: "AVAX",
      name: "Avalanche",
      description: "A platform for launching decentralized applications and enterprise blockchain deployments.",
      logoUrl: "https://cryptologos.cc/logos/avalanche-avax-logo.png",
      website: "https://www.avax.network",
      whitepaperUrl: null,
      currentPrice: 4200,
      marketCap: 1680000000000,
      fdv: 1680000000000,
      totalSupply: 400000000,
      circulatingSupply: 400000000,
    },
    {
      id: "chainlink",
      symbol: "LINK",
      name: "Chainlink",
      description: "A decentralized oracle network providing real-world data to smart contracts.",
      logoUrl: "https://cryptologos.cc/logos/chainlink-link-logo.png",
      website: "https://chain.link",
      whitepaperUrl: "https://chain.link/whitepaper",
      currentPrice: 1850,
      marketCap: 1110000000000,
      fdv: 1850000000000,
      totalSupply: 1000000000,
      circulatingSupply: 600000000,
    },
    {
      id: "polygon",
      symbol: "MATIC",
      name: "Polygon",
      description: "A protocol and framework for building and connecting Ethereum-compatible blockchain networks.",
      logoUrl: "https://cryptologos.cc/logos/polygon-matic-logo.png",
      website: "https://polygon.technology",
      whitepaperUrl: null,
      currentPrice: 110,
      marketCap: 1100000000000,
      fdv: 1100000000000,
      totalSupply: 10000000000,
      circulatingSupply: 10000000000,
    },
    {
      id: "uniswap",
      symbol: "UNI",
      name: "Uniswap",
      description: "A leading decentralized trading protocol on Ethereum.",
      logoUrl: "https://cryptologos.cc/logos/uniswap-uni-logo.png",
      website: "https://uniswap.org",
      whitepaperUrl: null,
      currentPrice: 1200,
      marketCap: 900000000000,
      fdv: 1200000000000,
      totalSupply: 1000000000,
      circulatingSupply: 750000000,
    },
    {
      id: "litecoin",
      symbol: "LTC",
      name: "Litecoin",
      description: "A peer-to-peer cryptocurrency created as a 'lite' version of Bitcoin.",
      logoUrl: "https://cryptologos.cc/logos/litecoin-ltc-logo.png",
      website: "https://litecoin.org",
      whitepaperUrl: null,
      currentPrice: 10500,
      marketCap: 788000000000,
      fdv: 882000000000,
      totalSupply: 84000000,
      circulatingSupply: 75000000,
    },
    {
      id: "near",
      symbol: "NEAR",
      name: "NEAR Protocol",
      description: "A sharded, proof-of-stake, layer-one blockchain designed to be fast and developer-friendly.",
      logoUrl: "https://cryptologos.cc/logos/near-protocol-near-logo.png",
      website: "https://near.org",
      whitepaperUrl: "https://near.org/papers/the-official-near-white-paper/",
      currentPrice: 650,
      marketCap: 715000000000,
      fdv: 715000000000,
      totalSupply: 1100000000,
      circulatingSupply: 1100000000,
    },
    {
      id: "cosmos",
      symbol: "ATOM",
      name: "Cosmos",
      description: "An ecosystem of interconnected blockchains designed to scale and interoperate.",
      logoUrl: "https://cryptologos.cc/logos/cosmos-atom-logo.png",
      website: "https://cosmos.network",
      whitepaperUrl: "https://v1.cosmos.network/resources/whitepaper",
      currentPrice: 1100,
      marketCap: 429000000000,
      fdv: 429000000000,
      totalSupply: 390000000,
      circulatingSupply: 390000000,
    },
    {
      id: "algorand",
      symbol: "ALGO",
      name: "Algorand",
      description: "A pure proof-of-stake blockchain delivering decentralization, scalability, and security.",
      logoUrl: "https://cryptologos.cc/logos/algorand-algo-logo.png",
      website: "https://algorand.com",
      whitepaperUrl: "https://algorand.com/technology/white-papers",
      currentPrice: 35,
      marketCap: 280000000000,
      fdv: 350000000000,
      totalSupply: 10000000000,
      circulatingSupply: 8000000000,
    },
    {
      id: "aptos",
      symbol: "APT",
      name: "Aptos",
      description: "A Layer 1 blockchain built for safety and scalability using the Move programming language.",
      logoUrl: "https://cryptologos.cc/logos/aptos-apt-logo.png",
      website: "https://aptoslabs.com",
      whitepaperUrl: null,
      currentPrice: 1250,
      marketCap: 625000000000,
      fdv: 1250000000000,
      totalSupply: 1000000000,
      circulatingSupply: 500000000,
    },
    {
      id: "arbitrum",
      symbol: "ARB",
      name: "Arbitrum",
      description: "A Layer 2 scaling solution for Ethereum using optimistic rollups.",
      logoUrl: "https://cryptologos.cc/logos/arbitrum-arb-logo.png",
      website: "https://arbitrum.io",
      whitepaperUrl: null,
      currentPrice: 180,
      marketCap: 720000000000,
      fdv: 1800000000000,
      totalSupply: 10000000000,
      circulatingSupply: 4000000000,
    },
    {
      id: "optimism",
      symbol: "OP",
      name: "Optimism",
      description: "An Ethereum Layer 2 scaling solution using optimistic rollup technology.",
      logoUrl: "https://cryptologos.cc/logos/optimism-ethereum-op-logo.png",
      website: "https://optimism.io",
      whitepaperUrl: null,
      currentPrice: 320,
      marketCap: 320000000000,
      fdv: 1376000000000,
      totalSupply: 4300000000,
      circulatingSupply: 1000000000,
    },
    {
      id: "sui",
      symbol: "SUI",
      name: "Sui",
      description: "A Layer 1 blockchain designed to make digital asset ownership fast, private, and secure.",
      logoUrl: "https://cryptologos.cc/logos/sui-sui-logo.png",
      website: "https://sui.io",
      whitepaperUrl: null,
      currentPrice: 450,
      marketCap: 1350000000000,
      fdv: 4500000000000,
      totalSupply: 10000000000,
      circulatingSupply: 3000000000,
    },
    {
      id: "immutable",
      symbol: "IMX",
      name: "Immutable X",
      description: "A Layer 2 scaling solution for NFTs on Ethereum with zero gas fees.",
      logoUrl: "https://cryptologos.cc/logos/immutable-x-imx-logo.png",
      website: "https://www.immutable.com",
      whitepaperUrl: null,
      currentPrice: 280,
      marketCap: 560000000000,
      fdv: 560000000000,
      totalSupply: 2000000000,
      circulatingSupply: 2000000000,
    },
    {
      id: "starknet",
      symbol: "STRK",
      name: "Starknet",
      description: "A permissionless decentralized ZK-Rollup operating as an L2 network over Ethereum.",
      logoUrl: "https://cryptologos.cc/logos/starknet-strk-logo.png",
      website: "https://starknet.io",
      whitepaperUrl: null,
      currentPrice: 95,
      marketCap: 950000000000,
      fdv: 950000000000,
      totalSupply: 10000000000,
      circulatingSupply: 10000000000,
    },
  ];

  for (const coin of coinData) {
    await db.insert(coins).values(coin).onDuplicateKeyUpdate({ set: { currentPrice: coin.currentPrice } });
  }
  console.log("✅ Coins created (20 coins)");

  // 为每个币种创建上币信息
  const listingData = [];
  const exchangeIds = ["binance", "coinbase", "okx", "bybit", "upbit"];
  
  for (const coin of coinData) {
    // 每个币随机上2-4个交易所
    const numExchanges = Math.floor(Math.random() * 3) + 2;
    const selectedExchanges = exchangeIds.slice(0, numExchanges);
    
    for (const exchangeId of selectedExchanges) {
      const hasSpot = Math.random() > 0.2;
      const hasFutures = Math.random() > 0.3;
      
      const spotDate = hasSpot ? new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000) : null;
      const futuresDate = hasFutures ? new Date(Date.now() - Math.random() * 200 * 24 * 60 * 60 * 1000) : null;
      
      listingData.push({
        coinId: coin.id,
        exchangeId,
        hasSpot,
        hasFutures,
        spotListingTime: spotDate,
        futuresListingTime: futuresDate,
        listingPrice: Math.floor(coin.currentPrice * (0.5 + Math.random() * 0.8)),
        listingVolume24h: Math.floor(Math.random() * 10000000000),
        listingCirculatingSupply: Math.floor(coin.circulatingSupply * (0.6 + Math.random() * 0.3)),
        listingFdv: Math.floor(coin.fdv * (0.5 + Math.random() * 0.8)),
        listingMarketCap: Math.floor(coin.marketCap * (0.5 + Math.random() * 0.8)),
        currentVolume24h: Math.floor(Math.random() * 15000000000),
        currentDepthUp2: Math.floor(Math.random() * 5000000000),
        currentDepthDown2: Math.floor(Math.random() * 5000000000),
      });
    }
  }

  for (const listing of listingData) {
    await db.insert(listings).values(listing);
  }
  console.log(`✅ Listings created (${listingData.length} listings)`);

  // 为每个币种创建活动
  const activityData = [];
  for (const coin of coinData) {
    const numActivities = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < numActivities; i++) {
      const exchangeId = exchangeIds[Math.floor(Math.random() * exchangeIds.length)];
      const publishDate = new Date(Date.now() - Math.random() * 300 * 24 * 60 * 60 * 1000);
      
      activityData.push({
        coinId: coin.id,
        exchangeId,
        title: `${coin.symbol} Trading Competition`,
        content: `Join the ${coin.name} trading competition and win rewards!`,
        publishTime: publishDate,
        url: `https://example.com/activity/${coin.id}`,
        snapshotPrice: Math.floor(coin.currentPrice * (0.7 + Math.random() * 0.5)),
        snapshotFdv: Math.floor(coin.fdv * (0.7 + Math.random() * 0.5)),
        snapshotMarketCap: Math.floor(coin.marketCap * (0.7 + Math.random() * 0.5)),
        snapshotCirculatingSupply: Math.floor(coin.circulatingSupply * (0.8 + Math.random() * 0.2)),
      });
    }
  }

  for (const activity of activityData) {
    await db.insert(activities).values(activity);
  }
  console.log(`✅ Activities created (${activityData.length} activities)`);

  // 为每个币种创建解锁计划
  const unlockData = [];
  const categories = ["Airdrop", "Liquidity", "Team", "Treasury", "Ecosystem"];
  
  for (const coin of coinData) {
    const numUnlocks = 24; // 24个月的解锁计划
    for (let i = 0; i < numUnlocks; i++) {
      const category = categories[Math.floor(Math.random() * categories.length)];
      const unlockDate = new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000);
      const unlockAmount = Math.floor((coin.totalSupply - coin.circulatingSupply) / numUnlocks * (0.8 + Math.random() * 0.4));
      
      unlockData.push({
        coinId: coin.id,
        unlockDate,
        unlockAmount,
        recipientCategory: category,
        percentageOfTotalSupply: Math.floor((unlockAmount / coin.totalSupply) * 10000),
      });
    }
  }

  for (const unlock of unlockData) {
    await db.insert(tokenUnlocks).values(unlock);
  }
  console.log(`✅ Token unlocks created (${unlockData.length} unlocks)`);

  // 创建地址持仓数据（以 Solana 为例）
  const addressHoldingData = [
    // 交易所地址
    {
      coinId: "solana",
      address: "0x1234567890abcdef1234567890abcdef12345678",
      balance: 15000000,
      percentageOfCirculating: 3000, // 30%
      isExchange: true,
      exchangeId: "binance",
      label: "Binance Hot Wallet",
    },
    {
      coinId: "solana",
      address: "0xabcdef1234567890abcdef1234567890abcdef12",
      balance: 12000000,
      percentageOfCirculating: 2400, // 24%
      isExchange: true,
      exchangeId: "coinbase",
      label: "Coinbase Cold Wallet",
    },
    {
      coinId: "solana",
      address: "0x7890abcdef1234567890abcdef1234567890abcd",
      balance: 8000000,
      percentageOfCirculating: 1600, // 16%
      isExchange: true,
      exchangeId: "okx",
      label: "OKX Hot Wallet",
    },
    // 非交易所地址 Top 50
    {
      coinId: "solana",
      address: "0xdeadbeef1234567890abcdef1234567890abcdef",
      balance: 5000000,
      percentageOfCirculating: 1000, // 10%
      isExchange: false,
      label: "Solana Foundation",
    },
    {
      coinId: "solana",
      address: "0xcafebabe1234567890abcdef1234567890abcdef",
      balance: 3000000,
      percentageOfCirculating: 600, // 6%
      isExchange: false,
      label: "Team Wallet 1",
    },
  ];

  // 添加更多非交易所地址（模拟 Top 50）
  for (let i = 0; i < 45; i++) {
    addressHoldingData.push({
      coinId: "solana",
      address: `0x${Math.random().toString(16).substring(2, 42)}`,
      balance: Math.floor(Math.random() * 2000000) + 100000,
      percentageOfCirculating: Math.floor(Math.random() * 400) + 20,
      isExchange: false,
      label: i % 3 === 0 ? `Whale #${i + 1}` : undefined,
    });
  }

  for (const holding of addressHoldingData) {
    await db.insert(addressHoldings).values(holding);
  }
  console.log(`✅ Address holdings created (${addressHoldingData.length} addresses)`);

  console.log("✨ Seeding completed!");
}

seed()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
