import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit is used only to GENERATE SQL migration files from the schema in
 * src/worker/db/schema.ts. Migrations are applied to D1 with:
 *   wrangler d1 migrations apply vibin-db --local | --remote
 */
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/worker/db/schema.ts",
  out: "./migrations",
  verbose: true,
  strict: true,
});
