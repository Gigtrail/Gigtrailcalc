import { describe, expect, it } from "vitest";
import {
  ALPHA_MEMBER_LIMIT,
  findFirstCompleteProfile,
  getMemberSetupFeedback,
  getRequiredMemberCount,
  inferActTypeFromMemberCount,
  isProfileComplete,
} from "@/lib/profile-setup";

describe("profile setup rules", () => {
  it("maps member counts to supported act types", () => {
    expect(inferActTypeFromMemberCount(1)).toBe("Solo");
    expect(inferActTypeFromMemberCount(2)).toBe("Duo");
    expect(inferActTypeFromMemberCount(ALPHA_MEMBER_LIMIT)).toBe("Band");
    expect(inferActTypeFromMemberCount(0)).toBeNull();
  });

  it("validates exact member counts for each act type", () => {
    expect(getRequiredMemberCount("Solo")).toBe(1);
    expect(getRequiredMemberCount("Duo")).toBe(2);
    expect(getRequiredMemberCount("Band")).toBe(ALPHA_MEMBER_LIMIT);

    expect(getMemberSetupFeedback("Solo", 1).isValid).toBe(true);
    expect(getMemberSetupFeedback("Duo", 2).isValid).toBe(true);
    expect(getMemberSetupFeedback("Band", 3).isValid).toBe(true);
    expect(getMemberSetupFeedback("Band", 2)).toMatchObject({
      isValid: false,
      suggestedActType: "Duo",
    });
  });

  it("rejects incomplete profiles", () => {
    const incompleteProfile = {
      id: 1,
      name: "The Night Drive",
      actType: "Duo",
      homeBase: "Sydney NSW",
      activeMemberIds: JSON.stringify(["a"]),
      peopleCount: 1,
      vehicleType: "van",
      defaultVehicleId: null,
      defaultFuelPrice: null,
      defaultPetrolPrice: null,
      defaultDieselPrice: null,
      defaultLpgPrice: null,
    };

    expect(isProfileComplete(incompleteProfile as never)).toBe(false);
  });

  it("finds the first complete profile", () => {
    const profiles = [
      {
        id: 1,
        name: "Incomplete",
        actType: "Band",
        homeBase: "Melbourne VIC",
        activeMemberIds: JSON.stringify(["a", "b"]),
        peopleCount: 2,
        vehicleType: "van",
        defaultVehicleId: null,
        defaultFuelPrice: null,
        defaultPetrolPrice: 0,
        defaultDieselPrice: 0,
        defaultLpgPrice: 0,
      },
      {
        id: 2,
        name: "Ready To Roll",
        actType: "Solo",
        homeBase: "Brisbane QLD",
        activeMemberIds: JSON.stringify(["solo"]),
        peopleCount: 1,
        vehicleType: "small_car",
        defaultVehicleId: null,
        defaultFuelPrice: 1.91,
        defaultPetrolPrice: 1.91,
        defaultDieselPrice: null,
        defaultLpgPrice: null,
      },
    ];

    expect(findFirstCompleteProfile(profiles as never)?.id).toBe(2);
  });
});
