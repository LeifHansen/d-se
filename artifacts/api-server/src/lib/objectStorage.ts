import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

/**
 * S3-compatible object storage. Works with:
 *   - Fly Tigris (set AWS_ENDPOINT_URL_S3 + BUCKET_NAME — flyctl storage create injects these)
 *   - Cloudflare R2 (set AWS_ENDPOINT_URL_S3 to your R2 endpoint)
 *   - AWS S3 (leave AWS_ENDPOINT_URL_S3 unset)
 *   - Backblaze B2 / MinIO / any S3-compatible service
 *
 * Required env:
 *   BUCKET_NAME              the bucket name
 *   AWS_ACCESS_KEY_ID        S3 access key
 *   AWS_SECRET_ACCESS_KEY    S3 secret
 *   AWS_ENDPOINT_URL_S3      (optional) custom endpoint for non-AWS providers
 *   AWS_REGION               (optional) defaults to "auto" (works for Tigris/R2)
 *   PUBLIC_OBJECT_SEARCH_PATHS  comma-separated prefixes within the bucket (e.g. "public,public/dose")
 *   PRIVATE_OBJECT_DIR       single prefix for private uploads (e.g. "private")
 */

const region = process.env.AWS_REGION || "auto";
const endpoint = process.env.AWS_ENDPOINT_URL_S3 || undefined;
// Path-style addressing is required for many non-AWS S3-compatible providers (Tigris, MinIO).
// Real AWS S3 supports both but virtual-host is preferred there.
const forcePathStyle = !!endpoint;

export const objectStorageClient = new S3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials:
    process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        }
      : undefined, // fall back to default chain (IAM role on AWS, etc.)
});

/**
 * Provider-neutral file abstraction. Routes and ACL helpers depend on this,
 * not on the underlying S3 client, so the storage backend stays swappable.
 */
export interface StorageObject {
  readonly name: string;
  readonly bucket: string;
  exists(): Promise<boolean>;
  getMetadata(): Promise<StorageObjectMetadata>;
  setMetadata(meta: { customMetadata?: Record<string, string> }): Promise<void>;
  createReadStream(): NodeJS.ReadableStream;
  delete(opts?: { ignoreNotFound?: boolean }): Promise<void>;
}

export interface StorageObjectMetadata {
  contentType?: string;
  size?: number;
  customMetadata?: Record<string, string>;
}

class S3StorageObject implements StorageObject {
  constructor(
    private readonly client: S3Client,
    public readonly bucket: string,
    public readonly name: string,
  ) {}

