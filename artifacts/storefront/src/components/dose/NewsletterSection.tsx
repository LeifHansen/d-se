import { NewsletterForm } from "./NewsletterForm";

export function NewsletterSection() {
  return (
    <section
      data-testid="newsletter-section"
      style={{ background: "hsl(170 14% 75%)", color: "hsl(170 58% 14%)" }}
    >
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-2 md:px-10">
        <div>
          <p className="eyebrow" style={{ color: "hsl(170 35% 22%)" }}>
            Stay in the drop
          </p>
          <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
            Get $10 off
            <br />
            <span className="font-display-italic">your first dropper.</span>
          </h2>
        </div>
        <div className="flex w-full flex-col items-end justify-end gap-4">
          <p className="text-sm" style={{ color: "hsl(170 35% 22%)" }}>
            New drops, ritual recipes, and the occasional poem about going slow.
          </p>
          <NewsletterForm source="section" />
        </div>
      </div>
    </section>
  );
}
