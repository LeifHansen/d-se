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
        <section className="grain grain-dark relative overflow-hidden bg-ink text-white">
          <div
            aria-hidden="true"
            className="watermark watermark-white -bottom-[0.2em] -right-4 text-[24vw] md:text-[12vw]"
            data-watermark="DŌSE"
          />
          <div className="relative mx-auto max-w-3xl px-6 py-16 md:px-10 md:py-20">
            {eyebrow && <p className="eyebrow text-turquoise-bright">{eyebrow}</p>}
            <h1 className="mt-4 font-display text-5xl leading-[0.92] md:text-6xl">
              {title}
            </h1>
            {updated && (
              <p className="mt-4 text-xs text-white/65">Last updated: {updated}</p>
            )}
          </div>
        </section>
        <article className="prose prose-neutral mx-auto max-w-3xl px-6 py-12 prose-headings:font-display prose-headings:tracking-wide prose-a:text-turquoise-deep md:px-10 md:py-16">
          {children}
        </article>
      </main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
