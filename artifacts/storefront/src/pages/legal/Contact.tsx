import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageLayout } from "@/components/dose/PageLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Status = "idle" | "submitting" | "success" | "error";

// Cloudflare Turnstile test site key — always passes. Used as a safe fallback
// when VITE_TURNSTILE_SITE_KEY is not configured so local dev still works.
const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";
const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size?: "invisible" | "normal" | "compact" | "flexible";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
  execute: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]`,
    );
    const onReady = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile failed to initialise"));
    };
    if (existing) {
      if (window.turnstile) onReady();
      else existing.addEventListener("load", onReady, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = onReady;
    script.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export default function Contact() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const captchaContainerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const tokenResolverRef = useRef<((token: string) => void) | null>(null);
  const tokenRejecterRef = useRef<((err: Error) => void) | null>(null);

  const configuredSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as
    | string
    | undefined;
  const siteKey =
    configuredSiteKey ??
    (import.meta.env.DEV ? TURNSTILE_TEST_SITE_KEY : "");

  useEffect(() => {
    let cancelled = false;
    const container = captchaContainerRef.current;
    if (!container) return;
    if (!siteKey) return;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container) return;
        widgetIdRef.current = turnstile.render(container, {
          sitekey: siteKey,
          size: "invisible",
          callback: (token: string) => {
            tokenResolverRef.current?.(token);
            tokenResolverRef.current = null;
            tokenRejecterRef.current = null;
          },
          "error-callback": () => {
            tokenRejecterRef.current?.(new Error("CAPTCHA error"));
            tokenResolverRef.current = null;
            tokenRejecterRef.current = null;
          },
          "expired-callback": () => {
            if (widgetIdRef.current && window.turnstile) {
              window.turnstile.reset(widgetIdRef.current);
            }
          },
        });
      })
      .catch(() => {
        // Surfaced when the user tries to submit.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore — widget may already be gone
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey]);

  const getCaptchaToken = (): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      if (!siteKey) {
        reject(
          new Error(
            "Contact form is temporarily unavailable. Please email hello@dose.com directly.",
          ),
        );
        return;
      }
      if (!window.turnstile || !widgetIdRef.current) {
        reject(new Error("CAPTCHA not ready. Please refresh and try again."));
        return;
      }
      tokenResolverRef.current = resolve;
      tokenRejecterRef.current = reject;
      try {
        window.turnstile.reset(widgetIdRef.current);
        window.turnstile.execute(widgetIdRef.current);
      } catch (err) {
        reject(err instanceof Error ? err : new Error("CAPTCHA failed"));
      }
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg(null);
    try {
      const captchaToken = await getCaptchaToken();
      const res = await fetch(
        `${import.meta.env.BASE_URL}api/contact`.replace(/\/{2,}/g, "/"),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            email,
            subject,
            message,
            captchaToken,
          }),
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

          <div ref={captchaContainerRef} data-testid="contact-captcha" />

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
            <p className="mt-2 text-xs opacity-70">
              Protected by Cloudflare Turnstile.
            </p>
          </div>
        </form>
      )}
    </PageLayout>
  );
}
