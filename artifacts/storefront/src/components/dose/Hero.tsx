import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import bottleHero from "@/assets/brand/final/emblem-gold.jpg";

export function Hero() {
  return (
    <section
      data-testid="hero"
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, hsl(164 68% 27%) 0%, hsl(166 95% 19%) 60%, hsl(167 95% 13%) 100%)",
        color: "hsl(45 49% 90%)",
      }}
    >
      {/* Subtle palm shadow */}
      <div
        aria-hidden
        className="palm-shadow pointer-events-none absolute inset-0 opacity-60"
      />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-6 pb-24 pt-16 md:grid-cols-12 md:gap-8 md:px-10 md:pb-32 md:pt-24 lg:pt-28">
        {/* Copy */}
        <div className="md:col-span-7 lg:col-span-7">
          <div
            className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.22em]"
            style={{ borderColor: "hsla(45, 49%, 90%, 0.2)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "hsl(42 53% 54%)" }}
            />
            1000mg Hemp-Derived Delta-9 THC
          </div>

          <h1 className="font-display text-[14vw] leading-[0.95] sm:text-7xl md:text-[5.5rem] lg:text-[6.75rem]">
            The finest cannabinoid
            <br />
            emulsion{" "}
            <span className="font-display-italic" style={{ color: "hsl(42 53% 64%)" }}>
              ever bottled.
            </span>
          </h1>

          <p
            className="mt-6 max-w-lg text-base md:text-lg"
            style={{ color: "hsla(45, 49%, 90%, 0.78)" }}
          >
            DŌSE is a precision beverage dropper — 1000mg of hemp-derived Delta-9 THC
            in a water-soluble emulsion. Rapid onset, stable for the long haul, and
            traceable from vetted farm to the final drop in your glass.
          </p>

          <div className="mt-10 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <Button
              size="lg"
              className="rounded-full px-8 py-6 text-[12px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "hsl(42 53% 54%)",
                color: "hsl(166 95% 19%)",
                borderColor: "hsl(42 53% 46%)",
              }}
              data-testid="hero-cta-primary"
            >
              Shop the Dropper <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-8 py-6 text-[12px] font-semibold uppercase tracking-[0.22em]"
              style={{
                background: "transparent",
                color: "hsl(45 49% 90%)",
                borderColor: "hsla(45, 49%, 90%, 0.4)",
              }}
              data-testid="hero-cta-secondary"
            >
              Our Story
            </Button>
          </div>

          {/* Trust strip */}
          <dl className="mt-14 grid max-w-xl grid-cols-3 gap-6">
            {[
              { label: "MG Delta-9 / Bottle", value: "1000" },
              { label: "Batches Lab-Tested", value: "100%" },
              { label: "Precision Dropper", value: "10mL" },
            ].map((s) => (
              <div
                key={s.label}
                className="border-l pl-4"
                style={{ borderColor: "hsla(45,49%,90%,0.18)" }}
              >
                <dt
                  className="text-[10px] font-medium uppercase tracking-[0.22em]"
                  style={{ color: "hsla(45, 49%, 90%, 0.65)" }}
                >
                  {s.label}
                </dt>
                <dd className="font-display text-3xl">{s.value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Visual — clean framed product photo */}
        <div className="relative md:col-span-5 lg:col-span-5">
          <div
            className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl shadow-2xl ring-1"
            style={{ borderColor: "hsla(45,49%,90%,0.14)" }}
          >
            <img
              src={bottleHero}
              alt="DŌSE — the mountain-droplet emblem"
              className="absolute inset-0 h-full w-full object-cover"
              fetchPriority="high"
            />
            {/* Soft bottom fade so a caption chip stays legible */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
              style={{
                background:
                  "linear-gradient(to top, hsla(167,95%,8%,0.7), transparent)",
              }}
            />
            <div
              className="absolute bottom-4 left-4 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ background: "hsla(45,49%,90%,0.92)", color: "hsl(166 95% 19%)" }}
            >
              Tracked farm → bottle
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
