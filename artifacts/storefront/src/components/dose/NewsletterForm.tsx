import { useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { track } from "@/lib/analytics";

type Variant = "light" | "dark";

const VARIANTS: Record<
  Variant,
  {
    input: CSSProperties;
    button: CSSProperties;
    success: CSSProperties;
  }
> = {
  light: {
    input: { color: "hsl(166 95% 19%)" },
    button: {
      background: "hsl(166 95% 19%)",
      color: "hsl(45 49% 90%)",
      borderColor: "hsl(167 95% 13%)",
    },
    success: { background: "hsl(166 95% 19%)", color: "hsl(45 49% 90%)" },
  },
  dark: {
    input: { color: "hsl(166 95% 19%)" },
    button: {
      background: "hsl(42 53% 54%)",
      color: "hsl(166 95% 19%)",
      borderColor: "hsl(42 53% 46%)",
    },
    success: { background: "hsl(45 49% 90%)", color: "hsl(166 95% 19%)" },
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
        className="rounded-full px-6 py-3 text-sm font-medium"
        style={styles.success}
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
          className="rounded-full border-0 bg-white/80 px-5"
          style={styles.input}
          data-testid={`${testIdPrefix}-email`}
          autoComplete="email"
          required
        />
        <Button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-full px-6 text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={styles.button}
          data-testid={`${testIdPrefix}-submit`}
        >
          {status === "submitting" ? "…" : buttonLabel}
        </Button>
      </div>
      {error && (
        <p
          className="px-2 text-xs"
          style={{ color: "hsl(0 60% 35%)" }}
          data-testid={`${testIdPrefix}-error`}
        >
          {error}
        </p>
      )}
    </form>
  );
}
