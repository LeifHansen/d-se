import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Dev-only test bypass: when NODE_ENV !== "production" and the server is
  // launched with E2E_ADMIN_BYPASS_TOKEN set, requests carrying a matching
  // x-e2e-admin-bypass header skip Clerk entirely. This exists so the real-
  // backend Playwright suite can hit the admin routes without standing up a
  // Clerk session. Hard-fails closed in production: the token check is
  // *inside* the NODE_ENV gate, so even an attacker-supplied env var on a
  // production deploy cannot enable the bypass.
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.E2E_ADMIN_BYPASS_TOKEN &&
    req.header("x-e2e-admin-bypass") === process.env.E2E_ADMIN_BYPASS_TOKEN
  ) {
    next();
    return;
  }
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const { clerkClient } = await import("@clerk/express");
    const user = await clerkClient.users.getUser(auth.userId);
    const email = user.emailAddresses[0]?.emailAddress?.toLowerCase();
    if (!email) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    if (ADMIN_EMAILS.length === 0) {
      // Fail closed in production when no allowlist is configured.
      if (process.env.NODE_ENV === "production") {
        res
          .status(403)
          .json({ error: "Admin access not configured (set ADMIN_EMAILS)" });
        return;
      }
      // Dev convenience: any signed-in user is admin until ADMIN_EMAILS is set.
      next();
      return;
    }
    if (ADMIN_EMAILS.includes(email)) {
      next();
      return;
    }
    res.status(403).json({ error: "Forbidden" });
  } catch (err) {
    req.log.error({ err }, "Admin check failed");
    res.status(500).json({ error: "Server error" });
  }
}

export function getUserId(req: Request): string | null {
  return getAuth(req).userId ?? null;
}

export async function getUserEmail(req: Request): Promise<string | null> {
  const auth = getAuth(req);
  if (!auth.userId) return null;
  try {
    const { clerkClient } = await import("@clerk/express");
    const user = await clerkClient.users.getUser(auth.userId);
    return user.emailAddresses[0]?.emailAddress?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}
