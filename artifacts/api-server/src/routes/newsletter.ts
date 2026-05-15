import { Router, type IRouter } from "express";
import { randomBytes } from "crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  db,
  newsletterSubscribersTable,
  newsletterQuarantineTable,
} from "@workspace/db";
import {
  SubscribeNewsletterBody,
  SubscribeNewsletterResponse,
  UnsubscribeNewsletterBody,
  UnsubscribeNewsletterResponse,
  ListAdminNewsletterSubscribersQueryParams,
  ListAdminNewsletterSubscribersResponse,
  ExportAdminNewsletterSubscribersQueryParams,
  AdminUnsubscribeNewsletterSubscriberParams,
  AdminUnsubscribeNewsletterSubscriberResponse,
} from "@workspace/api-zod";
import {
  addToResendAudience,
  removeFromResendAudience,
  sendWelcomeEmail,
} from "../lib/email";
import { requireAdmin } from "../lib/auth";

const router: IRouter = Router();

function generateUnsubscribeToken(): string {
  return randomBytes(24).toString("base64url");
}

function buildUnsubscribeUrl(token: string): string {
  const base = (
    process.env.PUBLIC_APP_URL ??
    process.env.APP_URL ??
    ""
  ).replace(/\/$/, "");
  if (!base) return `/unsubscribe?token=${encodeURIComponent(token)}`;
  return `${base}/unsubscribe?token=${encodeURIComponent(token)}`;
}

function serialize(row: typeof newsletterSubscribersTable.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    source: row.source,
    status: row.status as "active" | "unsubscribed",
    createdAt: row.createdAt,
    unsubscribedAt: row.unsubscribedAt,
    resendContactId: row.resendContactId,
  };
}

// --- Spam protection ---------------------------------------------------------
//
// Mirrors the contact form's defenses (per-IP rate limit + content heuristics)
// because a wide-open newsletter endpoint pollutes the Resend audience and
// hurts deliverability. Suspicious signups are silently shadow-accepted (200
// OK with `alreadySubscribed: true`) so bots don't learn what tripped the
// filter, and the reasons are logged for the owner.
//
// All thresholds are tunable via env vars. Blocked-TLD list is shared with the
// contact form by default (CONTACT_SPAM_BLOCKED_TLDS) but can be overridden
// per-form via NEWSLETTER_SPAM_BLOCKED_TLDS.

const NEWSLETTER_RATE_WINDOW_MINUTES = 60;
const NEWSLETTER_RATE_MAX_PER_WINDOW = 10;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function rateLimitNewsletter(ip: string): Promise<number> {
  const windowMin = envInt(
    "NEWSLETTER_SPAM_RATE_WINDOW_MINUTES",
    NEWSLETTER_RATE_WINDOW_MINUTES,
  );
  const result = await db.execute<{ hits: number }>(sql`
    INSERT INTO newsletter_rate_limits (ip, hits, window_start, updated_at)
    VALUES (${ip}, 1, NOW(), NOW())
    ON CONFLICT (ip) DO UPDATE SET
      hits = CASE
        WHEN newsletter_rate_limits.window_start < NOW() - (${windowMin}::int * INTERVAL '1 minute')
          THEN 1
        ELSE newsletter_rate_limits.hits + 1
      END,
      window_start = CASE
        WHEN newsletter_rate_limits.window_start < NOW() - (${windowMin}::int * INTERVAL '1 minute')
          THEN NOW()
        ELSE newsletter_rate_limits.window_start
      END,
      updated_at = NOW()
    RETURNING hits
  `);
  return Number(result.rows[0]?.hits ?? 0);
}

const DEFAULT_BLOCKED_TLDS =
  ".ru,.cn,.top,.xyz,.click,.loan,.work,.tk,.ml,.ga,.cf,.zip,.mov,.country,.gdn,.review";

// Built-in disposable / throwaway-email providers. Operators can extend this
// list via NEWSLETTER_SPAM_DISPOSABLE_DOMAINS (comma-separated). Entries are
// merged with (not replacing) the defaults below.
const DEFAULT_DISPOSABLE_DOMAINS = [
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.net",
  "guerrillamail.org",
  "sharklasers.com",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "trashmail.com",
  "yopmail.com",
  "throwawaymail.com",
  "getnada.com",
  "maildrop.cc",
  "dispostable.com",
  "fakeinbox.com",
  "mintemail.com",
  "mohmal.com",
  "spambog.com",
  "mytemp.email",
  "tempr.email",
  "emailondeck.com",
  "moakt.com",
];

function getBlockedTlds(): string[] {
  const raw =
    process.env.NEWSLETTER_SPAM_BLOCKED_TLDS ??
    process.env.CONTACT_SPAM_BLOCKED_TLDS ??
    DEFAULT_BLOCKED_TLDS;
  return raw
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.startsWith("."));
}

