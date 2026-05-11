import { onCLS, onINP, onLCP, onTTFB, onFCP, type Metric } from "web-vitals";
import { trackEvent } from "./analytics";

function report(metric: Metric) {
  trackEvent({
    name: `web_vital_${metric.name.toLowerCase()}`,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    rating: metric.rating,
    id: metric.id,
    delta: metric.delta,
    navigationType: metric.navigationType,
  });
}

let started = false;

export function startWebVitals() {
  if (started || typeof window === "undefined") return;
  started = true;
  onCLS(report);
  onINP(report);
  onLCP(report);
  onTTFB(report);
  onFCP(report);
}
