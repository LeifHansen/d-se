import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { db, resetDb } from "./testDb";
import { userProfilesTable } from "@workspace/db";
import { makeApp } from "./helpers";

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const accountRouter = (await import("../routes/account")).default;

const app = makeApp((r) => {
  r.use(accountRouter);
});

const ADDRESS = {
  name: "Ada Lovelace",
  street1: "1 Analytical Way",
  street2: "Apt 2",
  city: "London",
  state: "LDN",
  zip: "EC1",
  country: "GB",
  phone: "555-0100",
};

beforeEach(async () => {
  await resetDb();
  __setAuth(null);
});

describe("/me/saved-address", () => {
  it("requires auth", async () => {
    __setAuth(null);
    const r1 = await request(app).get("/api/me/saved-address");
    expect(r1.status).toBe(401);
    const r2 = await request(app)
      .put("/api/me/saved-address")
      .send({ address: ADDRESS });
    expect(r2.status).toBe(401);
  });

  it("returns null when nothing is saved", async () => {
    __setAuth("user_a");
    const res = await request(app).get("/api/me/saved-address");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ address: null });
  });

  it("upserts and returns the saved address; round-trips", async () => {
    __setAuth("user_a");
    const put = await request(app)
      .put("/api/me/saved-address")
      .send({ address: ADDRESS });
    expect(put.status).toBe(200);
    expect(put.body.address).toMatchObject({
      name: ADDRESS.name,
      street1: ADDRESS.street1,
      city: ADDRESS.city,
      zip: ADDRESS.zip,
      country: ADDRESS.country,
    });

    const get = await request(app).get("/api/me/saved-address");
    expect(get.status).toBe(200);
    expect(get.body.address).toMatchObject({
      name: ADDRESS.name,
      street1: ADDRESS.street1,
    });

    // Updating overwrites
    const updated = { ...ADDRESS, street1: "2 Programmer Lane" };
    const put2 = await request(app)
      .put("/api/me/saved-address")
      .send({ address: updated });
    expect(put2.status).toBe(200);
    expect(put2.body.address.street1).toBe("2 Programmer Lane");

    const rows = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.userId, "user_a"));
    expect(rows).toHaveLength(1);
    expect(rows[0].savedAddress?.street1).toBe("2 Programmer Lane");
  });

  it("isolates per user", async () => {
    __setAuth("user_a");
    await request(app)
      .put("/api/me/saved-address")
      .send({ address: ADDRESS });

    __setAuth("user_b");
    const res = await request(app).get("/api/me/saved-address");
    expect(res.body).toEqual({ address: null });
  });

  it("rejects bad address payloads", async () => {
    __setAuth("user_a");
    const res = await request(app)
      .put("/api/me/saved-address")
      .send({ address: { name: "x" } });
    expect(res.status).toBe(400);
  });
});