function getDisposableDomains(): string[] {
  const extra = (process.env.NEWSLETTER_SPAM_DISPOSABLE_DOMAINS ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...DEFAULT_DISPOSABLE_DOMAINS, ...extra]));
}

function detectEmailSpam(email: string): string[] {
  const reasons: string[] = [];
  const at = email.lastIndexOf("@");
  if (at < 0) return reasons;
  const domain = email.slice(at + 1).toLowerCase();

  for (const tld of getBlockedTlds()) {
    if (domain.endsWith(tld)) {
      reasons.push(`blocked_tld:${tld}`);
      break;
    }
  }

  const disposable = getDisposableDomains();
  if (disposable.includes(domain)) {
    reasons.push(`disposable_domain:${domain}`);
  } else {
    // Also catch subdomains of a known disposable host (e.g. foo.mailinator.com).
    for (const d of disposable) {
      if (domain.endsWith(`.${d}`)) {
        reasons.push(`disposable_domain:${d}`);
        break;
      }
    }
  }

  return reasons;
}

router.post("/newsletter/subscribe", async (req, res): Promise<void> => {
  const ip = (req.ip ?? req.socket.remoteAddress ?? "unknown").toString();

  const parsed = SubscribeNewsletterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source ?? null;

  // Per-IP rate limit. Bursts above the threshold are shadow-accepted so the
  // bot stops retrying but no real signup is recorded. If the limit check
  // itself blows up, we log and fall through (don't punish real users for an
  // infra hiccup).
  const maxPerWindow = envInt(
    "NEWSLETTER_SPAM_RATE_MAX",
    NEWSLETTER_RATE_MAX_PER_WINDOW,
  );
  let hits = 0;
  try {
    hits = await rateLimitNewsletter(ip);
  } catch (err) {
    req.log.warn({ err }, "Newsletter rate-limit check failed (continuing)");
  }

  const reasons: string[] = [];
  if (hits > maxPerWindow) reasons.push(`rate_limited:${hits}`);
  reasons.push(...detectEmailSpam(email));

  if (reasons.length > 0) {
    req.log.warn(
      { ip, email, source, reasons },
      "Newsletter signup shadow-accepted (spam heuristics matched)",
    );
    const retentionDays = envInt(
      "NEWSLETTER_QUARANTINE_RETENTION_DAYS",
      envInt("CONTACT_QUARANTINE_RETENTION_DAYS", 14),
    );
    const expiresAt = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000,
    );
    try {
      await db.insert(newsletterQuarantineTable).values({
        email,
        source,
        reasons,
        ip,
        expiresAt,
      });
    } catch (err) {
      // Persistence failures must never alter the response shape — the operator
      // just loses one row of recoverability for this signup.
      req.log.warn({ err }, "Failed to persist newsletter quarantine row");
    }
    res.json(
      SubscribeNewsletterResponse.parse({ ok: true, alreadySubscribed: true }),
    );
    return;
  }

  const [existing] = await db
    .select()
    .from(newsletterSubscribersTable)
    .where(eq(newsletterSubscribersTable.email, email));

  if (existing) {
    if (existing.status === "unsubscribed") {
      // Re-subscribe.
      let resendContactId: string | null = existing.resendContactId;
      try {
        const r = await addToResendAudience({ email });
        if (r.contactId) resendContactId = r.contactId;
      } catch (err) {
        req.log.warn({ err }, "Failed to re-add to Resend audience");
      }
      await db
        .update(newsletterSubscribersTable)
        .set({
          status: "active",
          unsubscribedAt: null,
          resendContactId,
          source: source ?? existing.source,
        })
        .where(eq(newsletterSubscribersTable.id, existing.id));
    }
    res.json(
      SubscribeNewsletterResponse.parse({ ok: true, alreadySubscribed: true }),
    );
    return;
  }

  let resendContactId: string | null = null;
  try {
    const r = await addToResendAudience({ email });
    resendContactId = r.contactId;
  } catch (err) {
    req.log.warn({ err }, "Failed to add to Resend audience");
  }

  const unsubscribeToken = generateUnsubscribeToken();

  try {
    await db.insert(newsletterSubscribersTable).values({
      email,
      source,
      resendContactId,
      unsubscribeToken,
      status: "active",
    });
  } catch (err) {
    // Race: another request inserted concurrently. Treat as already subscribed.
    req.log.warn({ err }, "Newsletter insert conflict");
    res.json(
      SubscribeNewsletterResponse.parse({ ok: true, alreadySubscribed: true }),
    );
    return;
  }

  try {
    await sendWelcomeEmail({
      to: email,
      unsubscribeUrl: buildUnsubscribeUrl(unsubscribeToken),
    });
  } catch (err) {
    req.log.warn({ err }, "Welcome email failed");
  }

  res.json(
    SubscribeNewsletterResponse.parse({ ok: true, alreadySubscribed: false }),
  );
});

