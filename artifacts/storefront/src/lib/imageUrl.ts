/**
 * Helpers for building srcset URLs that go through the api-server image proxy
 * (`GET /api/storage/img`). Pair with the runtime variant of the
 * <Image /> component for any object-storage image (product photos, blog
 * cover art, etc.).
 */

export const RUNTIME_WIDTHS = [400, 640, 960, 1280, 1600] as const;
export type RuntimeWidth = (typeof RUNTIME_WIDTHS)[number];

export type RuntimeFormat = "avif" | "webp" | "jpeg";

const PROXY_PATH = "/api/storage/img";

function isProxyableSrc(src: string): boolean {
  return src.startsWith("/objects/") || src.startsWith("/public-objects/");
}

/** Build a single transformed URL for the given object path. */
export function buildImgUrl(
  src: string,
  width: RuntimeWidth,
  format: RuntimeFormat,
  quality = 75,
): string {
  const params = new URLSearchParams({
    src,
    w: String(width),
    format,
    q: String(quality),
  });
  return `${PROXY_PATH}?${params.toString()}`;
}

/** Build a srcset string ("url 400w, url 640w, …") for one format. */
export function buildSrcSet(
  src: string,
  format: RuntimeFormat,
  widths: ReadonlyArray<RuntimeWidth> = RUNTIME_WIDTHS,
  quality = 75,
): string {
  return widths
    .map((w) => `${buildImgUrl(src, w, format, quality)} ${w}w`)
    .join(", ");
}

/**
 * Build a ResponsivePicture-shaped object from a runtime object-storage path,
 * suitable for handing to <Image picture={…} />. Falls back to the original
 * src when the path can't be proxied (e.g. external URL).
 */
export function buildRuntimePicture({
  src,
  width,
  height,
  widths = RUNTIME_WIDTHS,
  formats = ["avif", "webp", "jpeg"],
  quality = 75,
}: {
  src: string;
  width: number;
  height: number;
  widths?: ReadonlyArray<RuntimeWidth>;
  formats?: ReadonlyArray<RuntimeFormat>;
  quality?: number;
}): {
  sources: Record<string, string>;
  img: { src: string; w: number; h: number };
} {
  if (!isProxyableSrc(src)) {
    return {
      sources: {},
      img: { src, w: width, h: height },
    };
  }
  const sources: Record<string, string> = {};
  for (const f of formats) {
    sources[f] = buildSrcSet(src, f, widths, quality);
  }
  // The fallback <img src> uses the largest jpeg variant — universally
  // decodable and matches what the picture's <source> selection would pick.
  const fallbackWidth = widths[widths.length - 1] ?? 1280;
  return {
    sources,
    img: {
      src: buildImgUrl(src, fallbackWidth, "jpeg", quality),
      w: width,
      h: height,
    },
  };
}
