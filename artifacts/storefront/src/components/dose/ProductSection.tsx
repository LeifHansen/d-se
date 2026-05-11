import { useEffect } from "react";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Image } from "./Image";
import { track } from "@/lib/analytics";
import productBoxes from "@/assets/brand/bottle-clean.jpg?picture";
import singleBox from "@/assets/brand/Untitled-5.jpg?picture";
import bottleClose from "@/assets/brand/Untitled-11_copy.jpg?picture";

const products = [
  {
    name: "Original Dropper",
    tagline: "10 mg • 30 doses",
    price: "$48",
    img: singleBox,
    features: ["Hemp-derived THC", "Lemongrass + bergamot", "Zero added sugar"],
    badge: "Bestseller",
  },
  {
    name: "Wellness Elixir",
    tagline: "5 mg + CBD • 30 doses",
    price: "$54",
    img: productBoxes,
    features: ["1:1 THC:CBD blend", "Adaptogens (ashwagandha)", "Calm without couch-lock"],
    badge: "New",
  },
  {
    name: "Nightcap",
    tagline: "10 mg + CBN • 30 doses",
    price: "$56",
    img: bottleClose,
    features: ["THC + CBN sleep blend", "Chamomile + valerian", "Drift, don't crash"],
    badge: "Limited",
  },
];

function priceToNumber(price: string): number {
  const n = parseFloat(price.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function ProductSection() {
  useEffect(() => {
    track("view_item_list", {
      item_list_name: "The Drop",
      currency: "USD",
      items: products.map((p, i) => ({
        item_id: p.name.toLowerCase().replace(/\s+/g, "-"),
        item_name: p.name,
        price: priceToNumber(p.price),
        index: i,
      })),
    });
  }, []);

  return (
    <section
      id="shop"
      data-testid="product-section"
      className="relative"
      style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
    >
      <div className="mx-auto max-w-7xl px-6 py-24 md:px-10 md:py-32">
        <div className="flex flex-col items-end justify-between gap-6 md:flex-row md:items-end">
          <div className="max-w-xl">
            <p className="eyebrow" style={{ color: "hsla(45,49%,90%,0.65)" }}>
              The Drop
            </p>
            <h2 className="mt-3 font-display text-5xl leading-tight md:text-6xl">
              Three drops.
              <br />
              <span className="font-display-italic" style={{ color: "hsl(42 53% 64%)" }}>
                One ritual.
              </span>
            </h2>
          </div>
          <a
            href="#all-products"
            className="inline-flex items-center gap-2 text-sm tracking-wide hover:opacity-80"
            data-testid="link-all-products"
          >
            View all products <ArrowRight className="h-4 w-4" />
          </a>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-3">
          {products.map((p) => (
            <article
              key={p.name}
              className="group flex flex-col overflow-hidden rounded-3xl border"
              style={{
                background: "hsl(170 50% 18%)",
                borderColor: "hsla(45,49%,90%,0.10)",
              }}
              data-testid={`product-card-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
            >
              <div className="relative aspect-[4/5] w-full overflow-hidden">
                <Image
                  picture={p.img}
                  alt={`${p.name} packaging`}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  pictureClassName="block h-full w-full"
                  sizes="(min-width: 768px) 30vw, 90vw"
                />
                <span
                  className="absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
                  style={{
                    background: "hsl(45 49% 90%)",
                    color: "hsl(170 58% 14%)",
                  }}
                >
                  {p.badge}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-4 p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <h3 className="font-display text-2xl">{p.name}</h3>
                    <p
                      className="text-xs uppercase tracking-[0.22em]"
                      style={{ color: "hsla(45,49%,90%,0.88)" }}
                    >
                      {p.tagline}
                    </p>
                  </div>
                  <p className="font-display text-2xl" style={{ color: "hsl(42 53% 64%)" }}>
                    {p.price}
                  </p>
                </div>
                <ul className="space-y-2">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: "hsla(45,49%,90%,0.85)" }}>
                      <Check className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: "hsl(95 14% 67%)" }} />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-2">
                  <Button
                    className="w-full rounded-full py-5 text-[11px] font-semibold uppercase tracking-[0.22em]"
                    style={{
                      background: "hsl(42 53% 54%)",
                      color: "hsl(170 58% 14%)",
                      borderColor: "hsl(42 53% 46%)",
                    }}
                    data-testid={`button-add-to-cart-${p.name.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => {
                      const value = priceToNumber(p.price);
                      const item = {
                        item_id: p.name.toLowerCase().replace(/\s+/g, "-"),
                        item_name: p.name,
                        price: value,
                        quantity: 1,
                      };
                      track("view_item", {
                        currency: "USD",
                        value,
                        items: [item],
                      });
                      track("add_to_cart", {
                        currency: "USD",
                        value,
                        items: [item],
                      });
                      // Single-product launch landing: clicking the CTA is
                      // also the begin_checkout signal — there is no separate
                      // cart drawer in this artifact.
                      track("begin_checkout", {
                        currency: "USD",
                        value,
                        items: [item],
                      });
                    }}
                  >
                    Add to Cart
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
