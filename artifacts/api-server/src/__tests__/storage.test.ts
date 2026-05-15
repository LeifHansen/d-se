import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { Readable } from "node:stream";
import { makeApp } from "./helpers";

const storageMock = vi.hoisted(() => ({
  getObjectEntityUploadURL: vi.fn(),
  normalizeObjectEntityPath: vi.fn(),
  searchPublicObject: vi.fn(),
  getObjectEntityFile: vi.fn(),
  canAccessObjectEntity: vi.fn(),
  downloadObject: vi.fn(),
}));

vi.mock("../lib/objectStorage", () => {
  class ObjectNotFoundError extends Error {
    constructor() {
      super("Object not found");
      this.name = "ObjectNotFoundError";
      Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
    }
  }
  return {
    ObjectNotFoundError,
    ObjectStorageService: class {
      getObjectEntityUploadURL = storageMock.getObjectEntityUploadURL;
      normalizeObjectEntityPath = storageMock.normalizeObjectEntityPath;
      searchPublicObject = storageMock.searchPublicObject;
      getObjectEntityFile = storageMock.getObjectEntityFile;
      canAccessObjectEntity = storageMock.canAccessObjectEntity;
      downloadObject = storageMock.downloadObject;
    },
  };
});

vi.mock("../lib/objectAcl", () => ({
  ObjectPermission: { READ: "read", WRITE: "write" },
}));

import * as clerk from "@clerk/express";
const { __setAuth } = clerk as unknown as {
  __setAuth: (userId: string | null, user?: unknown) => void;
};

const storageRouter = (await import("../routes/storage")).default;

const app = makeApp((r) => {
  r.use(storageRouter);
});

function makeFakeFile(): unknown {
  return { name: "fake-file" };
}

function makeFakeResponse(opts: {
  status?: number;
  contentType?: string;
  body?: Buffer | null;
}): Response {
  const status = opts.status ?? 200;
  const headers = new Headers();
  if (opts.contentType) headers.set("content-type", opts.contentType);
  const body = opts.body
    ? new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(opts.body!));
          controller.close();
        },
      })
    : null;
  return { status, headers, body } as unknown as Response;
}

beforeEach(() => {
  storageMock.getObjectEntityUploadURL.mockReset();
  storageMock.normalizeObjectEntityPath.mockReset();
  storageMock.searchPublicObject.mockReset();
  storageMock.getObjectEntityFile.mockReset();
  storageMock.canAccessObjectEntity.mockReset();
  storageMock.downloadObject.mockReset();
  __setAuth(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/storage/uploads/request-url", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "file.png", size: 100, contentType: "image/png" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is missing required fields", async () => {
    __setAuth("user_1");
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "file.png" });
    expect(res.status).toBe(400);
  });

  it("returns a presigned upload URL and normalized object path", async () => {
    __setAuth("user_1");
    storageMock.getObjectEntityUploadURL.mockResolvedValue(
      "https://signed.example/upload?token=abc",
    );
    storageMock.normalizeObjectEntityPath.mockReturnValue("/objects/uploads/abc");
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "file.png", size: 100, contentType: "image/png" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      uploadURL: "https://signed.example/upload?token=abc",
      objectPath: "/objects/uploads/abc",
      metadata: { name: "file.png", size: 100, contentType: "image/png" },
    });
    expect(storageMock.normalizeObjectEntityPath).toHaveBeenCalledWith(
      "https://signed.example/upload?token=abc",
    );
  });

  it("returns 500 when generating the upload URL fails", async () => {
    __setAuth("user_1");
    storageMock.getObjectEntityUploadURL.mockRejectedValue(new Error("boom"));
    const res = await request(app)
      .post("/api/storage/uploads/request-url")
      .send({ name: "file.png", size: 100, contentType: "image/png" });
    expect(res.status).toBe(500);
  });
});

describe("GET /api/storage/public-objects/*", () => {
  it("returns 404 when the public object cannot be found", async () => {
    storageMock.searchPublicObject.mockResolvedValue(null);
    const res = await request(app).get("/api/storage/public-objects/missing.png");
    expect(res.status).toBe(404);
  });

  it("streams the public object body with upstream headers", async () => {
    storageMock.searchPublicObject.mockResolvedValue(makeFakeFile());
    storageMock.downloadObject.mockResolvedValue(
      makeFakeResponse({
        contentType: "image/png",
        body: Buffer.from("PNGDATA"),
      }),
    );
    const res = await request(app).get("/api/storage/public-objects/logo.png");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/png/);
    expect(res.body.toString()).toBe("PNGDATA");
  });

  it("returns 500 when serving the public object fails", async () => {
    storageMock.searchPublicObject.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/storage/public-objects/logo.png");
    expect(res.status).toBe(500);
  });
});

describe("GET /api/storage/objects/* — ACL gating", () => {
  it("returns 401 when unauthenticated and access is denied", async () => {
    storageMock.getObjectEntityFile.mockResolvedValue(makeFakeFile());
    storageMock.canAccessObjectEntity.mockResolvedValue(false);
    const res = await request(app).get("/api/storage/objects/abc");
    expect(res.status).toBe(401);
    expect(storageMock.canAccessObjectEntity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined, requestedPermission: "read" }),
    );
  });

  it("returns 403 when authenticated but access is denied", async () => {
    __setAuth("user_1");
    storageMock.getObjectEntityFile.mockResolvedValue(makeFakeFile());
    storageMock.canAccessObjectEntity.mockResolvedValue(false);
    const res = await request(app).get("/api/storage/objects/abc");
    expect(res.status).toBe(403);
    expect(storageMock.canAccessObjectEntity).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", requestedPermission: "read" }),
    );
  });

  it("streams the object when public (no auth required)", async () => {
    storageMock.getObjectEntityFile.mockResolvedValue(makeFakeFile());
    storageMock.canAccessObjectEntity.mockResolvedValue(true);
    storageMock.downloadObject.mockResolvedValue(
      makeFakeResponse({
        contentType: "image/jpeg",
        body: Buffer.from("JPEGDATA"),
      }),
    );
    const res = await request(app).get("/api/storage/objects/public-asset");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/image\/jpeg/);
    expect(res.body.toString()).toBe("JPEGDATA");
  });

  it("streams the object when an authenticated user has access", async () => {
    __setAuth("user_1");
    storageMock.getObjectEntityFile.mockResolvedValue(makeFakeFile());
    storageMock.canAccessObjectEntity.mockResolvedValue(true);
    storageMock.downloadObject.mockResolvedValue(
      makeFakeResponse({
        contentType: "application/pdf",
        body: Buffer.from("PDFDATA"),
      }),
    );
    const res = await request(app).get("/api/storage/objects/private-asset");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/pdf/);
    expect(res.body.toString()).toBe("PDFDATA");
    expect(storageMock.getObjectEntityFile).toHaveBeenCalledWith(
      "/objects/private-asset",
    );
  });

  it("returns 404 when the object entity file is not found", async () => {
    const { ObjectNotFoundError } = await import("../lib/objectStorage");
    storageMock.getObjectEntityFile.mockRejectedValue(new ObjectNotFoundError());
    const res = await request(app).get("/api/storage/objects/missing");
    expect(res.status).toBe(404);
  });

  it("returns 500 when an unexpected error occurs", async () => {
    storageMock.getObjectEntityFile.mockRejectedValue(new Error("boom"));
    const res = await request(app).get("/api/storage/objects/abc");
    expect(res.status).toBe(500);
  });
});
