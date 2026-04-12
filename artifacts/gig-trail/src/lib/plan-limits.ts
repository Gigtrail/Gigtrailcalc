export type Plan = "free" | "pro" | "unlimited";

export const PLAN_LIMITS: Record<Plan, {
  maxBandMembers: number;
  advancedDrivingLogic: boolean;
  sharedAccommodation: boolean;
}> = {
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
