import { type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import { ClerkProvider } from "@clerk/clerk-react";
import App from "./App";
import { doseClerkAppearance } from "./lib/clerk-appearance";
import "./index.css";
import {
  initSentry,
  installFetchRequestIdBreadcrumbs,
  Sentry,
  isSentryEnabled,
} from "./lib/sentry";
import { RootErrorBoundary } from "./components/RootErrorBoundary";
import { startWebVitals } from "./lib/web-vitals";
import heroBottleSrc from "@/assets/brand/final/dose-bottle-hero.jpg";

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
  const link = document.createElement("link");
  link.rel = "preload";
  link.as = "image";
  link.fetchPriority = "high";
  link.type = "image/jpeg";
  link.href = heroBottleSrc;
  document.head.appendChild(link);
}

preloadHero();

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;

function MaybeClerkProvider({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey) return <>{children}</>;
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      appearance={doseClerkAppearance}
    >
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
