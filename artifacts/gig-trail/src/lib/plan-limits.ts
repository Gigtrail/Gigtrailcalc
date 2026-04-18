// ─── Alpha access model ──────────────────────────────────────────────────────
// role is the single source of truth. Plan is a derived label.
//   free   = base limits (5 calcs/week, 1 profile, 1 vehicle, 5 saved shows)
//   pro    = paid Stripe subscription — all features unlocked
//   tester = approved tester — same unlocks as Pro, no payment
//   admin  = full access plus admin tools (granted only by code/email, never Stripe)

export type UserRole = "free" | "pro" | "tester" | "admin";

/** @deprecated Use UserRole. Kept as alias so existing imports compile. */
export type Plan = "free" | "paid";

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

// ─── Single source of truth: entitlements by role ────────────────────────────

export interface Entitlements {
  maxBandMembers: number;
  advancedDrivingLogic: boolean;
  sharedAccommodation: boolean;
}

const FREE_ENTITLEMENTS: Entitlements = {
  maxBandMembers: 3,
  advancedDrivingLogic: false,
  sharedAccommodation: false,
};

const PRO_ENTITLEMENTS: Entitlements = {
  maxBandMembers: 12,
  advancedDrivingLogic: true,
  sharedAccommodation: true,
};

/** Returns true when the role has Pro-level access (pro, tester, admin). */
export function hasProAccess(role: string): boolean {
  return role === "pro" || role === "tester" || role === "admin";
}

/** Get entitlements for a role. Pass UserRole; legacy "paid"/"free" Plan also accepted. */
export function getEntitlements(roleOrPlan: string): Entitlements {
  // Legacy plan compat: "paid" maps to Pro entitlements
  if (roleOrPlan === "paid" || hasProAccess(roleOrPlan)) return PRO_ENTITLEMENTS;
  return FREE_ENTITLEMENTS;
}

export function maxBandMembersForRole(roleOrPlan: string): number {
  return getEntitlements(roleOrPlan).maxBandMembers;
}

export function canAddBandMember(roleOrPlan: string, currentCount: number): boolean {
  return currentCount < maxBandMembersForRole(roleOrPlan);
}

export function canUseAdvancedDriving(roleOrPlan: string): boolean {
  return getEntitlements(roleOrPlan).advancedDrivingLogic;
}

export function canUseSharedAccommodation(roleOrPlan: string): boolean {
  return getEntitlements(roleOrPlan).sharedAccommodation;
}

// ─── Deprecated compat shims (kept so existing call-sites still type-check) ──

/** @deprecated Use hasProAccess(role) instead. */
export function isPaidPlan(plan: string): boolean {
  return plan === "paid" || hasProAccess(plan);
}

/** @deprecated Use maxBandMembersForRole(role) instead. */
export function maxBandMembersForPlan(plan: string): number {
  return maxBandMembersForRole(plan);
}
