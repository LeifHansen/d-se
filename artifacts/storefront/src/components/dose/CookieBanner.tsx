import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const KEY = "dose-cookies-ack";

export function CookieBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(KEY) !== "yes") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);

  const ack = (decision: "accept" | "decline") => {
    try {
      window.localStorage.setItem(KEY, "yes");
      window.localStorage.setItem("dose-cookies-decision", decision);
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t backdrop-blur-md"
      style={{
        background: "hsla(45, 49%, 90%, 0.96)",
        color: "hsl(170 58% 14%)",
        borderColor: "hsl(40 18% 80%)",
      }}
      data-testid="cookie-banner"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-4 text-xs md:flex-row md:items-center md:justify-between md:px-10">
        <p
          className="max-w-3xl leading-relaxed"
          style={{ color: "hsl(170 18% 28%)" }}
        >
          This website uses cookies, pixels, software, and/or other technology for
          advertising, analytics, and social media — to better understand how visitors
          use our site and to offer you a more personalized experience. We share
          information with our analytics, advertising, and social partners.{" "}
          <a href="#cookies" className="underline">
            Learn more
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
