/**
 * Consent-aware analytics module.
 *
 * Loads GA4 (gtag) and Meta Pixel (fbq) only after the user accepts cookies
 * via the CookieBanner. Provides a typed `track(event, payload)` API used
 * by ecommerce instrumentation across the storefront.
 *
 * IDs are read from Vite env vars; missing IDs are a no-op (never an error).
 *   VITE_GA4_ID         — e.g. "G-XXXXXXXXXX"
 *   VITE_META_PIXEL_ID  — e.g. "1234567890"
 */

const GA_ID = import.meta.env.VITE_GA4_ID as string | undefined;
const PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

const CONSENT_KEY = "dose-cookies-decision";
const ACK_KEY = "dose-cookies-ack";
export const CONSENT_EVENT = "dose:consent-changed";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    fbq?: ((...args: unknown[]) => void) & { queue?: unknown[] };
    _fbq?: unknown;
  }
}

export type Item = {
  item_id: string | number;
  item_name: string;
  price?: number;
  quantity?: number;
  item_category?: string;
};

export type EcomPayload = {
  currency?: string;
  value?: number;
  items?: Item[];
  // Free-form extras passed through to providers
  [k: string]: unknown;
};

export type TrackEvent =
  | "view_item_list"
  | "view_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "add_payment_info"
  | "purchase"
  | "newsletter_signup";

let loaded = false;
const queued: Array<[TrackEvent, EcomPayload | undefined]> = [];

function hasConsent(): boolean {
  try {
    return (
      window.localStorage.getItem(ACK_KEY) === "yes" &&
      window.localStorage.getItem(CONSENT_KEY) === "accept"
    );
  } catch {
    return false;
  }
}

function injectGa4(): void {
  if (!GA_ID || window.gtag) return;
  const s = document.createElement("script");
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  const gtag: (...args: unknown[]) => void = (...args) => {
    window.dataLayer!.push(args);
  };
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_ID, { send_page_view: true });
}

function injectMetaPixel(): void {
  if (!PIXEL_ID || window.fbq) return;
  // Standard Meta snippet, condensed.
  /* eslint-disable */
  (function (f: any, b: Document, e: string, v: string) {
    if (f.fbq) return;
    const n: any = (f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    });
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = "2.0";
    n.queue = [];
    const t = b.createElement(e) as HTMLScriptElement;
    t.async = true;
    t.src = v;
    const s = b.getElementsByTagName(e)[0];
    s.parentNode?.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */
  // The IIFE above assigns window.fbq, but TS narrowed it from the early
  // guard. Re-read via an untyped accessor.
  const fbqAfter = (window as { fbq?: (...args: unknown[]) => void }).fbq;
  if (fbqAfter) {
    fbqAfter("init", PIXEL_ID);
    fbqAfter("track", "PageView");
  }
}

/** Returns the GA4 client_id once available, or null. */
export function getGa4ClientId(): Promise<string | null> {
  return new Promise((resolve) => {
    if (!GA_ID || !window.gtag) {
      resolve(null);
      return;
    }
    try {
      window.gtag("get", GA_ID, "client_id", (cid: string) => {
        resolve(cid || null);
      });
      // Safety timeout
      setTimeout(() => resolve(null), 1500);
    } catch {
      resolve(null);
    }
  });
}

/** Read the Meta Pixel browser id (`_fbp`) cookie, set by the pixel script. */
export function getFbp(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)_fbp=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Read the Meta click id (`_fbc`) cookie. */
export function getFbc(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)_fbc=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const GA_EVENT_MAP: Partial<Record<TrackEvent, string>> = {
  newsletter_signup: "generate_lead",
};

const META_EVENT_MAP: Partial<Record<TrackEvent, string>> = {
  view_item_list: "ViewContent",
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  remove_from_cart: "RemoveFromCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  purchase: "Purchase",
  newsletter_signup: "Lead",
};

function emit(event: TrackEvent, payload?: EcomPayload): void {
  const ga4Event = GA_EVENT_MAP[event] ?? event;
  if (window.gtag) {
    try {
      window.gtag("event", ga4Event, payload ?? {});
    } catch {
      /* ignore */
    }
  }
  const metaEvent = META_EVENT_MAP[event];
  const fbq2 = window.fbq;
  if (fbq2 && metaEvent) {
    const meta: Record<string, unknown> = { ...(payload ?? {}) };
    if (payload?.items) {
      meta.contents = payload.items.map((i) => ({
        id: String(i.item_id),
        quantity: i.quantity ?? 1,
        item_price: i.price,
      }));
      meta.content_type = "product";
      delete meta.items;
    }
    const opts: Record<string, unknown> = {};
    const eventId = (payload as Record<string, unknown> | undefined)?.eventId;
    if (typeof eventId === "string") opts.eventID = eventId;
    try {
      fbq2("track", metaEvent, meta, opts);
    } catch {
      /* ignore */
    }
  }
  // Always push to dataLayer for downstream tag managers / debugging.
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...(payload ?? {}) });
}

function flushQueue(): void {
  while (queued.length) {
    const [ev, payload] = queued.shift()!;
    emit(ev, payload);
  }
}

export function loadAnalytics(): void {
  if (loaded) return;
  if (!hasConsent()) return;
  loaded = true;
  // Always initialize the dataLayer so events are still observable even when
  // no provider IDs are configured (no-op providers, full dataLayer history).
  window.dataLayer = window.dataLayer || [];
  injectGa4();
  injectMetaPixel();
  // Give the snippets a tick to define gtag/fbq before flushing.
  setTimeout(flushQueue, 50);
}

export function track(event: TrackEvent, payload?: EcomPayload): void {
  if (!loaded) {
    if (hasConsent()) {
      loadAnalytics();
    } else {
      // Drop events from declined visitors.
      return;
    }
  }
  if (loaded) emit(event, payload);
  else queued.push([event, payload]);
}

/** Generate a stable, dedupable event id (used for purchase). */
export function newEventId(prefix = "evt"): string {
  const r = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${r}`;
}

if (typeof window !== "undefined") {
  // Auto-load on first import if consent is already granted.
  if (hasConsent()) loadAnalytics();
  window.addEventListener(CONSENT_EVENT, () => loadAnalytics());
}

/**
 * Free-form `trackEvent` used by `web-vitals.ts` and other non-ecommerce
 * instrumentation. Routes through gtag and the dataLayer when available so
 * we can observe events even before consent is granted (no PII).
 */
export type AnalyticsEvent = {
  name: string;
  value?: number;
  rating?: string;
  id?: string;
  [key: string]: unknown;
};

export function trackEvent(event: AnalyticsEvent): void {
  try {
    if (typeof window === "undefined") return;
    if (typeof window.gtag === "function") {
      window.gtag("event", event.name, {
        value: event.value,
        metric_rating: event.rating,
        metric_id: event.id,
      });
    }
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: event.name, ...event });
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", event);
    }
  } catch {
    /* never throw from analytics */
  }
}
