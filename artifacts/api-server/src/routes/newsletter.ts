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
  type SQL,
} from "drizzle-orm";
import { db, newsletterSubscribersTable } from "@workspace/db";
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

router.post("/newsletter/subscribe", async (req, res): Promise<void> => {
  const parsed = SubscribeNewsletterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  const source = parsed.data.source ?? null;

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
