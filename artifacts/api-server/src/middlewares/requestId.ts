import type { RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { getAuth } from "@clerk/express";
import { Sentry, isSentryEnabled } from "../lib/sentry";

const HEADER = "X-Request-Id";

/**
 * Generate (or honor inbound) X-Request-Id, expose it on the response,
 * stamp it on req.id for pino-http, and bind a per-request Sentry isolation
 * scope tagged with the id. Must run before any other middleware so every
 * downstream log line and Sentry capture carries the same request id.
 */
export function requestIdMiddleware(): RequestHandler {
  return (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    const id =
      (Array.isArray(incoming) ? incoming[0] : incoming) ?? randomUUID();
    (req as unknown as { id: string }).id = id;
    res.setHeader(HEADER, id);

    if (!isSentryEnabled()) {
      next();
      return;
    }
    Sentry.withIsolationScope((scope) => {
      scope.setTag("request_id", id);
      scope.addBreadcrumb({
        category: "http",
        message: `${req.method} ${req.url}`,
        data: { requestId: id },
        level: "info",
      });
      next();
    });
  };
}

/**
 * Attach Clerk user identity to the current Sentry isolation scope. MUST be
 * mounted AFTER clerkMiddleware so getAuth() returns a populated session.
 */
export function sentryUserMiddleware(): RequestHandler {
  return (req, _res, next) => {
    if (!isSentryEnabled()) {
      next();
      return;
    }
    try {
      const userId = getAuth(req).userId ?? null;
      if (userId) {
        Sentry.getCurrentScope().setUser({ id: userId });
      }
    } catch {
      // Auth not available for this request — not an error.
    }
    next();
  };
}
