import { Link } from "wouter";
import { ImagePlaceholder } from "@/components/dose/ImagePlaceholder";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";

const pillars = [
  {
    title: "Vetted",
    body: "Hemp-derived Delta-9 THC from farms we audit and approve — soil, water, and cultivation practices included.",
  },
  {
    title: "Emulsified",
    body: "A water-soluble cannabinoid beverage additive for rapid onset, even dosing, and a clean mix with no oily film.",
  },
  {
    title: "Traced",
    body: "Third-party tested by an ISO-accredited lab. Every batch gets an ID linking back to farm, panel, and fill date.",
  },
];

export default function About() {
  return (
    <SiteShell testId="page-about">
      <Seo
        title="Our Story"
        description="DŌSE is a precision beverage additive — 1000mg hemp-derived Delta-9 THC, water-soluble, tracked from vetted farm to final product."
      />
      <section className="grain grain-dark relative overflow-hidden bg-ink text-white">
        <div
          aria-hidden="true"
          className="watermark watermark-white -bottom-[0.18em] -right-4 text-[26vw] md:text-[16vw]"
          data-watermark="DŌSE"
        />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-12 md:gap-16 md:px-10 md:py-28">
          <div className="md:col-span-7">
            <p className="eyebrow text-turquoise-bright">Our Story</p>
            <h1 className="mt-4 font-display text-6xl leading-[0.92] md:text-8xl">
              The best additive{" "}
              <span className="font-display-italic text-pink-soft">
                on the market.
              </span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-white/80 md:text-lg">
              We started DŌSE because the cannabis category was a mess — unknown
              strengths, oily drinks, and hype dressed up as wellness. We set out
              to build the highest-quality cannabinoid beverage additive
              available: vetted sources, rapid onset, long-term stability, and a
              paper trail from farm to final product.
            </p>
          </div>
          <div className="md:col-span-5">
            <ImagePlaceholder
              tone="dark"
              label="Founders / lab shot"
              hint="Replace · 1200 × 1500"
              slug="about-hero"
              className="shadow-2xl"
            />
          </div>
        </div>
      </section>

      <section className="bg-white text-ink">
        <div className="mx-auto max-w-5xl px-6 py-20 md:px-10 md:py-24">
          <div className="grid gap-6 md:grid-cols-3">
            {pillars.map((c, i) => (
              <div
                key={c.title}
                className="rounded-2xl border border-silver bg-white p-6 shadow-sm"
                data-testid={`about-card-${c.title.toLowerCase()}`}
              >
                <span className="font-display text-3xl text-turquoise-deep">
                  0{i + 1}
                </span>
                <h2 className="mt-3 font-display text-3xl">{c.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-graphite">
                  {c.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-20 grid gap-12 md:grid-cols-12 md:items-center">
            <div className="md:col-span-5">
              <ImagePlaceholder
                label="Team / process shot"
                hint="Replace · 1200 × 1200"
                slug="about-team"
                aspect="1 / 1"
              />
            </div>
            <div className="md:col-span-7">
              <h2 className="font-display text-5xl leading-[0.92] md:text-6xl">
                Made by people who{" "}
                <span className="font-display-italic text-pink">
                  actually use it.
                </span>
              </h2>
              <p className="mt-5 text-base leading-relaxed text-graphite">
                We're a small team of formulators and designers obsessed with one
                thing: a cannabinoid beverage additive that performs the same way
                every single time. We test every batch on ourselves before it
                ships, and we publish the lab panel behind every bottle. Rapid
                onset, stable for the long haul — no guesswork, no shortcuts.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/shop" className="cta cta-pink">
                  Shop the dropper
                </Link>
                <Link href="/contact" className="cta cta-outline">
                  Contact us
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
