import { Link } from "wouter";
import { Emblem } from "@/components/dose/Logo";
import { Image } from "@/components/dose/Image";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import storyVisual from "@/assets/brand/Dose2/dose2-brand-mockup.jpg?picture";
import bottleClose from "@/assets/brand/Dose2/dose2-bottle-product.png?picture";

export default function About() {
  return (
    <SiteShell testId="page-about">
      <Seo
        title="Our Story"
        description="DŌSE is a precision beverage dropper — 1000mg hemp-derived Delta-9 THC in a water-soluble emulsion, tracked from vetted farm to final product."
      />
      <section
        style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      >
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-12 md:gap-16 md:px-10 md:py-28">
          <div className="md:col-span-7">
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.22em]"
              style={{ color: "hsl(42 53% 64%)" }}
            >
              Our Story
            </p>
            <h1 className="mt-3 font-display text-5xl leading-[0.95] md:text-7xl">
              The best emulsion
              <br />
              <span
                className="font-display-italic"
                style={{ color: "hsl(95 30% 78%)" }}
              >
                on the market.
              </span>
            </h1>
            <p
              className="mt-6 max-w-xl text-base md:text-lg"
              style={{ color: "hsla(45,49%,90%,0.78)" }}
            >
              We started DŌSE because the cannabis category was a mess — unknown
              strengths, oily drinks, and hype dressed up as wellness. We set
              out to build the highest-quality cannabinoid emulsion available:
              vetted sources, rapid onset, long-term stability, and a paper
              trail from farm to final product.
            </p>
          </div>
          <div className="md:col-span-5">
            <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl shadow-2xl">
              <Image
                picture={storyVisual}
                alt="DŌSE bottle on a marble table beside a glass of water"
                className="h-full w-full object-cover"
                pictureClassName="block h-full w-full"
                sizes="(min-width: 768px) 40vw, 90vw"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="bg-background"
        style={{ color: "hsl(170 58% 14%)" }}
      >
        <div className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-24">
          <div className="grid gap-10 md:grid-cols-3">
            {[
              {
                title: "Vetted",
                body: "Hemp-derived Delta-9 THC from farms we audit and approve — soil, water, and cultivation practices included.",
              },
              {
                title: "Emulsified",
                body: "A water-soluble cannabinoid emulsion for rapid onset, even dosing, and a clean mix with no oily film.",
              },
              {
                title: "Traced",
                body: "Third-party tested by an ISO-accredited lab. Every batch gets an ID linking back to farm, panel, and fill date.",
              },
            ].map((c) => (
              <div
                key={c.title}
                className="rounded-2xl border bg-card p-6 shadow-sm"
                style={{ borderColor: "hsl(40 18% 80%)" }}
                data-testid={`about-card-${c.title.toLowerCase()}`}
              >
                <Emblem className="h-8 w-auto" color="hsl(170 58% 14%)" />
                <h2 className="mt-4 font-display text-2xl">{c.title}</h2>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "hsl(170 18% 32%)" }}
                >
                  {c.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-12 md:items-center">
            <div className="md:col-span-5">
              <div className="aspect-square w-full overflow-hidden rounded-3xl">
                <Image
                  picture={bottleClose}
                  alt="DŌSE bottle detail"
                  className="h-full w-full object-cover"
                  pictureClassName="block h-full w-full"
                  sizes="(min-width: 768px) 40vw, 90vw"
                />
              </div>
            </div>
            <div className="md:col-span-7">
              <h2 className="font-display text-4xl leading-tight md:text-5xl">
                Made by people who
                <br />
                <span className="font-display-italic">actually use it.</span>
              </h2>
              <p
                className="mt-5 text-base leading-relaxed"
                style={{ color: "hsl(170 18% 28%)" }}
              >
                We're a small team of formulators and designers obsessed with
                one thing: a cannabinoid emulsion that performs the same way
                every single time. We test every batch on ourselves before it
                ships, and we publish the lab panel behind every bottle. Rapid
                onset, stable for the long haul — no guesswork, no shortcuts.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    background: "hsl(170 58% 14%)",
                    color: "hsl(45 49% 90%)",
                  }}
                >
                  <Link href="/shop">Shop the dropper</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-full px-6 py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                >
                  <Link href="/contact">Contact us</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
