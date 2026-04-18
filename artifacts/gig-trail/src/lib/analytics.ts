/**
 * ─── Gig Trail Analytics (PostHog) ─────────────────────────────────────────
 *
 * Single entry point for all analytics.  Every call is wrapped in try/catch
 * so analytics can never crash the app.
 *
 * FILES USED
 *   - src/lib/analytics.ts          ← this file (init / identify / track)
 *   - src/App.tsx                   ← initAnalytics on mount, identifyUser on
 *                                      sign-in, resetAnalytics on sign-out,
 *                                      login_completed per browser session
 *
 * EVENTS CURRENTLY WIRED
 *   AUTH
 *     login_completed               App.tsx  (AnalyticsIdentifier)
 *     signup_completed              onboarding.tsx
 *
 *   CALCULATOR – single show
 *     show_calc_started             run-form.tsx
 *     show_calc_completed           run-form.tsx
 *     calc_error                    run-form.tsx
 *     save_failed                   run-form.tsx
 *
 *   CALCULATOR – tour
 *     tour_calc_started             tour-detail.tsx
 *     tour_calc_completed           tour-detail.tsx
 *     tour_saved                    tour-form.tsx
 *
 *   FEATURES
 *     vehicle_added                 vehicle-form.tsx
 *     member_added                  profile-form.tsx
 *
 *   PAYWALL / MONETISATION
 *     pro_feature_clicked           upgrade-cta.tsx
 *     pricing_viewed                billing.tsx
 *     upgrade_started               billing.tsx
 *     upgrade_completed             billing.tsx
 *
 * ENV VARS REQUIRED
 *   VITE_POSTHOG_KEY
 *   VITE_POSTHOG_HOST  (optional, defaults to https://us.i.posthog.com)
 */

import posthog from "posthog-js";

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const host =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ||
  "https://us.i.posthog.com";

let initialised = false;

export function initAnalytics() {
  if (typeof window === "undefined" || !key || initialised) return;
  posthog.init(key, {
    api_host: host,
    capture_pageview: true,
    autocapture: false,
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
