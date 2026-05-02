import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import productBoxes from "@/assets/brand/grok-image-2662d902-bd38-4be9-8533-9f47f6199d97.png";

const STORAGE_KEY = "dose-age-confirmed";

export function AgeGate() {
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v !== "yes") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const confirm = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, "yes");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const deny = () => setDenied(true);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Age verification"
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      data-testid="age-gate"
      style={{ background: "hsla(170, 58%, 8%, 0.78)" }}
    >
      <div
        className="grid w-full max-w-3xl overflow-hidden rounded-2xl shadow-2xl md:grid-cols-[1.1fr_0.9fr]"
        style={{ background: "hsl(45 50% 93%)", color: "hsl(170 58% 14%)" }}
      >
        <div className="flex flex-col items-center justify-center gap-5 p-8 text-center md:p-10">
          <Logo variant="stacked" tone="teal" />
          {denied ? (
            <>
              <h2 className="font-display text-2xl">We'll see you later.</h2>
              <p className="max-w-xs text-sm" style={{ color: "hsl(170 18% 32%)" }}>
                You must be 21 or older to enter this site. Please come back when you
                meet the age requirement.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm tracking-wide">Please confirm your age</p>
              <h2 className="font-display text-2xl leading-tight">
                Are you at least <span className="font-display-italic">21 years old?</span>
              </h2>
              <div className="flex gap-3">
                <Button
                  onClick={confirm}
                  variant="default"
                  className="min-w-[7rem] uppercase tracking-[0.22em] text-[11px]"
                  data-testid="age-gate-yes"
                >
                  Yes
                </Button>
                <Button
                  onClick={deny}
                  variant="outline"
                  className="min-w-[7rem] uppercase tracking-[0.22em] text-[11px]"
                  data-testid="age-gate-no"
                >
                  No
                </Button>
              </div>
              <p
                className="max-w-xs text-[11px] leading-relaxed"
                style={{ color: "hsl(170 18% 32%)" }}
              >
                By entering this site you are agreeing to our{" "}
                <a className="underline underline-offset-2" href="#terms">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a className="underline underline-offset-2" href="#privacy">
                  Privacy Policy
                </a>
                .
              </p>
            </>
          )}
        </div>
        <div className="hidden md:block">
          <img
            src={productBoxes}
            alt="DŌSE wellness elixir packaging"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  );
}
