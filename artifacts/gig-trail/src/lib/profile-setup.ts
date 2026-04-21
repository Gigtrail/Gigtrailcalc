import type { Profile } from "@workspace/api-client-react";
import { parseActiveMemberIds } from "@/lib/member-utils";

export const ALPHA_MEMBER_LIMIT = 3;
export const PROFILE_CHECKOUT_RETURN_KEY = "gigtrail_post_checkout_return_to";

export const FUEL_TYPES = ["petrol", "diesel", "lpg"] as const;
export type ProfileFuelType = (typeof FUEL_TYPES)[number];

export const ACT_TYPES = ["Solo", "Duo", "Band"] as const;
export type SupportedActType = (typeof ACT_TYPES)[number];

const REQUIRED_MEMBER_COUNT: Record<SupportedActType, number> = {
  Solo: 1,
  Duo: 2,
  Band: ALPHA_MEMBER_LIMIT,
};

function isSupportedActType(actType: string | null | undefined): actType is SupportedActType {
  return ACT_TYPES.includes((actType ?? "") as SupportedActType);
}

export function getRequiredMemberCount(actType: string | null | undefined): number {
  if (!isSupportedActType(actType)) {
    return REQUIRED_MEMBER_COUNT.Solo;
  }
  return REQUIRED_MEMBER_COUNT[actType];
}

export function inferActTypeFromMemberCount(memberCount: number): SupportedActType | null {
  if (memberCount <= 0) return null;
  if (memberCount === 1) return "Solo";
  if (memberCount === 2) return "Duo";
  if (memberCount === ALPHA_MEMBER_LIMIT) return "Band";
  return null;
}

function actTypeLabel(actType: SupportedActType): string {
  return actType === "Band" ? "Band" : actType;
}

export interface MemberSetupFeedback {
  isValid: boolean;
  message: string | null;
  suggestedActType: SupportedActType | null;
  suggestionMessage: string | null;
}

export function getMemberSetupFeedback(
  actTypeRaw: string | null | undefined,
  memberCount: number,
): MemberSetupFeedback {
  if (memberCount <= 0) {
    return {
      isValid: false,
      message: "Add at least one member to continue",
      suggestedActType: null,
      suggestionMessage: null,
    };
  }

  const actType = isSupportedActType(actTypeRaw) ? actTypeRaw : "Solo";
  const requiredCount = getRequiredMemberCount(actType);
  const inferredActType = inferActTypeFromMemberCount(memberCount);
  const suggestedActType = inferredActType && inferredActType !== actType ? inferredActType : null;

  if (memberCount === requiredCount) {
    return {
      isValid: true,
      message: null,
      suggestedActType: null,
      suggestionMessage: null,
    };
  }

  let message = "";
  if (actType === "Solo") {
    message = "Solo requires 1 member - remove one or switch to Duo";
  } else if (actType === "Duo") {
    message = memberCount < 2
      ? "Duo requires 2 members - add one more or switch to Solo"
      : "Duo requires 2 members - remove one or switch to Band";
  } else {
    message = memberCount < ALPHA_MEMBER_LIMIT
      ? "Band requires 3 members - add one more or switch to Duo"
      : "Band is capped at 3 members for alpha - remove one or switch to Duo";
  }

  return {
    isValid: false,
    message,
    suggestedActType,
    suggestionMessage: suggestedActType
      ? `Looks like a ${actTypeLabel(suggestedActType)} - switch?`
      : null,
  };
}

export function inferFuelTypeFromPrices(prices: {
  defaultPetrolPrice?: number | null;
  defaultDieselPrice?: number | null;
  defaultLpgPrice?: number | null;
}): ProfileFuelType {
  if ((prices.defaultDieselPrice ?? 0) > 0) return "diesel";
  if ((prices.defaultLpgPrice ?? 0) > 0) return "lpg";
  return "petrol";
}

export function getFuelPriceForType(
  fuelType: ProfileFuelType,
  prices: {
    defaultFuelPrice?: number | null;
    defaultPetrolPrice?: number | null;
    defaultDieselPrice?: number | null;
    defaultLpgPrice?: number | null;
  },
): number | null {
  if (fuelType === "diesel" && (prices.defaultDieselPrice ?? 0) > 0) {
    return prices.defaultDieselPrice ?? null;
  }
  if (fuelType === "lpg" && (prices.defaultLpgPrice ?? 0) > 0) {
    return prices.defaultLpgPrice ?? null;
  }
  if (fuelType === "petrol" && (prices.defaultPetrolPrice ?? 0) > 0) {
    return prices.defaultPetrolPrice ?? null;
  }
  return prices.defaultFuelPrice ?? null;
}

export function hasSavedFuelPrice(profile: Pick<
  Profile,
  "defaultFuelPrice" | "defaultPetrolPrice" | "defaultDieselPrice" | "defaultLpgPrice"
>): boolean {
  return [
    profile.defaultFuelPrice,
    profile.defaultPetrolPrice,
    profile.defaultDieselPrice,
    profile.defaultLpgPrice,
  ].some((value) => Number(value ?? 0) > 0);
}

export function getSavedMemberCount(profile: Pick<Profile, "actType" | "activeMemberIds" | "peopleCount">): number {
  const activeMemberIds = parseActiveMemberIds(profile.activeMemberIds ?? null);
  if (activeMemberIds.length > 0) {
    return activeMemberIds.length;
  }
  return Number(profile.peopleCount ?? 0);
}

export function isProfileComplete(profile: Pick<
  Profile,
  | "name"
  | "actType"
  | "homeBase"
  | "activeMemberIds"
  | "peopleCount"
  | "vehicleType"
  | "defaultVehicleId"
  | "defaultFuelPrice"
  | "defaultPetrolPrice"
  | "defaultDieselPrice"
  | "defaultLpgPrice"
>): boolean {
  const memberCount = getSavedMemberCount(profile);
  const memberSetup = getMemberSetupFeedback(profile.actType, memberCount);
  const hasVehicle = Boolean(profile.defaultVehicleId) || Boolean(profile.vehicleType?.trim());

  return Boolean(
    profile.name?.trim() &&
    profile.homeBase?.trim() &&
    hasVehicle &&
    hasSavedFuelPrice(profile as Pick<Profile, "defaultFuelPrice" | "defaultPetrolPrice" | "defaultDieselPrice" | "defaultLpgPrice">) &&
    memberSetup.isValid,
  );
}

export function findFirstCompleteProfile(profiles: Profile[] | null | undefined): Profile | null {
  return profiles?.find((profile) => isProfileComplete(profile)) ?? null;
}
