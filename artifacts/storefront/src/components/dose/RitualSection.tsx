import { Droplet, GlassWater, Leaf, MoonStar } from "lucide-react";

const steps = [
  {
    icon: GlassWater,
    title: "Pour your drink",
    body: "Sparkling water, mocktail, kombucha — anything cold or warm.",
  },
  {
    icon: Droplet,
    title: "Add your dose",
    body: "Squeeze the precision dropper and control your exact serving.",
  },
  {
    icon: Leaf,
    title: "Stir & sip",
    body: "The water-soluble beverage additive blends in clean — no oily film, no haze.",
  },
  {
    icon: MoonStar,
    title: "Feel it fast",
    body: "Rapid onset you can count on, then a smooth, stable landing.",
  },
];

export function RitualSection() {
  return (
    <section
      id="how"
      data-testid="ritual-section"
      className="relative overflow-hidden bg-white text-ink"
    >
      <div
        aria-hidden="true"
        className="watermark -left-3 top-4 text-[26vw] md:text-[16vw]"
        data-watermark="02"
      />

      <div className="relative mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow text-turquoise-deep">The Ritual</p>
          <h2 className="mt-4 font-display text-6xl leading-[0.92] md:text-7xl">
            Four steps to your{" "}
            <span className="font-display-italic text-pink">drop.</span>
          </h2>
        </div>

        <ol className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li
                key={s.title}
                className="relative overflow-hidden rounded-2xl border border-silver bg-white p-6 shadow-sm"
                data-testid={`ritual-step-${i + 1}`}
              >
                <div
                  aria-hidden="true"
                  className="watermark watermark-turquoise -right-1 -top-2 text-7xl"
                  data-watermark={`0${i + 1}`}
                />
                <span className="grid h-11 w-11 place-items-center rounded-full bg-turquoise-tint text-turquoise-deep">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 font-display text-3xl">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-graphite">
                  {s.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
