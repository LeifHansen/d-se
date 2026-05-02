import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "subscribed">("idle");

  return (
    <section
      data-testid="newsletter-section"
      style={{ background: "hsl(170 14% 75%)", color: "hsl(170 58% 14%)" }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-2 md:px-10">
        <div>
          <p className="eyebrow" style={{ color: "hsl(170 35% 22%)" }}>
            Stay in the drop
          </p>
          <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Get $10 off
            <br />
            <span className="font-display-italic">your first dropper.</span>
          </h2>
        </div>
        <form
          className="flex w-full flex-col items-end justify-end gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.includes("@")) setStatus("subscribed");
          }}
          data-testid="newsletter-form"
        >
          <p className="text-sm" style={{ color: "hsl(170 35% 22%)" }}>
            New drops, ritual recipes, and the occasional poem about going slow.
          </p>
          {status === "subscribed" ? (
            <p
              className="rounded-full px-6 py-3 text-sm font-medium"
              style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
              data-testid="newsletter-success"
            >
              Welcome to DŌSE. Check your inbox.
            </p>
          ) : (
            <div className="flex w-full max-w-md gap-2">
              <Input
                type="email"
                placeholder="you@goodlife.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-full border-0 bg-white/70 px-5"
                style={{ color: "hsl(170 58% 14%)" }}
                data-testid="newsletter-email"
                required
              />
              <Button
                type="submit"
                className="rounded-full px-6 text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{
                  background: "hsl(170 58% 14%)",
                  color: "hsl(45 49% 90%)",
                  borderColor: "hsl(170 60% 11%)",
                }}
                data-testid="newsletter-submit"
              >
                Sign up
              </Button>
            </div>
          )}
        </form>
      </div>
    </section>
  );
}
