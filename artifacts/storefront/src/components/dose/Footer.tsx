import { Logo, Emblem } from "./Logo";
import { Instagram, Twitter, Youtube } from "lucide-react";
import { NewsletterForm } from "./NewsletterForm";
import { openCookiePreferences } from "./CookieBanner";

type FooterLink = { label: string; href: string; onClick?: () => void };

const cols: { title: string; links: FooterLink[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "All Products", href: "/shop" },
      { label: "Bundle & Save", href: "/shop" },
      { label: "Gift Cards", href: "/shop" },
      { label: "Your Cart", href: "/cart" },
      { label: "Your Account", href: "/account" },
    ],
  },
  {
    title: "Learn",
    links: [
      { label: "The Ritual", href: "/#ritual" },
      { label: "Lab Reports", href: "/#labs" },
      { label: "Journal", href: "/blog" },
      { label: "FAQ", href: "/#faq" },
      { label: "Dosage Guide", href: "/#ritual" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Our Story", href: "/about" },
      { label: "Sustainability", href: "/about" },
      { label: "Wholesale", href: "/contact" },
      { label: "Careers", href: "/contact" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Shipping", href: "/shipping-policy" },
      { label: "Returns", href: "/returns" },
      { label: "Track Order", href: "/contact" },
      { label: "Accessibility", href: "/accessibility" },
      { label: "Help Center", href: "/contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer
      data-testid="footer"
      style={{ background: "hsl(170 60% 11%)", color: "hsl(45 49% 90%)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-20 md:px-10">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="flex items-center gap-3">
              <Emblem className="h-10 w-auto" color="hsl(45 49% 90%)" />
              <Logo variant="wordmark" tone="cream" className="text-2xl" />
            </div>
            <p
              className="mt-5 max-w-xs text-sm leading-relaxed"
              style={{ color: "hsla(45,49%,90%,0.7)" }}
            >
              A precisely formulated THC dropper for the moments between hustle and rest.
              Made in small batches, lab-verified, shipped fast.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <a
                href="#instagram"
                aria-label="Instagram"
                className="rounded-full p-2 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: "hsl(42 53% 64%)" }}
                data-testid="social-instagram"
              >
                <Instagram className="h-4 w-4" />
              </a>
              <a
                href="#twitter"
                aria-label="X / Twitter"
                className="rounded-full p-2 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: "hsl(42 53% 64%)" }}
                data-testid="social-twitter"
              >
                <Twitter className="h-4 w-4" />
              </a>
              <a
                href="#youtube"
                aria-label="YouTube"
                className="rounded-full p-2 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ outlineColor: "hsl(42 53% 64%)" }}
                data-testid="social-youtube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="md:col-span-8">
            <div className="mb-10 max-w-md">
              <h4
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "hsl(42 53% 64%)" }}
              >
                Newsletter
              </h4>
              <p
                className="mt-3 text-sm"
                style={{ color: "hsla(45,49%,90%,0.7)" }}
              >
                $10 off your first dropper. New drops, ritual recipes, the
                occasional poem.
              </p>
              <div className="mt-4">
                <NewsletterForm
                  source="footer"
                  variant="dark"
                  testIdPrefix="newsletter-footer"
                />
              </div>
            </div>
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {cols.map((c) => (
              <div key={c.title}>
                <h4
                  className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{ color: "hsl(42 53% 64%)" }}
                >
                  {c.title}
                </h4>
                <ul className="mt-4 space-y-2.5">
                  {c.links.map((l) => (
                    <li key={l.label}>
                      <a
                        href={l.href}
                        className="text-sm hover:underline focus-visible:underline focus-visible:outline-none"
                        style={{ color: "hsla(45,49%,90%,0.85)" }}
                      >
                        {l.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            </div>
          </div>
        </div>

        <div
          className="mt-16 flex flex-col items-start justify-between gap-4 border-t pt-6 text-xs md:flex-row md:items-center"
          style={{ borderColor: "hsla(45,49%,90%,0.12)", color: "hsla(45,49%,90%,0.55)" }}
        >
          <p>© {new Date().getFullYear()} DŌSE Wellness Co. All rights reserved.</p>
          <p className="max-w-xl leading-relaxed">
            For adults 21+ only. Hemp-derived ∆9-THC product. Do not drive or operate
            machinery after use. Keep out of reach of children and pets.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="/privacy" className="hover:underline" data-testid="footer-privacy">
              Privacy
            </a>
            <a href="/terms" className="hover:underline" data-testid="footer-terms">
              Terms
            </a>
            <a
              href="/accessibility"
              className="hover:underline"
              data-testid="footer-accessibility"
            >
              Accessibility
            </a>
            <button
              type="button"
              onClick={openCookiePreferences}
              className="hover:underline"
              data-testid="footer-cookie-prefs"
            >
              Cookie preferences
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
