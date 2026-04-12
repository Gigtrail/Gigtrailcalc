import { useState, useEffect } from "react";
import type { Member } from "@/types/member";
import {
  generateMemberId,
  resolveActiveMembers,
  adjustActiveForActType,
} from "@/lib/member-utils";
import { canAddBandMember, maxBandMembersForPlan, type Plan } from "@/lib/plan-limits";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Info } from "lucide-react";

export interface ActSetupData {
  actType: string;
  memberLibrary: Member[];
  activeMemberIds: string[];
}

interface ActSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialActType: string;
  initialLibrary: Member[];
  initialActiveMemberIds: string[];
  plan: Plan;
  onSave: (data: ActSetupData) => void;
  isSaving?: boolean;
}

export function ActSetupDialog({
  open,
  onOpenChange,
  initialActType,
  initialLibrary,
  initialActiveMemberIds,
  plan,
  onSave,
  isSaving,
}: ActSetupDialogProps) {
  const [actType, setActType] = useState(initialActType);
  const [library, setLibrary] = useState<Member[]>(initialLibrary);
  const [activeMemberIds, setActiveMemberIds] = useState<string[]>(initialActiveMemberIds);
  const [addingNew, setAddingNew] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", role: "", expectedGigFee: 0 });
  const [recentlyRemoved, setRecentlyRemoved] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setActType(initialActType);
      setLibrary(initialLibrary);
      setActiveMemberIds(initialActiveMemberIds);
      setAddingNew(false);
      setNewMember({ name: "", role: "", expectedGigFee: 0 });
      setRecentlyRemoved([]);
    }
  }, [open, initialActType, initialLibrary, initialActiveMemberIds]);

  const activeMembers = resolveActiveMembers(library, activeMemberIds);
  const inactiveMembers = library.filter((m) => !activeMemberIds.includes(m.id));

  function handleActTypeChange(newType: string) {
    const adjusted = adjustActiveForActType(newType, activeMemberIds, library);
    let newActive = adjusted;

    if (newType === "Solo") {
      if (newActive.length === 0) {
        const newId = generateMemberId();
        const newM: Member = { id: newId, name: "", expectedGigFee: 0 };
        setLibrary((prev) => [...prev, newM]);
        newActive = [newId];
      }
    } else if (newType === "Duo") {
      let updated = [...library];
      while (newActive.length < 2) {
        const nextInactive = updated.find((m) => !newActive.includes(m.id));
        if (nextInactive) {
          newActive = [...newActive, nextInactive.id];
        } else {
          const newId = generateMemberId();
          const newM: Member = { id: newId, name: "", expectedGigFee: 0 };
          updated = [...updated, newM];
          newActive = [...newActive, newId];
        }
      }
      setLibrary(updated);
    }

    setActType(newType);
    setActiveMemberIds(newActive);
  }

  function handleRemoveFromAct(memberId: string) {
    const member = library.find((m) => m.id === memberId);
    if (member) {
      const displayName = member.name || "Member";
      setRecentlyRemoved((prev) => [...prev, displayName]);
      setTimeout(() => setRecentlyRemoved((prev) => prev.slice(1)), 4000);
    }
    setActiveMemberIds((prev) => prev.filter((id) => id !== memberId));
  }

  function handleUpdateMember(id: string, updates: Partial<Member>) {
    setLibrary((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }

  function handleAddNewMember() {
    if (!newMember.name.trim()) return;
    const id = generateMemberId();
    const member: Member = {
      id,
      name: newMember.name.trim(),
      role: newMember.role.trim() || undefined,
      expectedGigFee: newMember.expectedGigFee,
    };
    setLibrary((prev) => [...prev, member]);
    setActiveMemberIds((prev) => [...prev, id]);
    setNewMember({ name: "", role: "", expectedGigFee: 0 });
    setAddingNew(false);
  }

  function handleAddFromLibrary(memberId: string) {
    if (!activeMemberIds.includes(memberId)) {
      setActiveMemberIds((prev) => [...prev, memberId]);
    }
  }

  const bandError =
    actType === "Band" && activeMembers.length < 3
      ? `Band requires at least 3 active members — currently ${activeMembers.length}.`
      : null;

  const canAdd =
    actType === "Band" && canAddBandMember(plan, activeMemberIds.length);
  const atPlanLimit =
    actType === "Band" && !canAddBandMember(plan, activeMemberIds.length);

  const canSave =
    !bandError &&
    !(actType === "Solo" && activeMemberIds.length !== 1) &&
    !(actType === "Duo" && activeMemberIds.length !== 2);

  function handleSave() {
    if (!canSave) return;
    onSave({ actType, memberLibrary: library, activeMemberIds });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Act Setup</DialogTitle>
          <DialogDescription>
            Set your act type and manage who's in your current lineup.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Act Type</label>
            <div className="flex gap-2">
              {["Solo", "Duo", "Band"].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleActTypeChange(type)}
                  className={`flex-1 py-2 px-3 rounded-md border text-sm font-medium transition-all ${
                    actType === type
                      ? "border-primary bg-primary/10 text-primary shadow-sm"
                      : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {actType === "Solo"
                ? "Act Member"
                : actType === "Duo"
                ? "Duo Members"
                : "Active Band Members"}
            </label>

            {activeMembers.length === 0 && (
              <p className="text-sm text-muted-foreground italic py-2">
                No active members yet — add one below.
              </p>
            )}

            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div key={member.id} className="flex gap-2 items-center">
                  <Input
                    placeholder="Name"
                    value={member.name}
                    onChange={(e) =>
                      handleUpdateMember(member.id, { name: e.target.value })
                    }
                    className="flex-[2]"
                  />
                  <Input
                    placeholder="Role"
                    value={member.role || ""}
                    onChange={(e) =>
                      handleUpdateMember(member.id, { role: e.target.value })
                    }
                    className="flex-[1.5]"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Fee $"
                    value={member.expectedGigFee ?? ""}
                    onChange={(e) =>
                      handleUpdateMember(member.id, {
                        expectedGigFee: e.target.value === "" ? 0 : Number(e.target.value),
                      })
                    }
                    className="flex-1 min-w-[75px]"
                  />
                  {actType === "Band" && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveFromAct(member.id)}
                      title="Remove from act — kept in your member library"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  {actType !== "Band" && <div className="w-8 shrink-0" />}
                </div>
              ))}
            </div>

            {recentlyRemoved.length > 0 && (
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
                <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                <span>
                  <strong>{recentlyRemoved[0]}</strong> removed from this act — still saved in your member library.
                </span>
              </div>
            )}

            {bandError && (
              <p className="text-sm font-medium text-destructive">{bandError}</p>
            )}

            {actType === "Band" && (
              <div className="flex flex-wrap gap-2 pt-1">
                {atPlanLimit ? (
                  <div className="w-full rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2.5 text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-400">
                      Free plans support up to {maxBandMembersForPlan(plan)} active band members.
                    </p>
                    <p className="text-amber-700 dark:text-amber-500 mt-0.5">
                      <a href="/billing" className="underline underline-offset-2 font-medium">
                        Upgrade to Pro
                      </a>{" "}
                      for larger band setups.
                    </p>
                  </div>
                ) : (
                  <>
                    {!addingNew && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setAddingNew(true)}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add New Member
                      </Button>
                    )}
                    {inactiveMembers.length > 0 && !addingNew && (
                      <Select onValueChange={handleAddFromLibrary}>
                        <SelectTrigger className="h-9 w-auto text-sm">
                          <SelectValue placeholder="Add from Library" />
                        </SelectTrigger>
                        <SelectContent>
                          {inactiveMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name || "Unnamed"}
                              {m.role ? ` (${m.role})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </>
                )}
              </div>
            )}

            {addingNew && (
              <div className="space-y-2 p-3 rounded-md border border-border/50 bg-muted/30 mt-2">
                <p className="text-xs font-medium text-muted-foreground">New Band Member</p>
                <div className="flex gap-2">
                  <Input
                    placeholder="Name *"
                    value={newMember.name}
                    onChange={(e) =>
                      setNewMember((prev) => ({ ...prev, name: e.target.value }))
                    }
                    className="flex-[2]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddNewMember();
                    }}
                  />
                  <Input
                    placeholder="Role (optional)"
                    value={newMember.role}
                    onChange={(e) =>
                      setNewMember((prev) => ({ ...prev, role: e.target.value }))
                    }
                    className="flex-[1.5]"
                  />
                  <Input
                    type="number"
                    min="0"
                    placeholder="Fee $"
                    value={newMember.expectedGigFee || ""}
                    onChange={(e) =>
                      setNewMember((prev) => ({
                        ...prev,
                        expectedGigFee: e.target.value === "" ? 0 : Number(e.target.value),
                      }))
                    }
                    className="flex-1 min-w-[75px]"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddNewMember}
                    disabled={!newMember.name.trim()}
                  >
                    Add Member
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingNew(false);
                      setNewMember({ name: "", role: "", expectedGigFee: 0 });
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !canSave}>
            {isSaving ? "Saving..." : "Save Act Setup"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
