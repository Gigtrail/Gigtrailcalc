// ============================================================================
// @workspace/entitlements — single source of truth for access control.
//
// One module. Used by BOTH backend (api-server middleware/routes) AND frontend
// (React hooks/components). All role checks, plan derivation, feature flags,
// and numeric limits live here. Never duplicate in app code.
//
// ALPHA ACCESS MODEL
//   role is the single source of truth. plan is a derived label.
//     free   → base limits (5 calcs/week, 1 profile, 1 vehicle, 5 saved shows)
//     pro    → paid Stripe subscription, full feature unlock
//     tester → approved tester, same unlocks as Pro, no payment
//     admin  → full access plus admin tools (granted only by code/email)
// ============================================================================

// ─── Core types ──────────────────────────────────────────────────────────────

export type UserRole = "free" | "pro" | "tester" | "admin";
/** Canonical plan label. Always derived from UserRole — never stored independently. */
export type Plan = "free" | "pro";
export type AccessSource = "default" | "stripe" | "promo" | "admin";

export const VALID_ROLES: readonly UserRole[] = ["free", "pro", "tester", "admin"] as const;
export const VALID_ACCESS_SOURCES: readonly AccessSource[] = ["default", "stripe", "promo", "admin"] as const;

// ─── Permanent admin email ───────────────────────────────────────────────────

export const PERMANENT_ADMIN_EMAIL = "thegigtrail@gmail.com";

/** Trim + lowercase an email for safe comparison. Returns "" for null/undefined. */
export function normalizeEmail(email?: string | null): string {
  if (!email) return "";
  return email.trim().toLowerCase();
}

/** Case-insensitive, whitespace-trimmed permanent admin check. */
export function isPermanentAdminEmail(email?: string | null): boolean {
  const e = normalizeEmail(email);
  return e !== "" && e === normalizeEmail(PERMANENT_ADMIN_EMAIL);
}

/**
 * Single source of truth for "is this user an admin?"
 * True if the DB role is "admin" OR the email is the permanent admin.
 * Use this everywhere instead of mixing `role === "admin"` and email checks.
 */
export function resolveIsAdmin(user: { role?: string | null; email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "admin") return true;
  return isPermanentAdminEmail(user.email);
}

// ─── Role normalisation & plan derivation ────────────────────────────────────

/** Coerce any string into the canonical 4-tier role set. Unknown → "free". */
export function normalizeRole(raw: string | null | undefined): UserRole {
  if (!raw) return "free";
  if (raw === "free" || raw === "pro" || raw === "tester" || raw === "admin") return raw;
  return "free";
}

/** Derive plan label from role. role is authoritative; plan is always derived. */
export function derivePlanFromRole(role: string): Plan {
  return hasProAccess(role) ? "pro" : "free";
}

// ─── Role predicates ─────────────────────────────────────────────────────────

export function isFreeRole(role: string): boolean {
  return role === "free";
}
export function isProRole(role: string): boolean {
  return role === "pro";
}
export function isTesterRole(role: string): boolean {
  return role === "tester";
}
export function isAdminRole(role: string): boolean {
  return role === "admin";
}

/** True for any role with Pro-level feature access (pro, tester, admin). */
export function hasProAccess(role: string): boolean {
  return role === "pro" || role === "tester" || role === "admin";
}

// ─── Calc limit (free tier) ──────────────────────────────────────────────────

export const FREE_CALC_LIMIT_PER_WEEK = 5;

// ─── Entitlements: ONE shape, used by backend AND frontend ──────────────────

export interface Entitlements {
  // Hard numeric limits. Use Infinity for "no limit" on the backend.
  // The frontend safely coerces Infinity → null over JSON via `serializeEntitlements`.
  maxProfiles: number;
  maxVehicles: number;
  maxSavedRuns: number;
  maxTours: number;
  maxBandMembers: number;
  maxCalculationsPerWeek: number;

  // Capability flags — what this role is allowed to do.
  canAccessAdmin: boolean;
  canUseProFeatures: boolean;
  canBypassLimits: boolean;
  canUseTourBuilder: boolean;
  canUseTicketedShows: boolean;
  canUseMarketingCost: boolean;
  canUseRouting: boolean;
  canUseAdvancedDriving: boolean;
  canUseSharedAccommodation: boolean;
  canUseVenueIntelligence: boolean;
  canUseMultiVehicleGarage: boolean;
}

