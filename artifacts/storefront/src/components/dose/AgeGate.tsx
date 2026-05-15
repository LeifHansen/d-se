import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Image } from "./Image";
import productBoxes from "@/assets/brand/bottle-bar-lifestyle.png?picture";

const STORAGE_KEY = "dose-age-confirmed";

export function AgeGate() {
  const [open, setOpen] = useState(false);
  const [denied, setDenied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const yesButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v !== "yes") setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  // Focus management + focus trap while the modal is open.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => yesButtonRef.current?.focus(), 0);

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

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
      aria-labelledby="age-gate-title"
      ref={dialogRef}
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
              <h2 id="age-gate-title" className="font-display text-2xl">
                We'll see you later.
              </h2>
              <p className="max-w-xs text-sm" style={{ color: "hsl(170 18% 32%)" }}>
                You must be 21 or older to enter this site. Please come back when you
                meet the age requirement.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm tracking-wide">Please confirm your age</p>
              <h2
                id="age-gate-title"
                className="font-display text-2xl leading-tight"
              >
                Are you at least <span className="font-display-italic">21 years old?</span>
              </h2>
              <div className="flex gap-3">
                <Button
                  ref={yesButtonRef}
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
                <a className="underline underline-offset-2" href="/terms">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a className="underline underline-offset-2" href="/privacy">
                  Privacy Policy
                </a>
                .
              </p>
            </>
          )}
        </div>
        <div className="hidden md:block">
          <Image
            picture={productBoxes}
            alt="DŌSE bottle in a candlelit bar setting"
            className="h-full w-full object-cover"
            pictureClassName="block h-full w-full"
            sizes="(min-width: 768px) 45vw, 90vw"
          />
        </div>
      </div>
    </div>
  );
}
