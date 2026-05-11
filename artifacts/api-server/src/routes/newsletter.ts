import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, newsletterSubscribersTable } from "@workspace/db";
import {
  SubscribeNewsletterBody,
  SubscribeNewsletterResponse,
} from "@workspace/api-zod";
import { addToResendAudience, sendWelcomeEmail } from "../lib/email";

const router: IRouter = Router();

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

  try {
    await db.insert(newsletterSubscribersTable).values({
      email,
      source,
      resendContactId,
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
    await sendWelcomeEmail({ to: email });
  } catch (err) {
    req.log.warn({ err }, "Welcome email failed");
  }

  res.json(
    SubscribeNewsletterResponse.parse({ ok: true, alreadySubscribed: false }),
  );
});

export default router;