const FREE: Entitlements = {
  maxProfiles: 1,
  maxVehicles: 1,
  maxSavedRuns: 5,
  maxTours: 0,
  maxBandMembers: 3,
  maxCalculationsPerWeek: FREE_CALC_LIMIT_PER_WEEK,
  canAccessAdmin: false,
  canUseProFeatures: false,
  canBypassLimits: false,
  canUseTourBuilder: false,
  canUseTicketedShows: false,
  canUseMarketingCost: false,
  canUseRouting: false,
  canUseAdvancedDriving: false,
  canUseSharedAccommodation: false,
  canUseVenueIntelligence: false,
  canUseMultiVehicleGarage: false,
};

const PRO: Entitlements = {
  maxProfiles: 10,
  maxVehicles: Infinity,
  maxSavedRuns: Infinity,
  maxTours: Infinity,
  maxBandMembers: 12,
  maxCalculationsPerWeek: Infinity,
  canAccessAdmin: false,
  canUseProFeatures: true,
  canBypassLimits: false,
  canUseTourBuilder: true,
  canUseTicketedShows: true,
  canUseMarketingCost: true,
  canUseRouting: true,
  canUseAdvancedDriving: true,
  canUseSharedAccommodation: true,
  canUseVenueIntelligence: true,
  canUseMultiVehicleGarage: true,
};

const TESTER: Entitlements = {
  ...PRO,
  canBypassLimits: true,
};

const ADMIN: Entitlements = {
  ...PRO,
  canAccessAdmin: true,
  canBypassLimits: true,
};

/**
 * Single function the entire app should use to ask "what can this user do?".
 * Pass a UserRole ("free" | "pro" | "tester" | "admin").
 * Legacy "paid" value is still handled silently during the DB migration window
 * but should not appear in new code — use roles only.
 */
export function getEntitlements(roleOrPlan: string | null | undefined): Entitlements {
  if (roleOrPlan === "admin") return ADMIN;
  if (roleOrPlan === "tester") return TESTER;
  if (roleOrPlan === "pro" || roleOrPlan === "paid" /* legacy — remove after migration */) return PRO;
  return FREE;
}

// ─── JSON-safe wire shape (Infinity is not valid JSON) ───────────────────────

export interface EntitlementsWire extends Omit<
  Entitlements,
  "maxProfiles" | "maxVehicles" | "maxSavedRuns" | "maxTours" | "maxCalculationsPerWeek"
> {
  maxProfiles: number | null;
  maxVehicles: number | null;
  maxSavedRuns: number | null;
  maxTours: number | null;
  maxCalculationsPerWeek: number | null;
}

function toWire(n: number): number | null {
  return Number.isFinite(n) ? n : null;
}

export function serializeEntitlements(e: Entitlements): EntitlementsWire {
  return {
    ...e,
    maxProfiles: toWire(e.maxProfiles),
    maxVehicles: toWire(e.maxVehicles),
    maxSavedRuns: toWire(e.maxSavedRuns),
    maxTours: toWire(e.maxTours),
    maxCalculationsPerWeek: toWire(e.maxCalculationsPerWeek),
  };
}

function fromWire(n: number | null): number {
  return n === null ? Infinity : n;
}

export function deserializeEntitlements(w: EntitlementsWire): Entitlements {
  return {
    ...w,
    maxProfiles: fromWire(w.maxProfiles),
    maxVehicles: fromWire(w.maxVehicles),
    maxSavedRuns: fromWire(w.maxSavedRuns),
    maxTours: fromWire(w.maxTours),
    maxCalculationsPerWeek: fromWire(w.maxCalculationsPerWeek),
  };
}

// ─── Convenience helpers (pure derivations from getEntitlements) ─────────────

export function maxBandMembersForRole(roleOrPlan: string): number {
  return getEntitlements(roleOrPlan).maxBandMembers;
}
export function canAddBandMember(roleOrPlan: string, currentCount: number): boolean {
  return currentCount < maxBandMembersForRole(roleOrPlan);
}
export function canUseAdvancedDriving(roleOrPlan: string): boolean {
  return getEntitlements(roleOrPlan).canUseAdvancedDriving;
}
export function canUseSharedAccommodation(roleOrPlan: string): boolean {
  return getEntitlements(roleOrPlan).canUseSharedAccommodation;
}