  async exists(): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: this.name }),
      );
      return true;
    } catch (err) {
      if (isNotFound(err)) return false;
      throw err;
    }
  }

  async getMetadata(): Promise<StorageObjectMetadata> {
    const r = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.name }),
    );
    return {
      contentType: r.ContentType,
      size: r.ContentLength,
      customMetadata: r.Metadata ?? undefined, // SDK returns lowercased keys with x-amz-meta- prefix stripped
    };
  }

  async setMetadata({
    customMetadata,
  }: {
    customMetadata?: Record<string, string>;
  }): Promise<void> {
    // S3 has no in-place metadata update — emulate via copy-in-place with REPLACE directive.
    // Preserve the existing content-type so we don't accidentally change it.
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: this.name }),
    );
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        Key: this.name,
        CopySource: encodeURIComponent(`${this.bucket}/${this.name}`),
        Metadata: customMetadata,
        MetadataDirective: "REPLACE",
        ContentType: head.ContentType,
      }),
    );
  }

  createReadStream(): NodeJS.ReadableStream {
    const passthrough = new Readable({ read() {} });
    this.client
      .send(new GetObjectCommand({ Bucket: this.bucket, Key: this.name }))
      .then((r) => {
        const body = r.Body as Readable | undefined;
        if (!body) {
          passthrough.push(null);
          return;
        }
        body.on("data", (chunk) => passthrough.push(chunk));
        body.on("end", () => passthrough.push(null));
        body.on("error", (err) => passthrough.destroy(err));
      })
      .catch((err) => passthrough.destroy(err));
    return passthrough;
  }

  async delete({
    ignoreNotFound = false,
  }: { ignoreNotFound?: boolean } = {}): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: this.name }),
      );
    } catch (err) {
      if (ignoreNotFound && isNotFound(err)) return;
      throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === "NotFound" ||
    e?.name === "NoSuchKey" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

function getBucket(): string {
  const b = process.env.BUCKET_NAME;
  if (!b) {
    throw new Error(
      "BUCKET_NAME not set. Provision via `flyctl storage create` (Tigris) or set manually.",
    );
  }
  return b;
}

function trimSlashes(s: string): string {
  return s.replace(/^\/+|\/+$/g, "");
}

export class ObjectStorageService {
  constructor() {}

  /**
   * Returns comma-separated public prefixes within BUCKET_NAME (e.g. ["public", "public/dose"]).
   * For backward compat, leading slashes are stripped — older "/bucket/prefix" style is no longer
   * supported; the bucket comes from BUCKET_NAME and these are bucket-relative prefixes only.
   */
  getPublicObjectSearchPaths(): Array<string> {
    const raw = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        raw
          .split(",")
          .map((p) => trimSlashes(p))
          .filter(Boolean),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set to comma-separated bucket-relative prefixes (e.g. 'public').",
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = trimSlashes(process.env.PRIVATE_OBJECT_DIR || "");
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set to a single bucket-relative prefix (e.g. 'private').",
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<StorageObject | null> {
    const bucket = getBucket();
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const key = `${searchPath}/${trimSlashes(filePath)}`;
      const obj = new S3StorageObject(objectStorageClient, bucket, key);
      if (await obj.exists()) return obj;
    }
    return null;
  }

  async downloadObject(
    file: StorageObject,
    cacheTtlSec: number = 3600,
  ): Promise<Response> {
    const meta = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream() as Readable;
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": meta.contentType || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (meta.size != null) headers["Content-Length"] = String(meta.size);

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const bucket = getBucket();
    const privateDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const key = `${privateDir}/uploads/${objectId}`;
    return getSignedUrl(
      objectStorageClient,
      new PutObjectCommand({ Bucket: bucket, Key: key }),
      { expiresIn: 900 },
    );
  }

  async getObjectEntityFile(objectPath: string): Promise<StorageObject> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    const privateDir = this.getPrivateObjectDir();
    const key = `${privateDir}/${entityId}`;
    const bucket = getBucket();
    const obj = new S3StorageObject(objectStorageClient, bucket, key);
    if (!(await obj.exists())) {
      throw new ObjectNotFoundError();
    }
    return obj;
  }

  /**
   * Normalize a freshly-uploaded URL (could be a signed PUT URL or an S3 object URL)
   * back to the app's served path `/objects/<id>`. Used by admin after upload completes
   * so the client never has to know about S3 details.
   */
  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("http://") && !rawPath.startsWith("https://")) {
      return rawPath;
    }
    let path: string;
    try {
      const url = new URL(rawPath);
      path = url.pathname; // strips query string (signed-URL params)
    } catch {
      return rawPath;
    }
    const bucket = getBucket();
    const privateDir = this.getPrivateObjectDir();
    // Path-style addressing: /<bucket>/<key>
    if (path.startsWith(`/${bucket}/`)) {
      path = path.slice(bucket.length + 1);
    }
    const privatePrefix = `/${privateDir}/`;
    if (path.startsWith(privatePrefix)) {
      const entityId = path.slice(privatePrefix.length);
      return `/objects/${entityId}`;
    }
    return path;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy,
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  /**
   * Delete an uploaded object entity by its served URL (`/api/storage/objects/<id>`)
   * or normalized path (`/objects/<id>`). Returns true if a delete was attempted,
   * false if the URL doesn't point at a managed object (e.g. external `http(s)://`).
   * Throws if the underlying delete fails for reasons other than the object being gone.
   */
  async deleteObjectEntityByUrl(url: string): Promise<boolean> {
    const SERVED_PREFIX = "/api/storage/objects/";
    let objectPath: string | null = null;
    if (url.startsWith(SERVED_PREFIX)) {
      objectPath = `/objects/${url.slice(SERVED_PREFIX.length)}`;
    } else if (url.startsWith("/objects/")) {
      objectPath = url;
    } else {
      return false;
    }
    try {
      const file = await this.getObjectEntityFile(objectPath);
      await file.delete({ ignoreNotFound: true });
    } catch (err) {
      if (err instanceof ObjectNotFoundError) return true;
      throw err;
    }
    return true;
  }

  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: StorageObject;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}
