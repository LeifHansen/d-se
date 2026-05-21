import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CONSENT_EVENT } from "@/lib/analytics";

const KEY = "dose-cookies-decision";
export const COOKIE_OPEN_EVENT = "dose:cookie-open";
export const COOKIE_DECISION_EVENT = "dose:cookie-decision";

export type CookieDecision = "accept" | "decline";

export function getCookieDecision(): CookieDecision | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "accept" || v === "decline" ? v : null;
  } catch {
    return null;
  }
}

export function openCookiePreferences() {
  window.dispatchEvent(new CustomEvent(COOKIE_OPEN_EVENT));
}

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (getCookieDecision() === null) setShow(true);
    const onOpen = () => setShow(true);
    window.addEventListener(COOKIE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(COOKIE_OPEN_EVENT, onOpen);
  }, []);

  const ack = (decision: CookieDecision) => {
    try {
      window.localStorage.setItem(KEY, decision);
    } catch {
      /* ignore */
    }
    try {
      window.dispatchEvent(
        new CustomEvent(CONSENT_EVENT, { detail: { decision } }),
      );
      window.dispatchEvent(
        new CustomEvent(COOKIE_DECISION_EVENT, { detail: { decision } }),
      );
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md"
      style={{
        background: "hsla(45, 49%, 90%, 0.96)",
        color: "hsl(166 95% 19%)",
        borderColor: "hsl(40 18% 80%)",
      }}
      data-testid="cookie-banner"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 text-xs md:flex-row md:items-center md:justify-between md:px-10">
        <p
          className="max-w-3xl leading-relaxed"
          style={{ color: "hsl(170 18% 28%)" }}
        >
          We use a few essential cookies to run the store. With your
          permission, we also load analytics that help us improve the site.
          Nothing non-essential loads until you choose. Read our{" "}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => ack("decline")}
            data-testid="cookie-decline"
          >
            Decline
          </Button>
          <Button
            size="sm"
            onClick={() => ack("accept")}
            data-testid="cookie-accept"
          >
            Accept
          </Button>
        </div>
      </div>
    </div>
  );
}
