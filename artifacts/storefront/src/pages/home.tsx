import { PromoBanner } from "@/components/dose/PromoBanner";
import { Header } from "@/components/dose/Header";
import { AgeGate } from "@/components/dose/AgeGate";
import { Hero } from "@/components/dose/Hero";
import { AboutSection } from "@/components/dose/AboutSection";
import { FeaturedProduct } from "@/components/dose/FeaturedProduct";
import { RitualSection } from "@/components/dose/RitualSection";
import { TestimonialSection } from "@/components/dose/TestimonialSection";
import { NewsletterSection } from "@/components/dose/NewsletterSection";
import { Footer } from "@/components/dose/Footer";
import { CookieBanner } from "@/components/dose/CookieBanner";
import { NewsletterModal } from "@/components/dose/NewsletterModal";

/**
 * Homepage: hero → about → the one SKU, shown large → how it works → sip
 * notes → newsletter. One product, one path to the bottle.
 */
export default function Home() {
  return (
    <div className="min-h-screen w-full bg-background text-foreground" data-testid="home">
      <PromoBanner />
      <Header />
      <main id="main">
        <Hero />
        <AboutSection />
        <FeaturedProduct />
        <RitualSection />
        <TestimonialSection />
        <NewsletterSection />
      </main>
      <Footer />
      <CookieBanner />
      <NewsletterModal />
      <AgeGate />
    </div>
  );
}
