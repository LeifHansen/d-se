import { Link } from "wouter";
import { Emblem } from "@/components/dose/Logo";
import { Image } from "@/components/dose/Image";
import { SiteShell } from "@/components/dose/SiteShell";
import { Seo } from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import storyVisual from "@/assets/brand/bottle-marble-glass.png?picture";
import bottleClose from "@/assets/brand/bottle-label-detail.jpg?picture";

export default function About() {
  return (
    <SiteShell testId="page-about">
      <Seo
        title="Our Story"
        description="DŌSE is a precision THC dropper made in small, intentional batches. Distilled, dosed, devoted."
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
              Better living,
              <br />
              <span
                className="font-display-italic"
                style={{ color: "hsl(95 30% 78%)" }}
              >
                in small doses.
              </span>
            </h1>
            <p
              className="mt-6 max-w-xl text-base md:text-lg"
              style={{ color: "hsla(45,49%,90%,0.78)" }}
            >
              We started DŌSE because the cannabis category was a mess — sticky
              gummies of unknown strength, syrupy drinks, and hype dressed up
              as wellness. We wanted a dropper we could actually trust. So we
              made one.
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
                title: "Distilled",
                body: "Triple-distilled, hemp-derived ∆9-THC for a clean, neutral profile. No solvents. No additives.",
              },
              {
                title: "Dosed",
                body: "10 mg per drop. 30 doses per bottle. The same precise lift, every time, with no edibles guesswork.",
              },
              {
                title: "Devoted",
                body: "Third-party tested by an ISO-accredited lab. Every batch published, never promised.",
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
                We're a small team of formulators, designers, and chefs based
                between Brooklyn and Los Angeles. We test every batch on
                ourselves, our partners, and a small panel of friends. If a
                drop doesn't earn its place in our own evening ritual, it
                doesn't ship.
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
