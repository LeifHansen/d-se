import { type ReactNode } from "react";
import { PromoBanner } from "./PromoBanner";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { CookieBanner } from "./CookieBanner";
import { AgeGate } from "./AgeGate";

export function SiteShell({
  children,
  testId,
}: {
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
      <main id="main">{children}</main>
      <Footer />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
