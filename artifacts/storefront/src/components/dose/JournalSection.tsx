import { ArrowUpRight } from "lucide-react";
import { Image } from "./Image";
import wellnessImg from "@/assets/brand/bottle-flatlay-spoon.png?picture";
import goldImg from "@/assets/brand/bottle-marble-glass.png?picture";
import bottleImg from "@/assets/brand/bottle-moody-interior.png?picture";

const posts = [
  {
    eyebrow: "Education",
    title: "How a 10 mg drop actually compares to a gummy",
    excerpt:
      "Why drops absorb cleaner, hit faster, and let you stack milligrams more honestly.",
    img: wellnessImg,
    href: "#post-1",
  },
  {
    eyebrow: "Ritual",
    title: "Five mocktails that pair with one DŌSE drop",
    excerpt:
      "From a smoky paloma to a yuzu spritz — recipes from our test kitchen.",
    img: goldImg,
    href: "#post-2",
  },
  {
    eyebrow: "Inside DŌSE",
    title: "Why we obsess over third-party lab tests",
    excerpt:
      "Every batch, every cannabinoid, every trace solvent — published, not promised.",
    img: bottleImg,
    href: "#post-3",
  },
];

export function JournalSection() {
  return (
    <section
      id="journal"
      data-testid="journal-section"
      style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
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
                background: "hsl(170 50% 18%)",
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
