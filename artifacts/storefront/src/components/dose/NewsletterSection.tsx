import { NewsletterForm } from "./NewsletterForm";

export function NewsletterSection() {
  return (
    <section
      data-testid="newsletter-section"
      className="grain relative overflow-hidden bg-turquoise text-ink"
    >
      <div
        aria-hidden="true"
        className="watermark watermark-white -bottom-[0.2em] -left-3 text-[24vw] md:text-[14vw]"
        data-watermark="DŌSE"
      />

      <div className="relative mx-auto grid max-w-7xl gap-10 px-6 py-20 md:grid-cols-2 md:px-10 md:py-24">
        <div>
          <p className="eyebrow">Stay in the drop</p>
          <h2 className="mt-4 font-display text-6xl leading-[0.92] md:text-7xl">
            Get $10 off{" "}
            <span className="font-display-italic">your first dropper.</span>
          </h2>
        </div>
        <div className="flex w-full flex-col justify-end gap-4 md:items-end">
          <p className="text-sm font-medium">
            New drops, ritual recipes, and the occasional poem about going slow.
          </p>
          <NewsletterForm source="section" variant="turquoise" />
        </div>
      </div>
    </section>
  );
}
