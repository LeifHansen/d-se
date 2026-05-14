import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { pushSchema } from "drizzle-kit/api";
import * as schema from "@workspace/db/schema";

export const pglite = new PGlite();
export const db = drizzle(pglite, { schema });

let initialized = false;
let truncateSql: string | null = null;

export async function initSchema(): Promise<void> {
  if (initialized) return;
  const { apply, statementsToExecute } = await pushSchema(
    schema as unknown as Record<string, unknown>,
    db as unknown as PgDatabase<never>,
  );
  await apply();

  const tableNames = new Set<string>();
  for (const stmt of statementsToExecute) {
    const match = stmt.match(
      /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+"?([\w.]+)"?/i,
    );
    if (match) {
      tableNames.add(match[1].replace(/^public\./, ""));
    }
  }
  if (tableNames.size > 0) {
    const list = Array.from(tableNames)
      .map((t) => `"${t}"`)
      .join(", ");
    truncateSql = `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`;
  }
  initialized = true;
}

export async function resetDb(): Promise<void> {
  await initSchema();
  if (truncateSql) {
    await db.execute(sql.raw(truncateSql));
  }
}
