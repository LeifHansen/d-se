export const EMAIL_SHAPE_RE = /^[^@\s]+@[^@\s]+$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_SHAPE_RE.test(value);
}

export function normaliseEmail(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (!looksLikeEmail(trimmed)) return null;
  return trimmed;
}
