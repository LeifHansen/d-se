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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 px-4 backdrop-blur-sm"
      data-testid="newsletter-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="newsletter-modal-title"
      onClick={close}
    >
      <div
        className="grain relative w-full max-w-md overflow-hidden rounded-3xl bg-white p-8 text-ink shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden="true"
          className="watermark watermark-pink -right-2 -top-1 text-8xl"
          data-watermark="$10"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={close}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full hover:bg-ink/5"
          data-testid="newsletter-modal-close"
        >
          <X className="h-4 w-4" />
        </button>
        <p className="eyebrow text-turquoise-deep">Stay in the drop</p>
        <h2
          id="newsletter-modal-title"
          className="mt-3 font-display text-5xl leading-[0.92]"
        >
          $10 off your{" "}
          <span className="font-display-italic text-pink">first drop.</span>
        </h2>
        <p className="mt-3 text-sm text-graphite">
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
