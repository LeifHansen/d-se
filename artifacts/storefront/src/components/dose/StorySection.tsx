import { Emblem } from "./Logo";
import { Image } from "./Image";
import storyFeature from "@/assets/brand/final/bottle-mockup.jpg?picture";

export function StorySection() {
  return (
    <section
      id="story"
      data-testid="story-section"
      className="relative overflow-hidden"
      style={{ background: "hsl(45 49% 90%)", color: "hsl(166 95% 19%)" }}
    >
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 md:grid-cols-12 md:gap-16 md:px-10 md:py-32">
        <div className="md:col-span-5">
          <div className="aspect-[4/5] w-full overflow-hidden rounded-3xl shadow-xl">
            <Image
              picture={storyFeature}
              alt="DŌSE — tracked from vetted farm to final bottled product"
              className="h-full w-full object-cover"
              pictureClassName="block h-full w-full"
              sizes="(min-width: 768px) 40vw, 90vw"
            />
          </div>
        </div>
        <div className="md:col-span-7 md:pt-6">
          <p className="eyebrow" style={{ color: "hsl(170 18% 32%)" }}>
            Farm to Final Product
          </p>
          <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Tracked from farm
            <br />
            <span className="font-display-italic">to final drop.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed" style={{ color: "hsl(170 18% 28%)" }}>
            Every DŌSE bottle starts with a vetted farm and ends with a batch ID you
            can trace. We audit our hemp sources, emulsify the cannabinoids in-house
            for rapid, even onset, and third-party test every batch — so what reaches
            your glass is, simply, the best cannabinoid emulsion on the market.
          </p>

          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {[
              {
                title: "Vetted",
                body: "Every hemp source is audited and approved before a single plant is harvested.",
              },
              {
                title: "Emulsified",
                body: "A water-soluble emulsion built for rapid onset and a clean, even lift.",
              },
              {
                title: "Traced",
                body: "Every bottle carries a batch ID linking back to farm, lab, and fill date.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border bg-card p-5 shadow-sm"
                style={{ borderColor: "hsl(40 18% 80%)" }}
                data-testid={`story-card-${card.title.toLowerCase()}`}
              >
                <Emblem className="h-8 w-auto" color="hsl(166 95% 19%)" />
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
