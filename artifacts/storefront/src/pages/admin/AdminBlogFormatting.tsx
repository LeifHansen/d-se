import { AdminLayout } from "./AdminLayout";

type Example = {
  title: string;
  description: string;
  code: string;
};

const EXAMPLES: Example[] = [
  {
    title: "Headings & table of contents",
    description:
      "Use H2 (##) and H3 (###) headings to structure the post. They're collected automatically into the table of contents that appears next to the article.",
    code: `## Section heading
Some intro copy for the section.

### Subsection
More detail under the section.`,
  },
  {
    title: "Images with captions",
    description:
      "Standard markdown images render as a figure. The image's title (the text in quotes) shows up as the caption underneath; if no title is provided the alt text is used instead.",
    code: `![Steam rising from a matcha bowl](https://example.com/matcha.jpg "Stone-ground ceremonial matcha, whisked by hand.")`,
  },
  {
    title: "Blockquotes",
    description:
      "Prefix a line with > to call out a quote or highlight a key idea.",
    code: `> Slow brewing is the difference between drinking tea and tasting it.`,
  },
  {
    title: "Tables",
    description:
      "GitHub-flavoured markdown tables are supported. Use a header row, a divider row, and one row per record.",
    code: `| Tea       | Steep time | Temp   |
| --------- | ---------- | ------ |
| Sencha    | 1 min      | 70°C   |
| Hojicha   | 30 sec     | 95°C   |
| Matcha    | n/a        | 75°C   |`,
  },
  {
    title: "Task lists",
    description:
      "Render checklists with - [ ] and - [x] for incomplete and complete items.",
    code: `- [x] Warm the kyusu
- [ ] Measure 5g of leaf
- [ ] Steep for 60 seconds`,
  },
  {
    title: "Product callout shortcode",
    description:
      "Drop a product card inline by referencing its slug. Use the same slug shown on the product's storefront URL (/products/<slug>).",
    code: `<product-callout slug="ceremonial-matcha"></product-callout>`,
  },
];

export default function AdminBlogFormatting() {
  return (
    <AdminLayout title="Blog formatting">
      <div
        className="space-y-8 text-sm"
        data-testid="admin-blog-formatting"
      >
        <p className="max-w-2xl text-foreground/80">
          Blog posts are written in markdown. Alongside the basics (paragraphs,
          links, bold, italics, lists), the renderer supports a handful of
          magazine-style features. Copy any snippet below into a post's body to
          try it out.
        </p>

        <ul className="space-y-6">
          {EXAMPLES.map((example) => (
            <li
              key={example.title}
              className="rounded-lg border border-foreground/10 p-5"
              data-testid={`blog-formatting-example-${example.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/(^-|-$)/g, "")}`}
            >
              <h2 className="text-base font-semibold">{example.title}</h2>
              <p className="mt-2 text-foreground/70">{example.description}</p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-foreground/5 p-3 font-mono text-xs leading-relaxed text-foreground">
                <code>{example.code}</code>
              </pre>
            </li>
          ))}
        </ul>

        <div className="rounded-md border border-dashed border-foreground/20 p-4 text-foreground/70">
          <p className="font-semibold text-foreground">Tips</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Reserve <code className="font-mono">#</code> (H1) for the post
              title field — use <code className="font-mono">##</code> and{" "}
              <code className="font-mono">###</code> inside the body so the
              table of contents builds correctly.
            </li>
            <li>
              Product callouts pull live price and image data, so the slug must
              match an existing, published product.
            </li>
            <li>
              Always add alt text to images so screen readers (and the caption
              fallback) have something to read.
            </li>
          </ul>
        </div>
      </div>
    </AdminLayout>
  );
}
