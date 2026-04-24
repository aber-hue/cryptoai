import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getFeaturePool } from "../server/featureDb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseSqlStatements(sqlText: string) {
  return sqlText
    .split("--> statement-breakpoint")
    .map(statement => statement.trim())
    .filter(Boolean);
}

async function applySignalTables() {
  const sqlPath = path.resolve(__dirname, "../drizzle/0006_signal_tables.sql");
  const sqlText = readFileSync(sqlPath, "utf8");
  const statements = parseSqlStatements(sqlText);
  const pool = getFeaturePool();

  console.log(`Applying ${statements.length} signal schema statements to FEATURE_DATABASE_URL...`);

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log("Signal schema applied to feature database.");
  await pool.end();
}

applySignalTables().catch(error => {
  console.error("Failed to apply signal schema", error);
  process.exit(1);
});
