// Helper for sending the user to an external URL that cannot run inside
// an iframe (Stripe Checkout, Stripe Customer Portal, etc.).
//
// Behaviour:
//  - When the app is the top-level browsing context, navigate the current
//    tab via window.location.assign — same as a normal link.
//  - When the app is embedded in an iframe (e.g. the Replit workspace
//    preview pane), do NOT attempt to navigate the iframe (Stripe blocks
//    Checkout from loading inside one). Open a new top-level tab via
//    window.open, which is the only reliably available way out of an
//    embed without relying on top-frame navigation permissions.
//  - If the popup/new tab is blocked by the browser, signal the caller
//    so it can render a persistent action button the user can click.

export type ExternalRedirectResult =
  | { mode: "top"; url: string }
  | { mode: "newtab"; url: string; window: Window }
  | { mode: "blocked"; url: string };

export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    // Accessing window.top can throw in cross-origin sandboxed frames;
    // if it does, we are definitely embedded.
    return true;
  }
}

export function openExternal(url: string): ExternalRedirectResult {
  if (typeof window === "undefined") {
    return { mode: "blocked", url };
  }
  if (!isEmbedded()) {
    window.location.assign(url);
    return { mode: "top", url };
  }
  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) {
    return { mode: "newtab", url, window: popup };
  }
  return { mode: "blocked", url };
}
