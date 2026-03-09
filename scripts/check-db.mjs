import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log("Database connection check passed.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Database connection check failed.");
    console.error(`DATABASE_URL: ${databaseUrl}`);
    console.error(`Reason: ${message}`);
    console.error("Confirm the configured PostgreSQL or Neon database is reachable, then run `npm run db:setup`.");
    process.exit(1);
  } finally {
    await client.end().catch(() => undefined);
  }
}

await main();
