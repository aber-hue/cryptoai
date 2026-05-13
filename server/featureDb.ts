import { createPool, type PoolOptions } from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";

let featurePool: ReturnType<typeof createPool> | null = null;
let featureDb: any = null;

function buildFeaturePoolOptions() {
  const databaseUrl = process.env.FEATURE_DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("FEATURE_DATABASE_URL is not configured");
  }

  const url = new URL(databaseUrl);
  const options: PoolOptions = {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    charset: url.searchParams.get("charset") ?? "utf8mb4",
    waitForConnections: true,
    connectionLimit: Number(url.searchParams.get("connection_limit") ?? 10),
  };

  return options;
}

export function getFeaturePool() {
  if (featurePool) return featurePool;
  featurePool = createPool(buildFeaturePoolOptions());
  return featurePool;
}

export function getFeatureDb() {
  if (!featureDb) {
    featureDb = drizzle(getFeaturePool());
  }
  return featureDb;
}
