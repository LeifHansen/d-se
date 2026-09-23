import { Logo, Emblem } from "./Logo";
import { Instagram, Twitter, Youtube } from "lucide-react";
import { NewsletterForm } from "./NewsletterForm";
import { openCookiePreferences } from "./CookieBanner";

type FooterLink = { label: string; href: string };

const cols: { title: string; links: FooterLink[] }[] = [
  {
    title: "Shop",
    links: [
      { label: "The Dropper", href: "/shop" },
      { label: "Your Cart", href: "/cart" },
      { label: "Your Account", href: "/account" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Our Story", href: "/about" },
      { label: "Journal", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Shipping", href: "/shipping-policy" },
      { label: "Returns", href: "/returns" },
      { label: "Track an order", href: "/account" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
];

const socials = [
  { href: "#instagram", label: "Instagram", Icon: Instagram, testId: "social-instagram" },
  { href: "#twitter", label: "X / Twitter", Icon: Twitter, testId: "social-twitter" },
  { href: "#youtube", label: "YouTube", Icon: Youtube, testId: "social-youtube" },
];

export function Footer() {
  return (
    <footer
      data-testid="footer"
      className="grain grain-dark relative overflow-hidden bg-ink text-white"
    >
      <div className="brand-stripe" aria-hidden="true" />

      <div className="relative mx-auto max-w-7xl px-6 py-16 md:px-10 md:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          <div className="md:col-span-4">
            <div className="flex items-center gap-3">
              <Emblem className="h-10 w-auto text-turquoise" />
              <Logo variant="wordmark" tone="white" className="text-3xl" />
            </div>
            <p className="mt-5 max-w-xs text-sm leading-relaxed text-white/70">
              A precisely formulated THC dropper for the moments between hustle
              and rest. Made in small batches, lab-verified, shipped fast.
            </p>
            <div className="mt-6 flex items-center gap-2">
              {socials.map(({ href, label, Icon, testId }) => (
                <a
                  key={label}
                  href={href}
                  aria-label={label}
                  className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-turquoise"
                  data-testid={testId}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <div className="md:col-span-8">
            <div className="mb-10 max-w-md">
              <h4 className="eyebrow text-turquoise-bright">Newsletter</h4>
              <p className="mt-3 text-sm text-white/70">
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
            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
              {cols.map((c) => (
                <div key={c.title}>
                  <h4 className="eyebrow text-turquoise-bright">{c.title}</h4>
                  <ul className="mt-4 space-y-2.5">
                    {c.links.map((l) => (
                      <li key={l.label}>
                        <a
                          href={l.href}
                          className="text-sm text-white/85 transition-colors hover:text-white hover:underline focus-visible:underline focus-visible:outline-none"
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

        <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-white/12 pt-6 text-xs text-white/65 md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} DŌSE Wellness Co. All rights reserved.</p>
          <p className="max-w-xl leading-relaxed">
            For adults 21+ only. Hemp-derived ∆9-THC product. Do not drive or
            operate machinery after use. Keep out of reach of children and pets.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <a href="/privacy" className="hover:text-white hover:underline" data-testid="footer-privacy">
              Privacy
            </a>
            <a href="/terms" className="hover:text-white hover:underline" data-testid="footer-terms">
              Terms
            </a>
            <a
              href="/accessibility"
              className="hover:text-white hover:underline"
              data-testid="footer-accessibility"
            >
              Accessibility
            </a>
            <button
              type="button"
              onClick={openCookiePreferences}
              className="hover:text-white hover:underline"
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
