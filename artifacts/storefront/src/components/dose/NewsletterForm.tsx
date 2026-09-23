import { useState } from "react";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Variant = "light" | "dark" | "turquoise";

const VARIANTS: Record<
  Variant,
  { input: string; button: string; success: string; error: string }
> = {
  // On white / pale surfaces
  light: {
    input: "border-silver bg-white text-ink placeholder:text-silver-dark",
    button: "cta-ink",
    success: "bg-ink text-white",
    error: "text-destructive",
  },
  // On the ink footer
  dark: {
    input: "border-white/15 bg-white text-ink placeholder:text-silver-dark",
    button: "cta-pink",
    success: "bg-white text-ink",
    error: "text-pink-soft",
  },
  // On the turquoise newsletter band
  turquoise: {
    input: "border-transparent bg-white text-ink placeholder:text-silver-dark",
    button: "cta-ink",
    success: "bg-ink text-white",
    error: "text-ink",
  },
};

export function NewsletterForm({
  source,
  variant = "light",
  testIdPrefix = "newsletter",
  buttonLabel = "Sign up",
}: {
  source: string;
  variant?: Variant;
  testIdPrefix?: string;
  buttonLabel?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);
  const styles = VARIANTS[variant];

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setError("Please enter a valid email.");
      setStatus("error");
      return;
    }
    setStatus("submitting");
    setError(null);
    try {
      const base = (
        import.meta.env.BASE_URL?.toString().replace(/\/$/, "") ?? ""
      );
      const res = await fetch(`${base}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus("ok");
      track("newsletter_signup", { method: source });
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setStatus("error");
      // Surface to console for debugging without leaking to user.
      // eslint-disable-next-line no-console
      console.error("Newsletter subscribe failed", err);
    }
  };

  if (status === "ok") {
    return (
      <p
        className={cn(
          "rounded-full px-6 py-3 text-sm font-medium",
          styles.success,
        )}
        data-testid={`${testIdPrefix}-success`}
      >
        Welcome to DŌSE. Check your inbox.
      </p>
    );
  }

  return (
    <form
      className="flex w-full max-w-md flex-col gap-2"
      onSubmit={onSubmit}
      data-testid={`${testIdPrefix}-form`}
      noValidate
    >
      <div className="flex w-full gap-2">
        <Input
          type="email"
          placeholder="you@goodlife.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={cn("h-11 rounded-full px-5 shadow-none", styles.input)}
          data-testid={`${testIdPrefix}-email`}
          autoComplete="email"
          aria-label="Email address"
          required
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className={cn("cta", styles.button)}
          data-testid={`${testIdPrefix}-submit`}
        >
          {status === "submitting" ? "…" : buttonLabel}
        </button>
      </div>
      {error && (
        <p
          className={cn("px-2 text-xs font-medium", styles.error)}
          data-testid={`${testIdPrefix}-error`}
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
