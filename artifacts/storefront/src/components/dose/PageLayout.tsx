import { type ReactNode } from "react";
import { PromoBanner } from "./PromoBanner";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CookieBanner } from "./CookieBanner";
import { AgeGate } from "./AgeGate";

export function PageLayout({
  title,
  eyebrow,
  updated,
  children,
  testId,
}: {
  title: string;
  eyebrow?: string;
  updated?: string;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className="min-h-screen w-full bg-background text-foreground"
      data-testid={testId}
    >
      <PromoBanner />
      <Header />
      <main id="main">
        <section
          style={{ background: "hsl(166 95% 19%)", color: "hsl(45 49% 90%)" }}
        >
          <div className="mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20">
            {eyebrow && (
              <p
                className="text-[11px] font-semibold uppercase tracking-[0.22em]"
                style={{ color: "hsl(42 53% 64%)" }}
              >
                {eyebrow}
              </p>
            )}
            <h1 className="mt-3 font-display text-4xl leading-tight md:text-5xl">
              {title}
            </h1>
            {updated && (
              <p
                className="mt-4 text-xs"
                style={{ color: "hsla(45,49%,90%,0.65)" }}
              >
                Last updated: {updated}
              </p>
            )}
          </div>
        </section>
        <article className="prose prose-neutral mx-auto max-w-3xl px-6 py-12 md:px-10 md:py-16">
          {children}
        </article>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
