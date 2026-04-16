export type Plan = "free" | "pro" | "unlimited";

export type PlanFeature =
  | "more_calculations"
  | "more_saved_shows"
  | "more_profiles"
  | "more_vehicles"
  | "larger_band"
  | "tour_builder"
  | "advanced_driving"
  | "shared_accommodation";

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
    proUnlock: "Unlimited band members",
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
  pro: {
    maxBandMembers: Infinity,
    advancedDrivingLogic: true,
    sharedAccommodation: true,
  },
  unlimited: {
    maxBandMembers: Infinity,
    advancedDrivingLogic: true,
    sharedAccommodation: true,
  },
};

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
