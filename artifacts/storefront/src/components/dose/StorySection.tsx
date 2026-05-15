import { Emblem } from "./Logo";
import { Image } from "./Image";
import storyFeature from "@/assets/brand/bottle-bar-lifestyle.png?picture";

export function StorySection() {
  return (
    <section
      id="story"
      data-testid="story-section"
      className="relative overflow-hidden"
      style={{ background: "hsl(45 49% 90%)", color: "hsl(170 58% 14%)" }}
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 md:grid-cols-12 md:gap-16 md:px-10 md:py-32">
        <div className="md:col-span-5">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl shadow-xl">
            <Image
              picture={storyFeature}
              alt="DŌSE bottle in a candlelit bar setting"
              className="h-full w-full object-cover"
              pictureClassName="block h-full w-full"
              sizes="(min-width: 768px) 40vw, 90vw"
            />
          </div>
        </div>
        <div className="md:col-span-7 md:pt-6">
          <p className="eyebrow" style={{ color: "hsl(170 18% 32%)" }}>
            Our Story
          </p>
          <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Made for the moments
            <br />
            <span className="font-display-italic">in between.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed" style={{ color: "hsl(170 18% 28%)" }}>
            We believe better living comes in small, intentional doses. So we built a dropper
            you can trust — distilled, lab-verified, and dialed-in to ten precise milligrams
            per drop. No edibles roulette. No sugary mixers. Just a clean lift, on your terms.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                title: "Distilled",
                body: "Triple-distilled hemp-derived THC for purity you can taste.",
              },
              {
                title: "Dosed",
                body: "10 mg per drop. 30 doses per bottle. Same lift, every time.",
              },
              {
                title: "Devoted",
                body: "Third-party tested, made in small batches, shipped fast.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border bg-card p-5 shadow-sm"
                style={{ borderColor: "hsl(40 18% 80%)" }}
                data-testid={`story-card-${card.title.toLowerCase()}`}
              >
                <Emblem className="h-8 w-auto" color="hsl(170 58% 14%)" />
                <h3 className="mt-3 font-display text-2xl">{card.title}</h3>
                <p
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: "hsl(170 18% 32%)" }}
                >
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
