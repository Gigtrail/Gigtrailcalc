import { useState, useEffect } from "react";
import type { Member } from "@/types/member";
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
import { Trash2, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MemberLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  library: Member[];
  activeMemberIds: string[];
  onSave: (updatedLibrary: Member[]) => void;
  isSaving?: boolean;
}

export function MemberLibraryDialog({
  open,
  onOpenChange,
  library,
  activeMemberIds,
  onSave,
  isSaving,
}: MemberLibraryDialogProps) {
  const [members, setMembers] = useState<Member[]>(library);

  useEffect(() => {
    if (open) {
      setMembers(library);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]); // intentionally only reset on open — props may change due to ID regeneration

  function handleUpdate(id: string, updates: Partial<Member>) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
  }

  function handleDelete(id: string) {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  function handleSave() {
    onSave(members);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Member Library</DialogTitle>
          <DialogDescription>
            All members ever added to this profile. Edit details or remove members permanently.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {members.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No members in your library yet.</p>
              <p className="text-xs mt-1">Add members through Update Act Setup.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-[2fr_1.5fr_1fr_auto] gap-2 px-1 mb-1">
                <span className="text-xs font-medium text-muted-foreground">Name</span>
                <span className="text-xs font-medium text-muted-foreground">Role</span>
                <span className="text-xs font-medium text-muted-foreground">Fee</span>
                <span className="w-8" />
              </div>
              {members.map((member) => {
                const isActive = activeMemberIds.includes(member.id);
                return (
                  <div key={member.id} className="flex gap-2 items-center">
                    <Input
                      value={member.name}
                      onChange={(e) => handleUpdate(member.id, { name: e.target.value })}
                      placeholder="Name"
                      className="flex-[2]"
                    />
                    <Input
                      value={member.role || ""}
                      onChange={(e) => handleUpdate(member.id, { role: e.target.value })}
                      placeholder="Role"
                      className="flex-[1.5]"
                    />
                    <Input
                      type="number"
                      min="0"
                      value={member.expectedGigFee ?? ""}
                      onChange={(e) =>
                        handleUpdate(member.id, {
                          expectedGigFee: e.target.value === "" ? 0 : Number(e.target.value),
                        })
                      }
                      placeholder="$"
                      className="flex-1 min-w-[65px]"
                    />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          title="Remove from library permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove from Library</AlertDialogTitle>
                          <AlertDialogDescription>
                            Permanently remove <strong>{member.name || "this member"}</strong> from
                            your member library?
                            {isActive && (
                              <span className="block mt-1 text-amber-600 dark:text-amber-400 font-medium">
                                This member is currently active in your act setup.
                              </span>
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(member.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