router.post("/newsletter/unsubscribe", async (req, res): Promise<void> => {
  const parsed = UnsubscribeNewsletterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const token = parsed.data.token;
  const [row] = await db
    .select()
    .from(newsletterSubscribersTable)
    .where(eq(newsletterSubscribersTable.unsubscribeToken, token));
  if (!row) {
    // Don't leak whether the token exists; respond ok regardless.
    res.json(UnsubscribeNewsletterResponse.parse({ ok: true, email: null }));
    return;
  }
  if (row.status !== "unsubscribed") {
    await db
      .update(newsletterSubscribersTable)
      .set({ status: "unsubscribed", unsubscribedAt: new Date() })
      .where(eq(newsletterSubscribersTable.id, row.id));
    try {
      await removeFromResendAudience({
        contactId: row.resendContactId,
        email: row.email,
      });
    } catch (err) {
      req.log.warn({ err }, "Failed to remove contact from Resend audience");
    }
  }
  res.json(
    UnsubscribeNewsletterResponse.parse({ ok: true, email: row.email }),
  );
});

// ---------- Admin ----------

router.get(
  "/admin/newsletter/subscribers",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = ListAdminNewsletterSubscribersQueryParams.safeParse(
      req.query,
    );
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? 50;
    const status = parsed.data.status ?? "all";
    const search = parsed.data.search?.trim();

    const filters: SQL[] = [];
    if (status !== "all") {
      filters.push(eq(newsletterSubscribersTable.status, status));
    }
    if (search) {
      const like = `%${search}%`;
      const searchClause = or(
        ilike(newsletterSubscribersTable.email, like),
        ilike(newsletterSubscribersTable.source, like),
      );
      if (searchClause) filters.push(searchClause);
    }
    const whereClause =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);

    const totalQuery = db
      .select({ value: count() })
      .from(newsletterSubscribersTable);
    const rowsQuery = db
      .select()
      .from(newsletterSubscribersTable);
    const [{ value: total } = { value: 0 }] = whereClause
      ? await totalQuery.where(whereClause)
      : await totalQuery;
    const rows = await (whereClause
      ? rowsQuery.where(whereClause)
      : rowsQuery
    )
      .orderBy(desc(newsletterSubscribersTable.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    res.json(
      ListAdminNewsletterSubscribersResponse.parse({
        items: rows.map(serialize),
        total: Number(total),
        page,
        pageSize,
      }),
    );
  },
);

router.get(
  "/admin/newsletter/subscribers/export.csv",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = ExportAdminNewsletterSubscribersQueryParams.safeParse(
      req.query,
    );
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const status = parsed.data.status ?? "all";
    const baseQuery = db.select().from(newsletterSubscribersTable);
    const rows = await (status !== "all"
      ? baseQuery.where(eq(newsletterSubscribersTable.status, status))
      : baseQuery
    ).orderBy(asc(newsletterSubscribersTable.createdAt));

    const header = [
      "id",
      "email",
      "source",
      "status",
      "createdAt",
      "unsubscribedAt",
    ];
    const escape = (v: unknown): string => {
      if (v == null) return "";
      const s = typeof v === "string" ? v : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.email,
          r.source ?? "",
          r.status,
          r.createdAt.toISOString(),
          r.unsubscribedAt ? r.unsubscribedAt.toISOString() : "",
        ]
          .map(escape)
          .join(","),
      );
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="newsletter-subscribers-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    );
    res.send(lines.join("\n") + "\n");
  },
);

router.post(
  "/admin/newsletter/subscribers/:id/unsubscribe",
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsedParams =
      AdminUnsubscribeNewsletterSubscriberParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(newsletterSubscribersTable)
      .where(eq(newsletterSubscribersTable.id, parsedParams.data.id));
    if (!row) {
      res.status(404).json({ error: "Subscriber not found" });
      return;
    }
    if (row.status !== "unsubscribed") {
      await db
        .update(newsletterSubscribersTable)
        .set({ status: "unsubscribed", unsubscribedAt: new Date() })
        .where(eq(newsletterSubscribersTable.id, row.id));
      try {
        await removeFromResendAudience({
          contactId: row.resendContactId,
          email: row.email,
        });
      } catch (err) {
        req.log.warn({ err }, "Failed to remove contact from Resend audience");
      }
    }
    const [updated] = await db
      .select()
      .from(newsletterSubscribersTable)
      .where(eq(newsletterSubscribersTable.id, row.id));
    res.json(
      AdminUnsubscribeNewsletterSubscriberResponse.parse(serialize(updated!)),
    );
  },
);

export default router;
