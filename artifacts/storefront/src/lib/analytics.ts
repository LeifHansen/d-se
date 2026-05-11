type AnalyticsEvent = {
  name: string;
  value?: number;
  rating?: string;
  id?: string;
  [key: string]: unknown;
};

declare global {
  interface Window {
    __doseAnalytics?: {
      track: (event: AnalyticsEvent) => void;
    };
    gtag?: (...args: unknown[]) => void;
  }
}

export function trackEvent(event: AnalyticsEvent): void {
  try {
    if (typeof window === "undefined") return;
    if (window.__doseAnalytics?.track) {
      window.__doseAnalytics.track(event);
      return;
    }
    if (typeof window.gtag === "function") {
      window.gtag("event", event.name, {
        value: event.value,
        metric_rating: event.rating,
        metric_id: event.id,
      });
      return;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", event);
    }
  } catch {
    /* never throw from analytics */
  }
}
