import { Router, type IRouter, type Request, type Response } from "express";
import sharp from "sharp";
import type { File } from "@google-cloud/storage";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";
import { getObjectAclPolicy } from "../lib/objectAcl";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

const ALLOWED_WIDTHS = new Set([400, 640, 960, 1280, 1600]);
const ALLOWED_FORMATS = new Set(["avif", "webp", "jpeg"] as const);
type Fmt = "avif" | "webp" | "jpeg";

const MIME: Record<Fmt, string> = {
  avif: "image/avif",
  webp: "image/webp",
  jpeg: "image/jpeg",
};

const PASSTHROUGH_TYPES = new Set([
  "image/svg+xml",
  "image/gif",
]);

function parseQuery(req: Request): {
  src: string;
  width: number;
  format: Fmt;
  quality: number;
} | null {
  const src = typeof req.query.src === "string" ? req.query.src : "";
  const widthRaw = Number(req.query.w);
  const formatRaw = String(req.query.format ?? "webp").toLowerCase();
  const qualityRaw = Number(req.query.q ?? 75);

  if (!src.startsWith("/objects/") && !src.startsWith("/public-objects/")) {
    return null;
  }
  if (!ALLOWED_WIDTHS.has(widthRaw)) return null;
  if (!ALLOWED_FORMATS.has(formatRaw as Fmt)) return null;
  const quality = Number.isFinite(qualityRaw)
    ? Math.min(95, Math.max(30, Math.round(qualityRaw)))
    : 75;
  return { src, width: widthRaw, format: formatRaw as Fmt, quality };
}

async function resolveFile(src: string): Promise<{
  file: File;
  isPublic: boolean;
} | null> {
  if (src.startsWith("/public-objects/")) {
    const filePath = src.slice("/public-objects/".length);
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) return null;
    return { file, isPublic: true };
  }
  // /objects/<entity>
  try {
    const file = await objectStorageService.getObjectEntityFile(src);
    const acl = await getObjectAclPolicy(file);
    return { file, isPublic: acl?.visibility === "public" };
  } catch (err) {
    if (err instanceof ObjectNotFoundError) return null;
    throw err;
  }
}

async function fileToBuffer(file: File): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const stream = file.createReadStream();
  return new Promise((resolve, reject) => {
    stream.on("data", (c) => chunks.push(c as Buffer));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

router.get("/storage/img", async (req: Request, res: Response) => {
  const params = parseQuery(req);
  if (!params) {
    res.status(400).json({ error: "Invalid image params" });
    return;
  }
  try {
    const resolved = await resolveFile(params.src);
    if (!resolved) {
      res.status(404).json({ error: "Image not found" });
      return;
    }
    if (!resolved.isPublic) {
      // The proxy intentionally only serves images with public ACL.
      // Private object reads must go through /storage/objects/* with auth.
      res.status(403).json({ error: "Image is not public" });
      return;
    }

    const [meta] = await resolved.file.getMetadata();
    const sourceType = String(meta.contentType ?? "");

    // SVG / GIF: skip transform, stream original bytes.
    if (PASSTHROUGH_TYPES.has(sourceType)) {
      const buf = await fileToBuffer(resolved.file);
      res.status(200);
      res.setHeader("Content-Type", sourceType);
      res.setHeader(
        "Cache-Control",
        "public, max-age=31536000, s-maxage=31536000, immutable",
      );
      res.setHeader("Vary", "Accept");
      res.end(buf);
      return;
    }

    const input = await fileToBuffer(resolved.file);

    let pipeline = sharp(input, { failOn: "none" }).rotate().resize({
      width: params.width,
      withoutEnlargement: true,
      fit: "inside",
    });

    if (params.format === "avif") {
      pipeline = pipeline.avif({ quality: params.quality, effort: 4 });
    } else if (params.format === "webp") {
      pipeline = pipeline.webp({ quality: params.quality });
    } else {
      pipeline = pipeline.jpeg({ quality: params.quality, mozjpeg: true });
    }

    const output = await pipeline.toBuffer();

    res.status(200);
    res.setHeader("Content-Type", MIME[params.format]);
    res.setHeader("Content-Length", String(output.length));
    res.setHeader(
      "Cache-Control",
      "public, max-age=31536000, s-maxage=31536000, immutable",
    );
    res.setHeader("Vary", "Accept");
    res.end(output);
  } catch (error) {
    req.log.error({ err: error }, "Error transforming image");
    res.status(500).json({ error: "Failed to transform image" });
  }
});

export default router;
