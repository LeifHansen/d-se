import { Droplet, GlassWater, Leaf, MoonStar } from "lucide-react";

const steps = [
  {
    icon: GlassWater,
    title: "Pour your drink",
    body: "Sparkling water, mocktail, kombucha — anything cold or warm.",
  },
  {
    icon: Droplet,
    title: "Add a drop",
    body: "Squeeze the dropper. 10 mg dialed-in, every time.",
  },
  {
    icon: Leaf,
    title: "Stir & sip",
    body: "Light citrus notes blend in clean. Effects in 15–30 minutes.",
  },
  {
    icon: MoonStar,
    title: "Settle in",
    body: "A clear, gentle lift that lasts 2–3 hours, then softly fades.",
  },
];

export function RitualSection() {
  return (
    <section
      id="how"
      data-testid="ritual-section"
      style={{ background: "hsl(95 14% 67%)", color: "hsl(170 58% 14%)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow" style={{ color: "hsl(170 35% 22%)" }}>
            The Ritual
          </p>
          <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Four steps to your <span className="font-display-italic">DŌSE.</span>
          </h2>
        </div>
        <ol className="mt-14 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li
                key={s.title}
                className="relative rounded-2xl border p-6 backdrop-blur-sm"
                style={{
                  background: "hsla(45, 49%, 90%, 0.5)",
                  borderColor: "hsla(170, 58%, 14%, 0.08)",
                }}
                data-testid={`ritual-step-${i + 1}`}
              >
                <span
                  className="font-display text-sm tracking-wider"
                  style={{ color: "hsl(170 35% 22%)" }}
                >
                  0{i + 1}
                </span>
                <Icon className="mt-3 h-6 w-6" />
                <h3 className="mt-3 font-display text-2xl">{s.title}</h3>
                <p
                  className="mt-1 text-sm leading-relaxed"
                  style={{ color: "hsl(170 35% 22%)" }}
                >
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
