import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { makeApp } from "./helpers";

const geoModule = await import("../routes/geo");
const geoRouter = geoModule.default;
const { _resetGeoCacheForTests } = geoModule;

const app = makeApp((r) => {
  r.use(geoRouter);
});

const PUBLIC_IP = "8.8.8.8";

function withForwardedFor(ip: string) {
  return request(app).get("/api/shipping/locate").set("x-forwarded-for", ip);
}

describe("GET /api/shipping/locate", () => {
  beforeEach(() => {
    _resetGeoCacheForTests();
    delete process.env.IP_GEO_PROVIDER_URL;
    delete process.env.IP_GEO_API_KEY;
    delete process.env.IP_GEO_CACHE_TTL_MS;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns nulls for private/local IPs without calling the provider", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await withForwardedFor("127.0.0.1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zip: null, country: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the provider's zip and country for a public IP", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ postal: "94043", country_code: "us" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await withForwardedFor(PUBLIC_IP);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zip: "94043", country: "US" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("caches repeated lookups so the provider is not hit again", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ postal: "10001", country_code: "US" }), {
        status: 200,
      }),
    );
    const r1 = await withForwardedFor(PUBLIC_IP);
    const r2 = await withForwardedFor(PUBLIC_IP);
    const r3 = await withForwardedFor(PUBLIC_IP);
    expect(r1.body).toEqual({ zip: "10001", country: "US" });
    expect(r2.body).toEqual({ zip: "10001", country: "US" });
    expect(r3.body).toEqual({ zip: "10001", country: "US" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps working when the provider returns 429 rate-limit, falling back to nulls without throwing", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Rate limited", { status: 429 }),
    );
    const res = await withForwardedFor(PUBLIC_IP);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zip: null, country: null });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Failed lookups are NOT cached, so the next call retries the provider.
    const res2 = await withForwardedFor(PUBLIC_IP);
    expect(res2.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("uses the configured provider URL template and appends the API key", async () => {
    process.env.IP_GEO_PROVIDER_URL = "https://example.test/lookup?ip={ip}";
    process.env.IP_GEO_API_KEY = "secret-key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ zip: "02139", country: "US" }), { status: 200 }),
    );
    const res = await withForwardedFor(PUBLIC_IP);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zip: "02139", country: "US" });
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toBe("https://example.test/lookup?ip=8.8.8.8&key=secret-key");
  });

  it("substitutes {key} into the provider URL template when present", async () => {
    process.env.IP_GEO_PROVIDER_URL = "https://example.test/{key}/{ip}";
    process.env.IP_GEO_API_KEY = "abc";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ postal: "1", country_code: "US" }), { status: 200 }),
    );
    await withForwardedFor(PUBLIC_IP);
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://example.test/abc/8.8.8.8");
  });

  it("disables caching when IP_GEO_CACHE_TTL_MS is 0", async () => {
    process.env.IP_GEO_CACHE_TTL_MS = "0";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ postal: "10001", country_code: "US" }), { status: 200 }),
    );
    await withForwardedFor(PUBLIC_IP);
    await withForwardedFor(PUBLIC_IP);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
