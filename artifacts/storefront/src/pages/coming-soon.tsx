import { Helmet } from "react-helmet-async";
import emblem from "@/assets/brand/final/emblem-gold.jpg";

const PREVIEW_STORAGE_KEY = "dose:preview";
const PREVIEW_QUERY_KEY = "preview";

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
        background: "#00382b",
        color: "#f1ead8",
        textAlign: "center",
        fontFamily:
          '"Cormorant Garamond", Georgia, "Times New Roman", serif',
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

      <img
        src={emblem}
        alt="DŌSE"
        width={180}
        height={180}
        style={{
          width: "min(180px, 40vw)",
          height: "auto",
          borderRadius: "50%",
          objectFit: "cover",
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
      />

      <div style={{ maxWidth: "32rem" }}>
        <h1
          style={{
            fontSize: "clamp(2.25rem, 6vw, 3.5rem)",
            margin: 0,
            letterSpacing: "0.08em",
            fontWeight: 500,
          }}
        >
          DŌSE
        </h1>
        <p
          style={{
            marginTop: "0.5rem",
            fontSize: "1.125rem",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontFamily: '"Inter", system-ui, sans-serif',
            opacity: 0.7,
          }}
        >
          Coming Soon
        </p>
        <p
          style={{
            marginTop: "2rem",
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            lineHeight: 1.6,
            fontFamily: '"Inter", system-ui, sans-serif',
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
