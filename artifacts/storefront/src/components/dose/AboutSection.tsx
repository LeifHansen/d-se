import { ImagePlaceholder } from "./ImagePlaceholder";

const pillars = [
  {
    title: "Vetted",
    body: "Every hemp source is audited and approved before a single plant is harvested.",
  },
  {
    title: "Emulsified",
    body: "A water-soluble beverage additive built for rapid onset and a clean, even lift.",
  },
  {
    title: "Traced",
    body: "Every bottle carries a batch ID linking back to farm, lab, and fill date.",
  },
];

export function AboutSection() {
  return (
    <section
      id="about"
      data-testid="about-section"
      className="grain relative overflow-hidden bg-silver-light text-ink"
    >
      <div
        aria-hidden="true"
        className="watermark -right-4 top-4 text-[26vw] md:text-[16vw]"
        data-watermark="01"
      />

      <div className="relative mx-auto grid max-w-7xl gap-14 px-6 py-20 md:grid-cols-12 md:gap-16 md:px-10 md:py-28">
        <div className="md:col-span-5">
          <div className="relative">
            <ImagePlaceholder
              label="Lifestyle / farm shot"
              hint="Replace · 1200 × 1500"
              slug="home-about"
              aspect="4 / 5"
              className="border-silver-dark/40 bg-white shadow-xl"
            />
            <span
              className="sticker sticker-white absolute -bottom-4 left-6"
              style={{ transform: "rotate(-3deg)" }}
            >
              Farm → final product
            </span>
          </div>
        </div>

        <div className="md:col-span-7 md:pt-4">
          <p className="eyebrow text-turquoise-deep">About DŌSE</p>
          <h2 className="mt-4 font-display text-6xl leading-[0.92] md:text-7xl">
            Tracked from farm{" "}
            <span className="font-display-italic text-pink">to final drop.</span>
          </h2>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-graphite">
            Every DŌSE bottle starts with a vetted farm and ends with a batch ID
            you can trace. We audit our hemp sources, emulsify the cannabinoids
            in-house for rapid, even onset, and third-party test every batch —
            so what reaches your glass is, simply, the best cannabinoid beverage
            additive on the market.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {pillars.map((card, i) => (
              <div
                key={card.title}
                className="rounded-2xl border border-silver bg-white p-5 shadow-sm"
                data-testid={`about-card-${card.title.toLowerCase()}`}
              >
                <span className="font-display text-3xl text-turquoise-deep">
                  0{i + 1}
                </span>
                <h3 className="mt-3 font-display text-3xl">{card.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-graphite">
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
