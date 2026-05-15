import { test, expect } from "@playwright/test";
import { Client } from "pg";

// ---------------------------------------------------------------------------
// True end-to-end coverage of GET /api/admin/orders/by-email/:email against
// the real api-server + real Postgres.
//
// The mocked counterpart in admin-misc.spec.ts only exercises the
// storefront's wouter route + react-query wiring. This spec also covers:
//   - the actual SQL query (email column, lowercase normalization),
//   - the real buildOrderResponse() enrichment, and
//   - the ListAdminOrdersByEmailResponse Zod parse,
// so a regression in any of those layers fails here.
//
// Admin auth is bypassed via a dev-only token (NODE_ENV !== "production"
// inside requireAdmin) wired up in playwright.admin-by-email-real.config.ts.
// ---------------------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set to run the admin orders-by-email real-backend test",
  );
}

type SeededOrder = {
  id: number;
  insertedEmail: string;
  subtotalCents: number;
  totalCents: number;
};

type Seed = {
  normalizedEmail: string;
  unknownEmail: string;
  orders: SeededOrder[];
};

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function seedOrders(unique: string): Promise<Seed> {
  const normalized = `e2e-by-email-${unique}@example.com`;
  // The route normalizes the path param via .trim().toLowerCase() and matches
  // against orders.email. The orders table itself stores the email exactly as
  // inserted, so we deliberately persist the SAME normalized address twice
  // (this matches what the real /api/checkout route does — it lowercases
  // before INSERT). The "mixed-case lookup → lowercase match" assertion
  // happens against the path param, not against the stored value.
  return withDb(async (c) => {
    const rows = await c.query<{ id: number }>(
      `INSERT INTO orders (email, status, subtotal_cents, total_cents, currency, created_at, updated_at)
       VALUES
         ($1, 'paid', 1000, 1000, 'usd', NOW() - INTERVAL '2 minutes', NOW() - INTERVAL '2 minutes'),
         ($1, 'paid', 2500, 2500, 'usd', NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute')
       RETURNING id`,
      [normalized],
    );
    return {
      normalizedEmail: normalized,
      unknownEmail: `e2e-unknown-${unique}@example.com`,
      orders: [
        {
          id: rows.rows[0].id,
          insertedEmail: normalized,
          subtotalCents: 1000,
          totalCents: 1000,
        },
        {
          id: rows.rows[1].id,
          insertedEmail: normalized,
          subtotalCents: 2500,
          totalCents: 2500,
        },
      ],
    };
  });
}

async function cleanupSeed(seed: Seed): Promise<void> {
  await withDb(async (c) => {
    for (const o of seed.orders) {
      await c.query(`DELETE FROM order_items WHERE order_id = $1`, [o.id]);
      await c.query(`DELETE FROM orders WHERE id = $1`, [o.id]);
    }
  });
}

test.describe("GET /api/admin/orders/by-email/:email against real api-server", () => {
  let seed: Seed;

  test.beforeEach(async () => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    seed = await seedOrders(unique);
  });

  test.afterEach(async () => {
    if (seed) await cleanupSeed(seed);
  });

  test("returns every paid order for the lowercased email and an empty list for an unknown one", async ({
    request,
  }) => {
    // The route lowercases the path param before querying, so a deliberately
    // mixed-case lookup must still resolve to the lowercase rows we seeded.
    const mixedCase = seed.normalizedEmail.toUpperCase();
    const lookupRes = await request.get(
      `/api/admin/orders/by-email/${encodeURIComponent(mixedCase)}`,
    );
    expect(lookupRes.status()).toBe(200);
    const lookupBody = (await lookupRes.json()) as {
      email: string;
      orders: Array<{
        id: number;
        email: string | null;
        status: string;
        subtotalCents: number;
        totalCents: number;
      }>;
    };

    // The route echoes the *normalized* email back, not the path param the
    // client sent — this is the contract the OrdersByEmail page relies on.
    expect(lookupBody.email).toBe(seed.normalizedEmail);

    // Both seeded orders must come back. Other tests may have left rows
    // behind for other emails, so we filter by id rather than asserting an
    // exact count on the whole result.
    const seededIds = seed.orders.map((o) => o.id).sort((a, b) => a - b);
    const returnedIds = lookupBody.orders
      .map((o) => o.id)
      .filter((id) => seededIds.includes(id))
      .sort((a, b) => a - b);
    expect(returnedIds).toEqual(seededIds);

    // Spot-check the Zod-parsed shape: status + totals survived the
    // ListAdminOrdersByEmailResponse parse and the normalized email was
    // stamped onto each row.
    const byId = new Map(lookupBody.orders.map((o) => [o.id, o]));
    for (const seeded of seed.orders) {
      const got = byId.get(seeded.id);
      expect(got).toBeDefined();
      expect(got!.status).toBe("paid");
      expect(got!.subtotalCents).toBe(seeded.subtotalCents);
      expect(got!.totalCents).toBe(seeded.totalCents);
      expect(got!.email).toBe(seed.normalizedEmail);
    }

    // Unknown email → 200 with an empty orders array (NOT a 404). The admin
    // OrdersByEmail page renders an empty state from this contract.
    const emptyRes = await request.get(
      `/api/admin/orders/by-email/${encodeURIComponent(seed.unknownEmail)}`,
    );
    expect(emptyRes.status()).toBe(200);
    const emptyBody = (await emptyRes.json()) as {
      email: string;
      orders: unknown[];
    };
    expect(emptyBody.email).toBe(seed.unknownEmail);
    expect(emptyBody.orders).toEqual([]);
  });

  test("rejects requests without the dev-only admin bypass header", async ({
    request,
  }) => {
    // Sanity-check that the bypass is actually required: stripping the
    // x-e2e-admin-bypass header should fall through to Clerk's requireAdmin
    // and return 401, proving the route isn't accidentally world-readable.
    const res = await request.get(
      `/api/admin/orders/by-email/${encodeURIComponent(seed.normalizedEmail)}`,
      { headers: { "x-e2e-admin-bypass": "" } },
    );
    expect(res.status()).toBe(401);
  });
});
