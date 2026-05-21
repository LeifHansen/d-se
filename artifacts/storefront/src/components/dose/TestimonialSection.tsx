const reviews = [
  {
    quote:
      "It mixes in completely clear — no oil slick, no aftertaste. You'd never know it was in the glass until it hits.",
    author: "Maya R.",
    location: "Brooklyn, NY",
  },
  {
    quote:
      "The onset is genuinely fast and predictable. I finally trust a product to do the same thing every time.",
    author: "Jordan T.",
    location: "Austin, TX",
  },
  {
    quote:
      "I checked the batch ID and actually found the lab report. That kind of transparency sold me for good.",
    author: "Priya S.",
    location: "Los Angeles, CA",
  },
];

export function TestimonialSection() {
  return (
    <section
      id="press"
      data-testid="testimonial-section"
      style={{ background: "hsl(45 49% 90%)", color: "hsl(166 95% 19%)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow" style={{ color: "hsl(170 18% 32%)" }}>
            Sip Notes
          </p>
          <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Loved by the <span className="font-display-italic">curious-sober.</span>
          </h2>
        </div>

        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {reviews.map((r, i) => (
            <figure
              key={r.author}
              className="rounded-3xl border p-7"
              style={{ borderColor: "hsl(40 18% 80%)", background: "hsl(45 50% 93%)" }}
              data-testid={`testimonial-${i + 1}`}
            >
              <div className="flex gap-1">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <span key={idx} aria-hidden style={{ color: "hsl(42 53% 54%)" }}>
                    ★
                  </span>
                ))}
              </div>
              <blockquote className="mt-4 font-display text-2xl leading-snug">
                "{r.quote}"
              </blockquote>
              <figcaption
                className="mt-5 text-xs uppercase tracking-[0.2em]"
                style={{ color: "hsl(170 18% 32%)" }}
              >
                — {r.author} · {r.location}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
