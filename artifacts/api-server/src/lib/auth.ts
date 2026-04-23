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
    if (ADMIN_EMAILS.length === 0 || ADMIN_EMAILS.includes(email)) {
      // If no allowlist set, treat any signed-in user as admin (dev convenience).
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
