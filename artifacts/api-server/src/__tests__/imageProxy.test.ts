import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Readable } from "node:stream";
import { makeApp } from "./helpers";

const storageMock = vi.hoisted(() => ({
  searchPublicObject: vi.fn(),
  getObjectEntityFile: vi.fn(),
}));

const aclMock = vi.hoisted(() => ({
  getObjectAclPolicy: vi.fn(),
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
    }
  }
  return {
    ObjectNotFoundError,
    ObjectStorageService: class {
      searchPublicObject = storageMock.searchPublicObject;
      getObjectEntityFile = storageMock.getObjectEntityFile;
    },
  };
});

vi.mock("../lib/objectAcl", () => ({
  getObjectAclPolicy: aclMock.getObjectAclPolicy,
}));

const imageProxyRouter = (await import("../routes/imageProxy")).default;

const app = makeApp((r) => {
  r.use(imageProxyRouter);
});

function makeFakeFile(opts: {
  body: Buffer;
  contentType: string;
}): unknown {
  return {
    getMetadata: async () => [{ contentType: opts.contentType }],
    createReadStream: () => Readable.from([opts.body]),
  };
}

describe("GET /api/storage/img — validation", () => {
  beforeEach(() => {
    storageMock.searchPublicObject.mockReset();
    storageMock.getObjectEntityFile.mockReset();
    aclMock.getObjectAclPolicy.mockReset();
  });

  it("returns 400 when src is missing", async () => {
    const res = await request(app).get("/api/storage/img").query({ w: 640 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when src is not a recognized prefix", async () => {
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "https://evil.example/x.png", w: 640 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for a width that's not in the allowed list", async () => {
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "/public-objects/x.png", w: 123 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an unknown format", async () => {
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "/public-objects/x.png", w: 640, format: "bmp" });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/storage/img — public object resolution", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when the public object cannot be found", async () => {
    storageMock.searchPublicObject.mockResolvedValue(null);
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "/public-objects/missing.png", w: 640 });
    expect(res.status).toBe(404);
  });

  it("streams SVG passthrough without transforming", async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>');
    storageMock.searchPublicObject.mockResolvedValue(
      makeFakeFile({ body: svg, contentType: "image/svg+xml" }),
    );
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "/public-objects/icon.svg", w: 640 });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/svg\+xml/);
    expect(res.headers["cache-control"]).toMatch(/immutable/);
    expect(res.body.toString()).toContain("<svg");
  });
});

describe("GET /api/storage/img — private object ACL gating", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when the object exists but is not public", async () => {
    storageMock.getObjectEntityFile.mockResolvedValue(
      makeFakeFile({
        body: Buffer.from("nope"),
        contentType: "image/png",
      }),
    );
    aclMock.getObjectAclPolicy.mockResolvedValue({ visibility: "private" });
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "/objects/abc", w: 640 });
    expect(res.status).toBe(403);
  });

  it("returns 404 when the object entity file is not found", async () => {
    const { ObjectNotFoundError } = await import("../lib/objectStorage");
    storageMock.getObjectEntityFile.mockRejectedValue(new ObjectNotFoundError());
    const res = await request(app)
      .get("/api/storage/img")
      .query({ src: "/objects/missing", w: 640 });
    expect(res.status).toBe(404);
  });
});
