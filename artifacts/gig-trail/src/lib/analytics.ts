import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || "https://us.i.posthog.com";

let initialised = false;

export function initAnalytics() {
  if (typeof window === "undefined" || !key || initialised) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    autocapture: true,
  });
  initialised = true;
}

export function identifyUser(
  userId: string,
  properties: { role?: string; access_source?: string; email?: string } = {}
) {
  try {
    posthog.identify(userId, properties);
  } catch {
    // fail silently
  }
}

export function resetAnalytics() {
  try {
    posthog.reset();
  } catch {
    // fail silently
  }
}

export function trackEvent(
  eventName: string,
  properties: Record<string, unknown> = {}
) {
  try {
    if (import.meta.env.DEV) {
      console.log("[Analytics]", eventName, properties);
    }
    posthog.capture(eventName, properties);
  } catch {
    // fail silently
  }
}
