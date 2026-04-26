import { describe, expect, it } from "vitest";
import { calculateMemberEarnings, migrateOldMembers, parseMemberLibrary } from "./member-utils";
import type { Member } from "@/types/member";

describe("member library parsing", () => {
  it("parses old members without email", () => {
    const members = parseMemberLibrary(JSON.stringify([
      { id: "m1", name: "Alice", role: "Guitar", expectedGigFee: 150 },
    ]));

    expect(members).toEqual([
      { id: "m1", name: "Alice", role: "Guitar", expectedGigFee: 150 },
    ]);
  });

  it("preserves optional member email when present", () => {
    const members = parseMemberLibrary(JSON.stringify([
      { id: "m1", name: "Alice", email: "alice@example.com", expectedGigFee: 150 },
    ]));

    expect(members[0]).toMatchObject({
      id: "m1",
      name: "Alice",
      email: "alice@example.com",
      expectedGigFee: 150,
    });
  });

  it("drops non-string email values without breaking parsing", () => {
    const members = parseMemberLibrary(JSON.stringify([
      { id: "m1", name: "Alice", email: 123, expectedGigFee: 150 },
    ]));

    expect(members[0]).toEqual({
      id: "m1",
      name: "Alice",
      expectedGigFee: 150,
    });
  });

  it("keeps email when migrating legacy members without ids", () => {
    const { library, activeMemberIds } = migrateOldMembers(
      JSON.stringify([{ name: "Alice", role: "Guitar", email: "alice@example.com" }]),
      null,
    );

    expect(library).toHaveLength(1);
    expect(library[0]).toMatchObject({
      name: "Alice",
      role: "Guitar",
      email: "alice@example.com",
      expectedGigFee: 0,
    });
    expect(activeMemberIds).toEqual([library[0].id]);
  });

  it("leaves member fee calculations unchanged when email is present", () => {
    const members: Member[] = [
      { id: "m1", name: "Alice", email: "alice@example.com", feeType: "per_show", expectedGigFee: 150 },
      { id: "m2", name: "Bob", email: "bob@example.com", feeType: "per_tour", expectedGigFee: 500 },
    ];

    const summary = calculateMemberEarnings(members, 3);

    expect(summary.totalPayout).toBe(950);
    expect(summary.rows).toMatchObject([
      { memberId: "m1", totalEarnings: 450, feeType: "per_show" },
      { memberId: "m2", totalEarnings: 500, feeType: "per_tour" },
    ]);
  });
});
