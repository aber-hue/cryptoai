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

async function applyLabelTables() {
  const sqlPath = path.resolve(__dirname, "../drizzle/0008_label_tables.sql");
  const sqlText = readFileSync(sqlPath, "utf8");
  const statements = parseSqlStatements(sqlText);
  const pool = getFeaturePool();

  console.log(`Applying ${statements.length} label schema statements to FEATURE_DATABASE_URL...`);

  for (const statement of statements) {
    await pool.query(statement);
  }

  console.log("Label schema applied to feature database.");
  await pool.end();
}

applyLabelTables().catch(error => {
  console.error("Failed to apply label schema", error);
  process.exit(1);
});
