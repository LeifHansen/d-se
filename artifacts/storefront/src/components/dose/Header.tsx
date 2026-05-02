import { useEffect, useState } from "react";
import { ShoppingBag, User, Menu, X, ChevronDown } from "lucide-react";
import { Logo, Emblem } from "./Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { label: "Shop", href: "#shop" },
  { label: "Bundle & Save", href: "#bundles" },
  { label: "Our Story", href: "#story" },
  { label: "Journal", href: "#journal" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid="dose-header"
      className={cn(
        "sticky top-0 z-40 w-full transition-colors duration-300",
        scrolled
          ? "backdrop-blur-md"
          : "backdrop-blur-sm",
      )}
      style={{
        background: scrolled
          ? "hsla(170, 58%, 14%, 0.92)"
          : "hsla(170, 58%, 14%, 0.6)",
        color: "hsl(45 49% 90%)",
        borderBottom: scrolled
          ? "1px solid hsla(45, 49%, 90%, 0.10)"
          : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4 md:px-10">
        {/* Left: nav */}
        <nav className="hidden items-center gap-8 md:flex">
          {nav.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="group inline-flex items-center gap-1 text-[13px] font-medium tracking-wide transition-opacity hover:opacity-70"
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {item.label}
              {item.label === "Shop" && (
                <ChevronDown className="h-3 w-3 transition-transform group-hover:translate-y-0.5" />
              )}
            </a>
          ))}
        </nav>

        {/* Mobile menu trigger */}
        <button
          className="md:hidden"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
          data-testid="mobile-menu-trigger"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Center logo */}
        <a
          href="/"
          className="flex items-center gap-2"
          data-testid="header-logo"
          aria-label="DŌSE home"
        >
          <Emblem className="h-7 w-auto" color="hsl(45 49% 90%)" />
          <Logo variant="wordmark" tone="cream" className="text-lg" />
        </a>

        {/* Right: account & cart */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Account"
            className="text-current hover:bg-white/5"
            data-testid="header-account"
          >
            <User className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cart"
            className="relative text-current hover:bg-white/5"
            data-testid="header-cart"
          >
            <ShoppingBag className="h-4 w-4" />
            <span
              className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full text-[9px] font-semibold"
              style={{
                background: "hsl(42 53% 54%)",
                color: "hsl(170 58% 14%)",
              }}
            >
              0
            </span>
          </Button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          style={{ background: "hsl(170 58% 14%)" }}
          data-testid="mobile-menu"
        >
          <div className="flex items-center justify-between px-6 py-4">
            <Logo variant="wordmark" tone="cream" />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              data-testid="mobile-menu-close"
            >
              <X className="h-6 w-6" style={{ color: "hsl(45 49% 90%)" }} />
            </button>
          </div>
          <nav className="mt-8 flex flex-col gap-6 px-8">
            {nav.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="font-display text-3xl"
                style={{ color: "hsl(45 49% 90%)" }}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