// ─── Backward-compat: PlanLimits (the older shape /api/me used to return) ───
// Kept so existing callers keep type-checking. New code should read Entitlements.

export interface PlanLimits {
  maxProfiles: number;
  maxVehicles: number;
  maxRuns: number;
  toursEnabled: boolean;
  ticketedShowEnabled: boolean;
  marketingCostEnabled: boolean;
  routingEnabled: boolean;
}

export function getPlanLimits(role: string): PlanLimits {
  const e = getEntitlements(role);
  return {
    maxProfiles: e.maxProfiles,
    maxVehicles: e.maxVehicles,
    maxRuns: e.maxSavedRuns,
    toursEnabled: e.canUseTourBuilder,
    ticketedShowEnabled: e.canUseTicketedShows,
    marketingCostEnabled: e.canUseMarketingCost,
    routingEnabled: e.canUseRouting,
  };
}

/**
 * @deprecated Use hasProAccess(role) instead.
 * Legacy "paid" plan value is handled here but should not appear in new code.
 */
export function isPaidPlan(plan: string): boolean {
  return plan === "paid" || plan === "pro" || hasProAccess(plan);
}

/** @deprecated Use maxBandMembersForRole(role) instead. */
export function maxBandMembersForPlan(plan: string): number {
  return maxBandMembersForRole(plan);
}

// ─── Feature registry (UI copy for billing/upgrade CTAs) ─────────────────────

export type PlanFeature =
  | "more_calculations"
  | "more_saved_shows"
  | "more_profiles"
  | "more_vehicles"
  | "larger_band"
  | "tour_builder"
  | "advanced_driving"
  | "shared_accommodation"
  | "venue_intelligence";

export interface FeatureInfo {
  name: string;
  freeLimit: string;
  proUnlock: string;
  proDescription: string;
}

export const FEATURE_REGISTRY: Record<PlanFeature, FeatureInfo> = {
  more_calculations: {
    name: "Calculations",
    freeLimit: "5 per week",
    proUnlock: "Unlimited calculations",
    proDescription:
      "Run as many show calculations as you need, any time. No weekly resets.",
  },
  more_saved_shows: {
    name: "Saved Shows",
    freeLimit: "5 shows",
    proUnlock: "Unlimited saved history",
    proDescription:
      "Keep a permanent record of every show and compare profitability over time.",
  },
  more_profiles: {
    name: "Act Profiles",
    freeLimit: "1 profile",
    proUnlock: "Up to 10 act profiles",
    proDescription:
      "Manage different acts, side projects, or client bands with separate settings.",
  },
  more_vehicles: {
    name: "Garage",
    freeLimit: "Standard vehicle only",
    proUnlock: "Full multi-vehicle garage",
    proDescription:
      "Add your own van, car, or trailer with real fuel consumption. Assign vehicles to different acts.",
  },
  larger_band: {
    name: "Band Size",
    freeLimit: "Up to 3 members",
    proUnlock: "Larger bands supported",
    proDescription:
      "Track individual member fees and payouts for bands of any size.",
  },
  tour_builder: {
    name: "Tour Builder",
    freeLimit: "Not included",
    proUnlock: "Full tour trail builder",
    proDescription:
      "Plan multi-stop tours, see total fuel and accommodation across every show, and track your whole run.",
  },
  advanced_driving: {
    name: "Drive-day limits",
    freeLimit: "Not included",
    proUnlock: "Max drive-hours routing",
    proDescription:
      "Set a maximum drive time per day and let the calculator flag routes that push too far.",
  },
  shared_accommodation: {
    name: "Accommodation automation",
    freeLimit: "Manual only",
    proUnlock: "Auto-calculated rooms",
    proDescription:
      "Set room configurations once on your profile and have accommodation costs calculated automatically every show.",
  },
  venue_intelligence: {
    name: "Venue Intelligence",
    freeLimit: "Not included",
    proUnlock: "Venue History",
    proDescription:
      "Unlock past shows, deal history, and smart suggestions for this venue. See what you earned last time and auto-fill your deal details.",
  },
};

export function getFeatureInfo(feature: PlanFeature): FeatureInfo {
  return FEATURE_REGISTRY[feature];
}
