import { Logo } from "@/components/dose/Logo";
import { Seo } from "@/components/seo/Seo";

export default function NotFound() {
  return (
    <div
      className="grain grain-dark relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-ink px-6 text-center text-white"
      data-testid="not-found"
    >
      <Seo title="Page not found" description="The page you're looking for couldn't be found." noindex />
      <div
        aria-hidden="true"
        className="watermark watermark-white -bottom-[0.18em] -right-4 text-[34vw] md:text-[22vw]"
        data-watermark="404"
      />
      <Logo variant="stacked" tone="white" />
      <p className="eyebrow mt-10 text-turquoise-bright">Error 404</p>
      <h1 className="mt-4 max-w-xl font-display text-6xl leading-[0.92] md:text-7xl">
        This drop seems to have{" "}
        <span className="font-display-italic text-pink-soft">evaporated.</span>
      </h1>
      <p className="mt-5 max-w-md text-base text-white/75">
        The page you're looking for couldn't be found. Let's get you back to
        something that hits.
      </p>
      <a href="/" className="cta cta-pink mt-10" data-testid="not-found-cta">
        Take me home
      </a>
    </div>
  );
}
