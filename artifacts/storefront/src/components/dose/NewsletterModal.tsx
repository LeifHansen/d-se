import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { NewsletterForm } from "./NewsletterForm";

const DISMISS_KEY = "dose-newsletter-modal-dismissed";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === "yes";
  } catch {
    return true;
  }
}

function markDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, "yes");
  } catch {
    /* ignore */
  }
}

export function NewsletterModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (wasDismissed()) return;
    let triggered = false;

    const trigger = () => {
      if (triggered || wasDismissed()) return;
      triggered = true;
      setOpen(true);
    };

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max > 0 && window.scrollY / max > 0.5) trigger();
    };

    const onMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0) trigger();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("mouseleave", onMouseLeave);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseleave", onMouseLeave);
    };
  }, []);

  const close = () => {
    markDismissed();
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "hsla(170, 58%, 14%, 0.7)" }}
      data-testid="newsletter-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-modal-title"
      onClick={close}
    >
      <div
        className="relative w-full max-w-md rounded-3xl p-8"
        style={{ background: "hsl(45 49% 90%)", color: "hsl(170 58% 14%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          aria-label="Close"
          onClick={close}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full hover:bg-black/5"
          data-testid="newsletter-modal-close"
        >
          <X className="h-4 w-4" />
        </button>
        <p
          className="text-[11px] font-semibold uppercase tracking-[0.22em]"
          style={{ color: "hsl(170 35% 22%)" }}
        >
          Stay in the drop
        </p>
        <h2
          id="newsletter-modal-title"
          className="mt-2 font-display text-4xl leading-tight"
        >
          $10 off your <span className="font-display-italic">first drop.</span>
        </h2>
        <p className="mt-3 text-sm" style={{ color: "hsl(170 35% 22%)" }}>
          Join the list for new drops, ritual recipes, and the occasional poem
          about going slow.
        </p>
        <div className="mt-5">
          <NewsletterForm
            source="modal"
            testIdPrefix="newsletter-modal-form"
            buttonLabel="Get $10 off"
          />
        </div>
      </div>
    </div>
  );
}
