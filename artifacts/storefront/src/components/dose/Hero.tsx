import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "./Image";
import bottleClose from "@/assets/brand/bottle-droplet.png?picture";
import packaging from "@/assets/brand/bottle-moody-interior.png?picture";
import bottleStudio from "@/assets/brand/bottle-studio-angle.jpg";
import goldEmblem from "@/assets/brand/emblem-large-on-teal.jpg";

export function Hero() {
  return (
    <section
      data-testid="hero"
      className="relative overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, hsl(173 50% 20%) 0%, hsl(170 58% 14%) 60%, hsl(170 60% 11%) 100%)",
        color: "hsl(45 49% 90%)",
      }}
    >
      {/* Subtle palm shadow */}
      <div
        aria-hidden
        className="palm-shadow pointer-events-none absolute inset-0 opacity-60"
      />

      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 pb-24 pt-16 md:grid-cols-12 md:gap-8 md:px-10 md:pb-32 md:pt-24 lg:pt-28">
        {/* Copy */}
        <div className="md:col-span-7 lg:col-span-7">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.22em]"
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
            emulsion <span className="font-display-italic" style={{ color: "hsl(42 53% 64%)" }}>ever bottled.</span>
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
                color: "hsl(170 58% 14%)",
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
              <div key={s.label} className="border-l pl-4" style={{ borderColor: "hsla(45,49%,90%,0.18)" }}>
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

        {/* Visual */}
        <div className="relative md:col-span-5 lg:col-span-5">
          <div
            className="relative mx-auto aspect-[4/5] w-full max-w-md overflow-hidden rounded-3xl shadow-2xl ring-1"
            style={{
              background:
                "radial-gradient(120% 90% at 50% 30%, hsl(173 50% 22%) 0%, hsl(170 58% 14%) 55%, hsl(170 60% 9%) 100%)",
              borderColor: "hsla(45,49%,90%,0.12)",
            }}
          >
            {/* Gold emblem watermark backdrop */}
            <img
              src={goldEmblem}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-30"
              style={{ filter: "blur(2px) saturate(1.15)", mixBlendMode: "screen" }}
            />
            {/* Cinematic studio bottle photo */}
            <img
              src={bottleStudio}
              alt="DŌSE THC Infused Beverage Dropper bottle"
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                mixBlendMode: "luminosity",
                filter: "contrast(1.08) brightness(0.92) saturate(0.95)",
              }}
              fetchPriority="high"
            />
            {/* Teal color wash to harmonize the studio photo with the brand frame */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(120% 100% at 50% 40%, hsla(173,50%,22%,0.55) 0%, hsla(170,60%,11%,0.85) 100%)",
                mixBlendMode: "multiply",
              }}
            />
            {/* Crisp pass of the bottle on top so labels and gold stay sharp */}
            <img
              src={bottleStudio}
              alt=""
              aria-hidden
              className="absolute inset-0 m-auto h-[92%] w-[92%] object-contain drop-shadow-2xl"
              style={{
                filter:
                  "drop-shadow(0 30px 40px hsla(170,60%,4%,0.55)) saturate(1.05) contrast(1.05)",
                mixBlendMode: "lighten",
              }}
            />
            {/* Edge vignette so the photo bleeds softly into the frame */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(70% 60% at 50% 50%, hsla(0,0%,0%,0) 35%, hsla(170,60%,7%,0.75) 100%)",
              }}
            />
            {/* Top highlight band — film-still feel */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-1/3"
              style={{
                background:
                  "linear-gradient(to bottom, hsla(173,50%,30%,0.35), transparent)",
              }}
            />
            {/* Warm gold light wash from the upper-left */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 45% at 20% 15%, hsla(42,53%,54%,0.18), transparent 60%)",
                mixBlendMode: "screen",
              }}
            />
            {/* Bottom fade grounds the bottle */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
              style={{
                background:
                  "linear-gradient(to top, hsla(170,60%,7%,0.85), transparent)",
              }}
            />
          </div>
          <div
            className="absolute -bottom-10 -left-6 hidden w-44 overflow-hidden rounded-2xl shadow-xl ring-1 md:block"
            style={{ borderColor: "hsla(45,49%,90%,0.15)" }}
          >
            <Image
              picture={packaging}
              alt="DŌSE packaging detail"
              className="h-44 w-full object-cover"
              pictureClassName="block h-44 w-full"
              sizes="176px"
            />
          </div>
          <div
            className="absolute -top-6 -right-4 hidden w-32 overflow-hidden rounded-2xl shadow-xl ring-1 md:block"
            style={{ borderColor: "hsla(45,49%,90%,0.15)" }}
          >
            <Image
              picture={bottleClose}
              alt="DŌSE bottle close-up"
              className="h-32 w-full object-cover"
              pictureClassName="block h-32 w-full"
              sizes="128px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
