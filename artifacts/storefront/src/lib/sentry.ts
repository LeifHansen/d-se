import * as Sentry from "@sentry/react";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  initialized = true;
}

export function isSentryEnabled(): boolean {
  return initialized;
}

/**
 * Wrap window.fetch so every API response's X-Request-Id is recorded as a
 * Sentry breadcrumb (and as a tag on captured errors). This is what links a
 * UI error report back to the matching server-side log line.
 */
export function installFetchRequestIdBreadcrumbs(): void {
  if (typeof window === "undefined") return;
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    try {
      const res = await original(input, init);
      const requestId = res.headers.get("x-request-id");
      if (isSentryEnabled() && requestId) {
        Sentry.addBreadcrumb({
          category: "fetch",
          type: "http",
          level: res.ok ? "info" : "warning",
          message: `${(init?.method ?? "GET").toUpperCase()} ${url} ${res.status}`,
          data: { requestId, status: res.status, url },
        });
        if (!res.ok) {
          Sentry.getCurrentScope().setTag("last_failed_request_id", requestId);
        }
      }
      return res;
    } catch (err) {
      if (isSentryEnabled()) {
        Sentry.captureException(err, {
          tags: { fetch_url: url },
        });
      }
      throw err;
    }
  };
}

export { Sentry };
