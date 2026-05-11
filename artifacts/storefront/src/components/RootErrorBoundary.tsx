import { Component, type ReactNode } from "react";
import { Sentry, isSentryEnabled } from "@/lib/sentry";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    if (isSentryEnabled()) {
      Sentry.captureException(error, {
        contexts: { react: { componentStack: info.componentStack ?? "" } },
      });
    }
    // eslint-disable-next-line no-console
    console.error("Root error boundary caught", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
            background: "#0F3933",
            color: "#F1ECDC",
            fontFamily: "Inter, system-ui, sans-serif",
            textAlign: "center",
          }}
        >
          <h1 style={{ fontSize: "1.75rem", marginBottom: "0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ opacity: 0.8, maxWidth: 480 }}>
            We hit an unexpected error. Refresh the page to try again — our team
            has been notified.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: "1.5rem",
              padding: "0.75rem 1.5rem",
              borderRadius: "999px",
              background: "#C9A24C",
              color: "#0F3933",
              border: 0,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
