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
  paidUnlock: string;
  paidDescription: string;
}

export const FEATURE_REGISTRY: Record<PlanFeature, FeatureInfo> = {
  more_calculations: {
    name: "Calculations",
    freeLimit: "5 per week",
    paidUnlock: "Unlimited calculations",
    paidDescription:
      "Run as many show calculations as you need, any time. No weekly resets.",
  },
  more_saved_shows: {
    name: "Saved Shows",
    freeLimit: "5 shows",
    paidUnlock: "Unlimited saved history",
    paidDescription:
      "Keep a permanent record of every show and compare profitability over time.",
  },
  more_profiles: {
    name: "Act Profiles",
    freeLimit: "1 profile",
    paidUnlock: "Up to 10 act profiles",
    paidDescription:
      "Manage different acts, side projects, or client bands with separate settings.",
  },
  more_vehicles: {
    name: "Garage",
    freeLimit: "Standard vehicle only",
    paidUnlock: "Full multi-vehicle garage",
    paidDescription:
      "Add your own van, car, or trailer with real fuel consumption. Assign vehicles to different acts.",
  },
  larger_band: {
    name: "Band Size",
    freeLimit: "Up to 3 members",
    paidUnlock: "Unlimited band members",
    paidDescription:
      "Track individual member fees and payouts for bands of any size.",
  },
  tour_builder: {
    name: "Tour Builder",
    freeLimit: "Not included",
    paidUnlock: "Full tour trail builder",
    paidDescription:
      "Plan multi-stop tours, see total fuel and accommodation across every show, and track your whole run.",
  },
  advanced_driving: {
    name: "Drive-day limits",
    freeLimit: "Not included",
    paidUnlock: "Max drive-hours routing",
    paidDescription:
      "Set a maximum drive time per day and let the calculator flag routes that push too far.",
  },
  shared_accommodation: {
    name: "Accommodation automation",
    freeLimit: "Manual only",
    paidUnlock: "Auto-calculated rooms",
    paidDescription:
      "Set room configurations once on your profile and have accommodation costs calculated automatically every show.",
  },
  venue_intelligence: {
    name: "Venue Intelligence",
    freeLimit: "Not included",
    paidUnlock: "Venue History",
    paidDescription:
      "Unlock past shows, deal history, and smart suggestions for this venue. See what you earned last time and auto-fill your deal details.",
  },
};

export function getFeatureInfo(feature: PlanFeature): FeatureInfo {
  return FEATURE_REGISTRY[feature];
}

export const PLAN_LIMITS: Record<
  Plan,
  {
    maxBandMembers: number;
    advancedDrivingLogic: boolean;
    sharedAccommodation: boolean;
  }
> = {
  free: {
    maxBandMembers: 3,
    advancedDrivingLogic: false,
    sharedAccommodation: false,
  },
  paid: {
    maxBandMembers: Infinity,
    advancedDrivingLogic: true,
    sharedAccommodation: true,
  },
};

/** Returns true when the plan unlocks all paid features. */
export function isPaidPlan(plan: string): boolean {
  return plan === "paid";
}

export function maxBandMembersForPlan(plan: Plan): number {
  return PLAN_LIMITS[plan]?.maxBandMembers ?? 3;
}

export function canAddBandMember(plan: Plan, currentCount: number): boolean {
  const limit = maxBandMembersForPlan(plan);
  return currentCount < limit;
}

export function canUseAdvancedDriving(plan: Plan): boolean {
  return PLAN_LIMITS[plan]?.advancedDrivingLogic ?? false;
}

export function canUseSharedAccommodation(plan: Plan): boolean {
  return PLAN_LIMITS[plan]?.sharedAccommodation ?? false;
}
