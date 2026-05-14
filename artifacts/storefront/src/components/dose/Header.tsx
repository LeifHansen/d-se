import { useEffect, useState } from "react";
import { ShoppingBag, User, Menu, X, Package } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  ClerkLoaded,
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/clerk-react";
import { useGetCart } from "@workspace/api-client-react";
import { Logo, Emblem } from "./Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useStoredCartId } from "@/lib/cart";
import { CartDrawer } from "./CartDrawer";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

const nav = [
  { label: "Shop", href: "/shop" },
  { label: "Our Story", href: "/about" },
  { label: "Journal", href: "/blog" },
  { label: "Contact", href: "/contact" },
];

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [, setLocation] = useLocation();
  const cartId = useStoredCartId();
  const { data: cart } = useGetCart(
    { cartId: cartId ?? undefined },
    { query: { enabled: !!cartId } as never },
  );
  const cartCount =
    cart?.items.reduce((sum, it) => sum + it.quantity, 0) ?? 0;

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
        scrolled ? "backdrop-blur-md" : "backdrop-blur-sm",
      )}
      style={{
        background: scrolled
          ? "hsla(170, 58%, 14%, 0.96)"
          : "hsla(170, 58%, 14%, 0.92)",
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
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex items-center text-[13px] font-medium tracking-wide transition-opacity hover:opacity-70"
              data-testid={`nav-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
            >
              {item.label}
            </Link>
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
        <Link
          href="/"
          className="flex items-center gap-2"
          data-testid="header-logo"
          aria-label="DŌSE home"
        >
          <Emblem className="h-7 w-auto" color="hsl(45 49% 90%)" />
          <Logo variant="wordmark" tone="cream" className="text-lg" />
        </Link>

        {/* Right: account & cart */}
        <div className="flex items-center gap-3">
          {clerkPublishableKey ? (
            <ClerkLoaded>
              <SignedOut>
                <SignInButton
                  mode="modal"
                  forceRedirectUrl={
                    typeof window !== "undefined"
                      ? window.location.pathname + window.location.search
                      : undefined
                  }
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sign in"
                    className="text-current hover:bg-white/5"
                    data-testid="header-account"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </SignInButton>
                <SignUpButton
                  mode="modal"
                  forceRedirectUrl={
                    typeof window !== "undefined"
                      ? window.location.pathname + window.location.search
                      : undefined
                  }
                >
                  <button
                    type="button"
                    className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] hover:opacity-70 md:inline"
                    data-testid="header-signup"
                  >
                    Join
                  </button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <div data-testid="header-user-button">
                  <UserButton
                    afterSignOutUrl={
                      typeof window !== "undefined"
                        ? window.location.pathname
                        : "/"
                    }
                    appearance={{
                      elements: {
                        avatarBox: "h-7 w-7",
                      },
                    }}
                  >
                    <UserButton.MenuItems>
                      <UserButton.Action
                        label="My orders"
                        labelIcon={<Package className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setLocation("/account");
                        }}
                      />
                    </UserButton.MenuItems>
                  </UserButton>
                </div>
              </SignedIn>
            </ClerkLoaded>
          ) : (
            <Button
              asChild
              variant="ghost"
              size="icon"
              aria-label="Account"
              className="text-current hover:bg-white/5"
              data-testid="header-account"
            >
              <Link href="/account">
                <User className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}
            className="relative text-current hover:bg-white/5"
            data-testid="header-cart"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag className="h-4 w-4" />
            <span
              className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-semibold"
              style={{
                background: "hsl(42 53% 54%)",
                color: "hsl(170 58% 14%)",
              }}
              data-testid="header-cart-count"
            >
              {cartCount > 99 ? "99+" : cartCount}
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
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="font-display text-3xl"
                style={{ color: "hsl(45 49% 90%)" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      )}

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </header>
  );
}
