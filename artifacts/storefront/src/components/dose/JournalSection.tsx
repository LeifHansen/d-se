import { ArrowUpRight } from "lucide-react";
import { Image } from "./Image";
import wellnessImg from "@/assets/brand/final/lifestyle-toast.jpg?picture";
import goldImg from "@/assets/brand/final/emblem-gold.jpg?picture";
import bottleImg from "@/assets/brand/final/logo-teal.jpg?picture";

const posts = [
  {
    eyebrow: "The Science",
    title: "Why a water-soluble emulsion beats oil",
    excerpt:
      "How emulsified cannabinoids absorb faster, dose more evenly, and mix without a film.",
    img: wellnessImg,
    href: "#post-1",
  },
  {
    eyebrow: "Traceability",
    title: "What a DŌSE batch ID actually tells you",
    excerpt:
      "Scan it and you'll see the farm, the harvest, the lab panel, and the fill date.",
    img: goldImg,
    href: "#post-2",
  },
  {
    eyebrow: "Inside DŌSE",
    title: "How we vet a hemp farm before we buy",
    excerpt:
      "Soil, water, cultivation practices, and full-panel testing — before a single plant is harvested.",
    img: bottleImg,
    href: "#post-3",
  },
];

export function JournalSection() {
  return (
    <section
      id="journal"
      data-testid="journal-section"
      style={{ background: "hsl(166 95% 19%)", color: "hsl(45 49% 90%)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-28">
        <div className="flex flex-col items-end justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="eyebrow" style={{ color: "hsla(45,49%,90%,0.65)" }}>
              The Journal
            </p>
            <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
              Notes from
              <br />
              <span className="font-display-italic" style={{ color: "hsl(95 30% 78%)" }}>
                the dropper.
              </span>
            </h2>
          </div>
          <a
            href="#all-posts"
            className="inline-flex items-center gap-2 text-sm tracking-wide hover:opacity-80"
            data-testid="link-all-posts"
          >
            Read the journal <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {posts.map((p, i) => (
            <a
              key={p.title}
              href={p.href}
              className="group block overflow-hidden rounded-3xl border"
              style={{
                background: "hsl(165 58% 25%)",
                borderColor: "hsla(45,49%,90%,0.10)",
              }}
              data-testid={`journal-post-${i + 1}`}
            >
              <div className="aspect-[5/4] w-full overflow-hidden">
                <Image
                  picture={p.img}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  pictureClassName="block h-full w-full"
                  sizes="(min-width: 768px) 30vw, 90vw"
                />
              </div>
              <div className="p-6">
                <p
                  className="text-[10px] font-medium uppercase tracking-[0.22em]"
                  style={{ color: "hsla(45,49%,90%,0.88)" }}
                >
                  {p.eyebrow}
                </p>
                <h3 className="mt-2 font-display text-2xl leading-snug">{p.title}</h3>
                <p
                  className="mt-2 text-sm leading-relaxed"
                  style={{ color: "hsla(45,49%,90%,0.92)" }}
                >
                  {p.excerpt}
                </p>
                <span
                  className="mt-4 inline-flex items-center gap-1 text-xs font-medium uppercase tracking-[0.22em]"
                  style={{ color: "hsl(42 53% 64%)" }}
                >
                  Read more <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
