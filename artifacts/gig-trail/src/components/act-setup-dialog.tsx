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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Plus, Info, BedDouble } from "lucide-react";

export interface ActSetupData {
  actType: string;
  memberLibrary: Member[];
  activeMemberIds: string[];
  accommodationRequired: boolean;
  singleRoomsDefault: number;
  doubleRoomsDefault: number;
  avgFoodPerDay: number;
}

interface ActSetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialActType: string;
  initialLibrary: Member[];
  initialActiveMemberIds: string[];
  initialAccommodationRequired: boolean;
  initialSingleRoomsDefault: number;
  initialDoubleRoomsDefault: number;
  initialAvgFoodPerDay: number;
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
  initialAccommodationRequired,
  initialSingleRoomsDefault,
  initialDoubleRoomsDefault,
  initialAvgFoodPerDay,
  plan,
  onSave,
  isSaving,
}: ActSetupDialogProps) {
  const [actType, setActType] = useState(initialActType);
  const [library, setLibrary] = useState<Member[]>(initialLibrary);
  const [activeMemberIds, setActiveMemberIds] = useState<string[]>(initialActiveMemberIds);
  const [accommodationRequired, setAccommodationRequired] = useState(initialAccommodationRequired);
  const [singleRoomsDefault, setSingleRoomsDefault] = useState(initialSingleRoomsDefault);
  const [doubleRoomsDefault, setDoubleRoomsDefault] = useState(initialDoubleRoomsDefault);
  const [avgFoodPerDay, setAvgFoodPerDay] = useState(initialAvgFoodPerDay);
  const [addingNew, setAddingNew] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", role: "", expectedGigFee: 0 });
  const [recentlyRemoved, setRecentlyRemoved] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setActType(initialActType);
      setLibrary(initialLibrary);
      setActiveMemberIds(initialActiveMemberIds);
      setAccommodationRequired(initialAccommodationRequired);
      setSingleRoomsDefault(initialSingleRoomsDefault);
      setDoubleRoomsDefault(initialDoubleRoomsDefault);
      setAvgFoodPerDay(initialAvgFoodPerDay);
      setAddingNew(false);
      setNewMember({ name: "", role: "", expectedGigFee: 0 });
      setRecentlyRemoved([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      } else {
        newActive = [newActive[0]];
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
      newActive = newActive.slice(0, 2);
      setLibrary(updated);
    } else if (newType === "Band") {
      let updated = [...library];
      while (newActive.length < 3) {
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
      ? `Band requires at least 3 members — currently ${activeMembers.length}.`
      : null;

  const canAdd =
    actType === "Band" && canAddBandMember(plan, activeMemberIds.length);
  const atPlanLimit =
    actType === "Band" && !canAddBandMember(plan, activeMemberIds.length);

  const canSave =
    !bandError &&
    !(actType === "Solo" && activeMemberIds.length !== 1) &&
    !(actType === "Duo" && activeMemberIds.length !== 2) &&
    (!accommodationRequired || (singleRoomsDefault + doubleRoomsDefault) >= 1);

  function handleSave() {
    if (!canSave) return;
    onSave({
      actType,
      memberLibrary: library,
      activeMemberIds,
      accommodationRequired,
      singleRoomsDefault: accommodationRequired ? singleRoomsDefault : 0,
      doubleRoomsDefault: accommodationRequired ? doubleRoomsDefault : 0,
      avgFoodPerDay,
    });
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

        <div className="space-y-6 py-2">

          {/* Act Type */}
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold text-foreground">Act Type</p>
              <p className="text-xs text-muted-foreground mt-0.5">Who's touring with you?</p>
            </div>
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

          {/* Members */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-foreground">Members</p>

            {activeMembers.length === 0 && (
              <p className="text-sm text-muted-foreground italic py-1">
                No members yet — add one below.
              </p>
            )}

            {/* Column headers */}
            {activeMembers.length > 0 && (
              <div className="grid grid-cols-[1fr_0.8fr_80px_32px] gap-2 px-0.5">
                <span className="text-xs text-muted-foreground font-medium">Name</span>
                <span className="text-xs text-muted-foreground font-medium">Role <span className="font-normal opacity-60">(optional)</span></span>
                <span className="text-xs text-muted-foreground font-medium text-right">Fee</span>
                <span />
              </div>
            )}

            <div className="space-y-2">
              {activeMembers.map((member) => (
                <div key={member.id} className="grid grid-cols-[1fr_0.8fr_80px_32px] gap-2 items-center">
                  <Input
                    placeholder="Name"
                    value={member.name}
                    onChange={(e) => handleUpdateMember(member.id, { name: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    placeholder="e.g. Guitar"
                    value={member.role || ""}
                    onChange={(e) => handleUpdateMember(member.id, { role: e.target.value })}
                    className="h-9 text-muted-foreground text-sm"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={member.expectedGigFee ?? ""}
                      onChange={(e) =>
                        handleUpdateMember(member.id, {
                          expectedGigFee: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      className="h-9 pl-6 text-right"
                    />
                  </div>
                  {actType === "Band" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleRemoveFromAct(member.id)}
                      title="Remove from act — kept in your member library"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  ) : (
                    <div className="w-9 shrink-0" />
                  )}
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

            {/* Plan limit message — directly below member list */}
            {actType === "Band" && atPlanLimit && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Free plan supports up to {maxBandMembersForPlan(plan)} members.{" "}
                <a href="/billing" className="underline underline-offset-2 font-medium">
                  Upgrade to Pro
                </a>{" "}
                for larger bands.
              </p>
            )}

            {/* Add member controls */}
            {actType === "Band" && !atPlanLimit && (
              <div className="flex flex-wrap gap-2 pt-0.5">
                {!addingNew && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAddingNew(true)}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" />
                    Add Member
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
              </div>
            )}

            {addingNew && (
              <div className="space-y-2 p-3 rounded-md border border-border/50 bg-muted/30 mt-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Member</p>
                <div className="grid grid-cols-[1fr_0.8fr_80px] gap-2">
                  <Input
                    placeholder="Name *"
                    value={newMember.name}
                    onChange={(e) => setNewMember((prev) => ({ ...prev, name: e.target.value }))}
                    className="h-9"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddNewMember(); }}
                  />
                  <Input
                    placeholder="Role (optional)"
                    value={newMember.role}
                    onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
                    className="h-9 text-muted-foreground text-sm"
                  />
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={newMember.expectedGigFee || ""}
                      onChange={(e) =>
                        setNewMember((prev) => ({
                          ...prev,
                          expectedGigFee: e.target.value === "" ? 0 : Number(e.target.value),
                        }))
                      }
                      className="h-9 pl-6 text-right"
                    />
                  </div>
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

          {/* Food */}
          <div className="space-y-3 pt-1 border-t border-border/40">
            <div>
              <p className="text-sm font-semibold text-foreground">Food &amp; Drink</p>
              <p className="text-xs text-muted-foreground mt-0.5">Average daily spend per person on the road.</p>
            </div>
            <div className="relative max-w-[140px]">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={avgFoodPerDay}
                onChange={(e) => setAvgFoodPerDay(Math.max(0, Number(e.target.value) || 0))}
                className="pl-6"
              />
            </div>
            <p className="text-xs text-muted-foreground">per person / day</p>
          </div>

          {/* Accommodation */}
          <div className="space-y-3 pt-1 border-t border-border/40">
            <p className="text-sm font-semibold text-foreground">Accommodation</p>

            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-3">
              <div className="flex items-center gap-2">
                <BedDouble className="w-4 h-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium text-foreground">This act requires accommodation</p>
              </div>
              <Switch
                checked={accommodationRequired}
                onCheckedChange={(val) => {
                  setAccommodationRequired(val);
                  if (!val) {
                    setSingleRoomsDefault(0);
                    setDoubleRoomsDefault(0);
                  }
                }}
              />
            </div>

            {accommodationRequired && (
              <div className="grid grid-cols-2 gap-3 pl-1">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Single Rooms</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={singleRoomsDefault}
                    onChange={(e) => setSingleRoomsDefault(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Double / Queen</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={doubleRoomsDefault}
                    onChange={(e) => setDoubleRoomsDefault(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  />
                </div>
                {(singleRoomsDefault + doubleRoomsDefault) < 1 && (
                  <p className="col-span-2 text-xs text-destructive">
                    At least one room required when accommodation is enabled.
                  </p>
                )}
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
