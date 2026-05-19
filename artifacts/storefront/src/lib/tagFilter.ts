export function parseTagsFromSearch(search: string): string[] {
  const sp = new URLSearchParams(search);
  const out: string[] = [];
  const push = (raw: string | null | undefined) => {
    if (!raw) return;
    for (const part of raw.split(",")) {
      const trimmed = part.trim();
      if (trimmed && !out.includes(trimmed)) out.push(trimmed);
    }
  };
  for (const v of sp.getAll("tags")) push(v);
  for (const v of sp.getAll("tag")) push(v);
  return out;
}

export function toggleTag(active: string[], tag: string): string[] {
  return active.includes(tag)
    ? active.filter((t) => t !== tag)
    : [...active, tag];
}

function buildHref(base: string, tags: string[]): string {
  if (tags.length === 0) return base;
  const sp = new URLSearchParams();
  sp.set("tags", tags.join(","));
  return `${base}?${sp.toString()}`;
}

export function buildShopHref(tags: string[]): string {
  return buildHref("/shop", tags);
}

export function buildBlogHref(tags: string[]): string {
  return buildHref("/blog", tags);
}
