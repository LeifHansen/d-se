import { ArrowRight } from "lucide-react";
import { ImagePlaceholder } from "./ImagePlaceholder";

const stats = [
  { label: "MG Delta-9 / Bottle", value: "1000" },
  { label: "Batches Lab-Tested", value: "100%" },
  { label: "Precision Dropper", value: "10mL" },
];

export function Hero() {
  return (
    <section
      data-testid="hero"
      className="grain relative overflow-hidden bg-white text-ink"
    >
      {/* Spray mist */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-40 top-0 h-[36rem] w-[36rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--turquoise) / 0.32), transparent)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 bottom-[-8rem] h-[30rem] w-[30rem] rounded-full blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, hsl(var(--pink-soft) / 0.42), transparent)",
        }}
      />
      {/* Halftone screen-print corner */}
      <div
        aria-hidden="true"
        className="halftone pointer-events-none absolute left-[46%] top-6 hidden h-80 w-80 text-ink/35 md:block"
      />
      {/* Stencil watermark */}
      <div
        aria-hidden="true"
        className="watermark -bottom-[0.18em] -left-2 text-[28vw] md:text-[22vw]"
        data-watermark="DŌSE"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-12 md:grid-cols-12 md:gap-10 md:px-10 md:pb-28 md:pt-20 lg:pt-24">
        {/* Copy */}
        <div className="md:col-span-7">
          <span className="sticker">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-ink"
            />
            1000mg Hemp-Derived Delta-9 THC
          </span>

          <h1 className="mt-7 max-w-[11ch] font-display text-[4.1rem] leading-[0.9] sm:text-[5.25rem] md:max-w-none md:text-[5.75rem] lg:text-[6.5rem] xl:text-[7rem]">
            The finest cannabinoid beverage additive{" "}
            <span className="font-display-italic text-pink">ever bottled.</span>
          </h1>

          <p className="mt-7 max-w-lg text-base leading-relaxed text-graphite md:text-lg">
            DŌSE is a precision beverage additive — 1000mg of hemp-derived
            Delta-9 THC, water-soluble. Rapid onset, stable for the long haul,
            and traceable from vetted farm to the final drop in your glass.
          </p>

          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <a
              href="#product"
              className="cta cta-pink"
              data-testid="hero-cta-primary"
            >
              Shop the Dropper <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
            <a
              href="#about"
              className="cta cta-outline"
              data-testid="hero-cta-secondary"
            >
              Our Story
            </a>
          </div>

          {/* Trust strip */}
          <dl className="mt-14 grid max-w-xl grid-cols-3 gap-6">
            {stats.map((s) => (
              <div key={s.label} className="border-l-2 border-turquoise pl-4">
                <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-silver-dark">
                  {s.label}
                </dt>
                <dd className="mt-1 font-display text-4xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Visual — placeholder until the packshot is ready */}
        <div className="relative md:col-span-5">
          <div className="relative mx-auto w-full max-w-md">
            <ImagePlaceholder
              label="Hero bottle shot"
              hint="Replace · 1200 × 1500"
              slug="home-hero"
              aspect="4 / 5"
              className="shadow-2xl"
            />
            <span
              className="sticker absolute -left-3 bottom-10 sm:-left-6"
              style={{ transform: "rotate(-6deg)" }}
            >
              Tracked farm → bottle
            </span>
            <span
              className="sticker sticker-turquoise absolute -right-2 top-8 sm:-right-5"
              style={{ transform: "rotate(5deg)" }}
            >
              Lab tested
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
