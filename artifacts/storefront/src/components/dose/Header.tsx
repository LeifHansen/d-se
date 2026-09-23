import { useEffect, useState } from "react";
import { ShoppingBag, User, Package } from "lucide-react";
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
import { useStoredCartId, onOpenCartDrawer } from "@/lib/cart";
import { CartDrawer } from "./CartDrawer";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

/**
 * Simplified site header: wordmark on the left, a single "Shop" action plus
 * account and cart on the right. No secondary navigation, no mobile drawer.
 */
export function Header() {
  const [scrolled, setScrolled] = useState(false);
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
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => onOpenCartDrawer(() => setCartOpen(true)), []);

  const returnUrl =
    typeof window !== "undefined"
      ? window.location.pathname + window.location.search
      : undefined;

  return (
    <header
      data-testid="dose-header"
      className={cn(
        "sticky top-0 z-40 w-full bg-white/92 text-ink backdrop-blur-md transition-shadow duration-300",
        scrolled ? "shadow-[0_1px_0_0_hsl(var(--silver))]" : "shadow-none",
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-3.5 md:px-10">
        <Link
          href="/"
          className="flex items-center gap-2.5"
          data-testid="header-logo"
          aria-label="DŌSE home"
        >
          <Emblem className="h-7 w-auto text-turquoise" />
          <Logo variant="wordmark" tone="ink" className="text-[1.45rem]" />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
          <Link href="/shop" className="cta cta-sm cta-ink" data-testid="nav-shop">
            Shop
          </Link>

          {clerkPublishableKey ? (
            <ClerkLoaded>
              <SignedOut>
                <SignInButton mode="modal" forceRedirectUrl={returnUrl}>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Sign in"
                    className="text-current hover:bg-ink/5"
                    data-testid="header-account"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </SignInButton>
                <SignUpButton mode="modal" forceRedirectUrl={returnUrl}>
                  <button
                    type="button"
                    className="hidden text-[11px] font-semibold uppercase tracking-[0.22em] text-graphite hover:text-ink md:inline"
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
              className="text-current hover:bg-ink/5"
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
            className="relative text-current hover:bg-ink/5"
            data-testid="header-cart"
            onClick={() => setCartOpen(true)}
          >
            <ShoppingBag className="h-4 w-4" />
            <span
              className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-pink px-1 text-[9px] font-bold text-white"
              data-testid="header-cart-count"
            >
              {cartCount > 99 ? "99+" : cartCount}
            </span>
          </Button>
        </nav>
      </div>
      <div className="brand-stripe" aria-hidden="true" />

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </header>
  );
}
