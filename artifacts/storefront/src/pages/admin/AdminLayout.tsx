import { type ReactNode } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useLocation } from "wouter";
import {
  ClerkLoaded,
  ClerkLoading,
  SignedIn,
  SignedOut,
  SignIn,
  UserButton,
  useUser,
} from "@clerk/clerk-react";
import { Logo } from "@/components/dose/Logo";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/discounts", label: "Discount codes" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/abandoned-carts", label: "Abandoned carts" },
  { href: "/admin/newsletter", label: "Newsletter" },
  { href: "/admin/tax", label: "Tax summary" },
];

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

// Dev/test-only escape hatch so Playwright can drive the admin UI without
// a live Clerk session. Gated on `import.meta.env.DEV` so it can never be
// activated in production builds, even if the env var leaks.
const e2eBypass =
  import.meta.env.DEV &&
  (import.meta.env.VITE_ADMIN_E2E_BYPASS as string | undefined) === "1";

export function AdminLayout({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  const [location] = useLocation();

  if (e2eBypass) {
    return (
      <AdminShell>
        <AdminBody title={title} location={location} bypassAuth>
          {children}
        </AdminBody>
      </AdminShell>
    );
  }

  if (!clerkPublishableKey) {
    return (
      <AdminShell>
        <div
          className="rounded-md border border-dashed border-foreground/30 p-6 text-sm text-foreground/80"
          data-testid="admin-auth-not-configured"
        >
          Sign-in is not configured for this environment. Set{" "}
          <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> and
          rebuild to access the admin dashboard.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <ClerkLoading>
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignedOut>
          <div className="flex justify-center py-12" data-testid="admin-signin">
            <SignIn routing="hash" />
          </div>
        </SignedOut>
        <SignedIn>
          <AdminBody title={title} location={location}>
            {children}
          </AdminBody>
        </SignedIn>
      </ClerkLoaded>
    </AdminShell>
  );
}

function AdminBody({
  title,
  location,
  children,
  bypassAuth = false,
}: {
  title?: string;
  location: string;
  children: ReactNode;
  bypassAuth?: boolean;
}) {
  return (
    <div className="grid gap-8 md:grid-cols-[220px_1fr]">
      <aside className="md:sticky md:top-24 md:self-start">
        <nav
          className="flex flex-row gap-1 overflow-x-auto md:flex-col"
          aria-label="Admin sections"
        >
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/admin"
                ? location === "/admin"
                : location === item.href ||
                  location.startsWith(item.href + "/");
            const slug =
              item.href === "/admin"
                ? "dashboard"
                : item.href.split("/").pop();
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-foreground/70 hover:bg-foreground/10 hover:text-foreground",
                )}
                data-testid={`admin-nav-${slug}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <main id="main">
        <div className="mb-6 flex items-center justify-between gap-4">
          {title ? (
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          ) : (
            <span />
          )}
          {bypassAuth ? (
            <span
              className="text-xs text-muted-foreground"
              data-testid="text-admin-email"
            >
              e2e@example.com
            </span>
          ) : (
            <AdminUserChip />
          )}
        </div>
        {children}
      </main>
    </div>
  );
}

function AdminUserChip() {
  const { user } = useUser();
  return (
    <div className="flex items-center gap-3">
      <span
        className="hidden text-xs text-muted-foreground sm:inline"
        data-testid="text-admin-email"
      >
        {user?.primaryEmailAddress?.emailAddress ?? ""}
      </span>
      <UserButton afterSignOutUrl="/admin" />
    </div>
  );
}

function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      data-testid="admin-shell"
    >
      <Helmet prioritizeSeoTags>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <header className="border-b border-foreground/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
            <span className="text-xs uppercase tracking-[0.2em] text-foreground/60">
              Admin
            </span>
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">{children}</div>
    </div>
  );
}
