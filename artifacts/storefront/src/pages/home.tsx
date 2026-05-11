import { Seo } from "@/components/seo/Seo";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/JsonLd";
import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { AgeGate } from "@/components/dose/AgeGate";
import { Hero } from "@/components/dose/Hero";
import { StorySection } from "@/components/dose/StorySection";
import { ProductSection } from "@/components/dose/ProductSection";
import { RitualSection } from "@/components/dose/RitualSection";
import { TestimonialSection } from "@/components/dose/TestimonialSection";
import { JournalSection } from "@/components/dose/JournalSection";
import { NewsletterSection } from "@/components/dose/NewsletterSection";
import { Footer } from "@/components/dose/Footer";
import { MysteryOfferPill } from "@/components/dose/MysteryOfferPill";
import { CookieBanner } from "@/components/dose/CookieBanner";

export default function Home() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground" data-testid="home">
      <Seo canonical="/" />
      <OrganizationJsonLd />
      <WebSiteJsonLd />
      <PromoBanner />
      <Header />
      <main>
        <Hero />
        <StorySection />
        <ProductSection />
        <RitualSection />
        <TestimonialSection />
        <JournalSection />
        <NewsletterSection />
      </main>
      <Footer />
      <MysteryOfferPill />
      <CookieBanner />
      <AgeGate />
    </div>
  );
}
