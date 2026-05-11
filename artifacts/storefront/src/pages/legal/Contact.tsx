import { useState, type FormEvent } from "react";
import { PageLayout } from "@/components/dose/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Status = "idle" | "submitting" | "success" | "error";

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/contact`.replace(/\/{2,}/g, "/"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, subject, message }),
        },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `Request failed (${res.status})`);
      }
      setStatus("success");
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong");
    }
  };

  return (
    <PageLayout
      eyebrow="Contact"
      title="Get in touch"
      testId="page-contact"
    >
      <p>
        Questions about a product, an order, or how to use our site? Send us
        a note and we'll reply within 1 business day. For urgent order
        questions, email{" "}
        <a href="mailto:hello@dose.com">hello@dose.com</a>.
      </p>

      {status === "success" ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-8 rounded-lg border p-6"
          style={{
            background: "hsl(45 50% 93%)",
            borderColor: "hsl(40 18% 80%)",
          }}
          data-testid="contact-success"
        >
          <p className="font-display text-xl">Thanks — we got your message.</p>
          <p className="mt-2 text-sm">
            Look for a reply from{" "}
            <strong>hello@dose.com</strong> within one business day.
          </p>
        </div>
      ) : (
        <form
          className="mt-8 grid gap-5 not-prose"
          onSubmit={submit}
          data-testid="contact-form"
          noValidate
        >
          <div className="grid gap-2">
            <Label htmlFor="contact-name">Your name</Label>
            <Input
              id="contact-name"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="contact-name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-email">Email address</Label>
            <Input
              id="contact-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              data-testid="contact-email"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-subject">Subject</Label>
            <Input
              id="contact-subject"
              name="subject"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              data-testid="contact-subject"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="contact-message">Message</Label>
            <Textarea
              id="contact-message"
              name="message"
              required
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              data-testid="contact-message"
            />
          </div>

          {status === "error" && (
            <p
              role="alert"
              className="text-sm"
              style={{ color: "hsl(0 70% 35%)" }}
              data-testid="contact-error"
            >
              {errorMsg ?? "We couldn't send your message. Please try again."}
            </p>
          )}

          <div>
            <Button
              type="submit"
              disabled={status === "submitting"}
              data-testid="contact-submit"
            >
              {status === "submitting" ? "Sending…" : "Send message"}
            </Button>
          </div>
        </form>
      )}
    </PageLayout>
  );
}
