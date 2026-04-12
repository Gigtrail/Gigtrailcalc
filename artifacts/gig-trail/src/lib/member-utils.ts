import type { Member } from "@/types/member";

export function generateMemberId(): string {
  return Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

export function parseMemberLibrary(raw: string | null | undefined): Member[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseActiveMemberIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function resolveActiveMembers(library: Member[], activeMemberIds: string[]): Member[] {
  return activeMemberIds
    .map((id) => library.find((m) => m.id === id))
    .filter(Boolean) as Member[];
}

export function derivePeopleCount(actType: string, activeMemberIds: string[]): number {
  if (actType === "Solo") return 1;
  if (actType === "Duo") return 2;
  return activeMemberIds.length;
}

export function migrateOldMembers(
  rawBandMembers: string | null | undefined,
  rawActiveMemberIds: string | null | undefined
): { library: Member[]; activeMemberIds: string[] } {
  const rawParsed = parseMemberLibrary(rawBandMembers);

  if (rawParsed.length === 0) {
    return { library: [], activeMemberIds: [] };
  }

  const firstEntry = rawParsed[0] as Record<string, unknown>;
  if (firstEntry && typeof firstEntry.id === "string") {
    const existingActive = parseActiveMemberIds(rawActiveMemberIds);
    if (existingActive.length > 0) {
      return { library: rawParsed as Member[], activeMemberIds: existingActive };
    }
    return {
      library: rawParsed as Member[],
      activeMemberIds: (rawParsed as Member[]).map((m) => m.id),
    };
  }

  const withIds: Member[] = rawParsed.map((m: unknown) => {
    const entry = m as Record<string, unknown>;
    return {
      id: generateMemberId(),
      name: String(entry.name ?? ""),
      role: entry.role ? String(entry.role) : undefined,
      expectedGigFee: entry.expectedGigFee != null ? Number(entry.expectedGigFee) : 0,
    };
  });

  return {
    library: withIds,
    activeMemberIds: withIds.map((m) => m.id),
  };
}

export function adjustActiveForActType(
  actType: string,
  activeMemberIds: string[],
  library: Member[]
): string[] {
  if (actType === "Solo") {
    if (activeMemberIds.length >= 1) return [activeMemberIds[0]];
    if (library.length > 0) return [library[0].id];
    return activeMemberIds;
  }
  if (actType === "Duo") {
    return activeMemberIds.slice(0, 2);
  }
  return activeMemberIds;
}
