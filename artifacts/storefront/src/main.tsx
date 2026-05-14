import { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import "./index.css";
import {
  initSentry,
  installFetchRequestIdBreadcrumbs,
  Sentry,
  isSentryEnabled,
} from "./lib/sentry";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import { startWebVitals } from "./lib/web-vitals";
import heroPicture from "@/assets/brand/Untitled-10.jpg?picture";

initSentry();
installFetchRequestIdBreadcrumbs();

if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    if (isSentryEnabled()) {
      Sentry.captureException(event.reason ?? new Error("Unhandled rejection"));
    }
    // eslint-disable-next-line no-console
    console.error("Unhandled promise rejection", event.reason);
  });
  window.addEventListener("error", (event) => {
    if (isSentryEnabled()) {
      Sentry.captureException(event.error ?? new Error(event.message));
    }
  });
}

function preloadHero() {
  if (typeof document === "undefined") return;
  const sizes = "(min-width: 1024px) 420px, (min-width: 768px) 38vw, 90vw";
  const candidates: Array<{ type: string; srcset: string }> = [];
  for (const fmt of ["avif", "webp"] as const) {
    const srcset = heroPicture.sources[fmt];
    if (srcset) candidates.push({ type: `image/${fmt}`, srcset });
  }
  const jpegSrcset = heroPicture.sources["jpeg"] ?? heroPicture.sources["jpg"];
  if (jpegSrcset) candidates.push({ type: "image/jpeg", srcset: jpegSrcset });

  if (candidates.length === 0) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.fetchPriority = "high";
    link.href = heroPicture.img.src;
    document.head.appendChild(link);
    return;
  }

  for (const c of candidates) {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.fetchPriority = "high";
    link.type = c.type;
    link.href = heroPicture.img.src;
    link.setAttribute("imagesrcset", c.srcset);
    link.setAttribute("imagesizes", sizes);
    document.head.appendChild(link);
  }
}

preloadHero();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

function MaybeClerkProvider({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey) return <>{children}</>;
  return (
    <ClerkProvider publishableKey={clerkPublishableKey}>
      {children}
    </ClerkProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <HelmetProvider>
      <MaybeClerkProvider>
        <App />
      </MaybeClerkProvider>
    </HelmetProvider>
  </RootErrorBoundary>,
);

if (typeof window !== "undefined") {
  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (cb: () => void) => void })
      .requestIdleCallback(startWebVitals);
  } else {
    setTimeout(startWebVitals, 0);
  }
}
