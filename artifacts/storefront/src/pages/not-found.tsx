import { Button } from "@/components/ui/button";
import { Logo } from "@/components/dose/Logo";
import { Seo } from "@/components/seo/Seo";

export default function NotFound() {
  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center px-6 text-center"
      style={{ background: "hsl(170 58% 14%)", color: "hsl(45 49% 90%)" }}
      data-testid="not-found"
    >
      <Seo title="Page not found" description="The page you're looking for couldn't be found." noindex />
      <Logo variant="stacked" tone="cream" />
      <p
        className="mt-10 text-[11px] font-medium uppercase tracking-[0.22em]"
        style={{ color: "hsl(42 53% 64%)" }}
      >
        Error 404
      </p>
      <h1 className="mt-3 max-w-xl font-display text-5xl leading-tight md:text-6xl">
        This drop seems to have <span className="font-display-italic">evaporated.</span>
      </h1>
      <p
        className="mt-5 max-w-md text-base"
        style={{ color: "hsla(45,49%,90%,0.75)" }}
      >
        The page you're looking for couldn't be found. Let's get you back to something
        that hits.
      </p>
      <Button
        asChild
        size="lg"
        className="mt-10 rounded-full px-8 py-6 text-[12px] font-semibold uppercase tracking-[0.22em]"
        style={{
          background: "hsl(42 53% 54%)",
          color: "hsl(170 58% 14%)",
          borderColor: "hsl(42 53% 46%)",
        }}
        data-testid="not-found-cta"
      >
        <a href="/">Take me home</a>
      </Button>
    </div>
  );
}
