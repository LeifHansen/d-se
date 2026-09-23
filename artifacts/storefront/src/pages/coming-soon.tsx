import { Helmet } from "react-helmet-async";
import { Emblem } from "@/components/dose/Logo";

const PREVIEW_STORAGE_KEY = "dose:preview";
const PREVIEW_QUERY_KEY = "preview";

// Palette literals (kept inline so this page renders even if the stylesheet
// fails to load): ink #111D1D, turquoise #1FB2A3, turquoise bright #3CDDCD.
const INK = "#111D1D";
const TURQUOISE = "#1FB2A3";
const TURQUOISE_BRIGHT = "#3CDDCD";

export function isComingSoonEnabled(): boolean {
  if (import.meta.env.VITE_COMING_SOON !== "1") return false;
  if (typeof window === "undefined") return true;

  const params = new URLSearchParams(window.location.search);
  if (params.get(PREVIEW_QUERY_KEY)) {
    try {
      window.localStorage.setItem(PREVIEW_STORAGE_KEY, "1");
    } catch {
      // localStorage may be blocked; bypass for this navigation only.
    }
    return false;
  }
  try {
    if (window.localStorage.getItem(PREVIEW_STORAGE_KEY) === "1") return false;
  } catch {
    // ignore
  }
  return true;
}

export function ComingSoon() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "2rem",
        padding: "3rem 1.5rem",
        background: INK,
        color: "#FFFFFF",
        textAlign: "center",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <Helmet>
        <title>DŌSE — Coming Soon</title>
        <meta name="robots" content="noindex,nofollow" />
        <meta
          name="description"
          content="DŌSE is coming soon. A precisely formulated THC beverage additive. Add a drop to any drink for a calm, controlled lift."
        />
        <meta property="og:title" content="DŌSE — Coming Soon" />
        <meta
          property="og:description"
          content="DŌSE is coming soon. A precisely formulated THC beverage additive."
        />
        <meta name="twitter:title" content="DŌSE — Coming Soon" />
      </Helmet>

      <div
        aria-hidden="true"
        style={{
          width: "min(180px, 40vw)",
          aspectRatio: "1 / 1",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: TURQUOISE,
          boxShadow: "0 24px 60px rgba(0,0,0,0.45)",
        }}
      >
        <Emblem className="h-auto w-[52%]" color={INK} strokeWidth={4} />
      </div>

      <div style={{ maxWidth: "32rem" }}>
        <h1
          style={{
            fontSize: "clamp(3rem, 9vw, 5rem)",
            margin: 0,
            letterSpacing: "0.14em",
            fontWeight: 400,
            lineHeight: 1,
            fontFamily: '"Bebas Neue", Impact, "Arial Narrow", sans-serif',
          }}
        >
          DŌSE
        </h1>
        <p
          style={{
            marginTop: "0.75rem",
            fontSize: "0.8rem",
            fontWeight: 600,
            letterSpacing: "0.26em",
            textTransform: "uppercase",
            color: TURQUOISE_BRIGHT,
          }}
        >
          Coming Soon
        </p>
        <p
          style={{
            marginTop: "2rem",
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            lineHeight: 1.6,
            opacity: 0.85,
          }}
        >
          A precisely formulated THC beverage additive. Add a drop to any drink
          for a calm, controlled lift.
        </p>
      </div>
    </main>
  );
}

export default ComingSoon;
