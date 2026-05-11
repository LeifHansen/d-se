import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";
import App from "./App";
import "./index.css";
import {
  initSentry,
  installFetchRequestIdBreadcrumbs,
  Sentry,
  isSentryEnabled,
} from "./lib/sentry";
import { RootErrorBoundary } from "./components/RootErrorBoundary";

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

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <HelmetProvider>
      <App />
    </HelmetProvider>
  </RootErrorBoundary>,
);
