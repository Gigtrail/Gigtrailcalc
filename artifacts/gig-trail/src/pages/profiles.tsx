import {
  useGetProfiles,
  useDeleteProfile,
  useUpdateProfile,
  getGetProfilesQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Users, MapPin, Edit, Trash2, Lock, Settings2, BookUser } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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
import { usePlan } from "@/hooks/use-plan";
import type { Plan } from "@/lib/plan-limits";
import { useState } from "react";
import { ActSetupDialog, type ActSetupData } from "@/components/act-setup-dialog";
import { MemberLibraryDialog } from "@/components/member-library-dialog";
import type { Member } from "@/types/member";
import {
  migrateOldMembers,
  resolveActiveMembers,
  derivePeopleCount,
  parseActiveMemberIds,
} from "@/lib/member-utils";

export default function Profiles() {
  const { data: profiles, isLoading } = useGetProfiles();
  const deleteProfile = useDeleteProfile();
  const updateProfile = useUpdateProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { limits, plan } = usePlan();

  const atProfileLimit = (profiles?.length ?? 0) >= limits.maxProfiles;

  const [actSetupProfileId, setActSetupProfileId] = useState<number | null>(null);
  const [memberLibProfileId, setMemberLibProfileId] = useState<number | null>(null);

  const actSetupProfile = profiles?.find((p) => p.id === actSetupProfileId);
  const memberLibProfile = profiles?.find((p) => p.id === memberLibProfileId);

  function getProfileMemberData(profile: NonNullable<typeof profiles>[0]) {
    return migrateOldMembers(profile.bandMembers, profile.activeMemberIds ?? null);
  }

  const handleDelete = (id: number) => {
    deleteProfile.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
          toast({ title: "Profile deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete profile", variant: "destructive" });
        },
      }
    );
  };

  function handleActSetupSave(data: ActSetupData) {
    if (!actSetupProfileId) return;
    const peopleCount = derivePeopleCount(data.actType, data.activeMemberIds);
    updateProfile.mutate(
      {
        id: actSetupProfileId,
        data: {
          actType: data.actType,
          bandMembers:
            data.memberLibrary.length > 0 ? JSON.stringify(data.memberLibrary) : null,
          activeMemberIds:
            data.activeMemberIds.length > 0 ? JSON.stringify(data.activeMemberIds) : null,
          peopleCount,
        } as Parameters<typeof updateProfile.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
          setActSetupProfileId(null);
          toast({ title: "Act setup updated" });
        },
        onError: () => {
          toast({ title: "Failed to update act setup", variant: "destructive" });
        },
      }
    );
  }

  function handleLibrarySave(updatedLibrary: Member[]) {
    if (!memberLibProfileId) return;
    const profile = profiles?.find((p) => p.id === memberLibProfileId);
    if (!profile) return;
    const currentActive = parseActiveMemberIds(profile.activeMemberIds ?? null);
    const validIds = new Set(updatedLibrary.map((m) => m.id));
    const cleanedActive = currentActive.filter((id) => validIds.has(id));
    updateProfile.mutate(
      {
        id: memberLibProfileId,
        data: {
          bandMembers: updatedLibrary.length > 0 ? JSON.stringify(updatedLibrary) : null,
          activeMemberIds:
            cleanedActive.length > 0 ? JSON.stringify(cleanedActive) : null,
        } as Parameters<typeof updateProfile.mutate>[0]["data"],
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
          setMemberLibProfileId(null);
          toast({ title: "Member library saved" });
        },
        onError: () => {
          toast({ title: "Failed to save member library", variant: "destructive" });
        },
      }
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
          <p className="text-muted-foreground mt-1">Manage your acts and bands.</p>
        </div>
        {atProfileLimit ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">
              Multiple profiles require Pro
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href="/billing">
                <Lock className="w-3.5 h-3.5 mr-1.5" />
                Upgrade to Pro
              </Link>
            </Button>
          </div>
        ) : (
          <Button asChild>
            <Link href="/profiles/new">
              <Plus className="w-4 h-4 mr-2" />
              New Profile
            </Link>
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-20 mt-1" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : profiles?.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-lg border border-border border-dashed">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No profiles yet</h3>
          <p className="text-muted-foreground mb-4">Create your first profile to get started.</p>
          <Button asChild>
            <Link href="/profiles/new">Create Profile</Link>
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {profiles?.map((profile) => {
            const { library, activeMemberIds } = getProfileMemberData(profile);
            const activeMembers = resolveActiveMembers(library, activeMemberIds);
            const peopleCount = derivePeopleCount(profile.actType, activeMemberIds);

            return (
              <Card
                key={profile.id}
                className="group hover-elevate transition-all border-border/50 bg-card/50 flex flex-col"
              >
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div>
                    <CardTitle className="text-xl">{profile.name}</CardTitle>
                    <div className="text-sm text-primary font-medium mt-0.5">
                      {profile.actType}
                    </div>
                  </div>
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      asChild
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Link href={`/profiles/${profile.id}/edit`}>
                        <Edit className="h-4 w-4" />
                      </Link>
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Profile</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure? This will permanently delete the profile "
                            {profile.name}".
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(profile.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 flex-1 flex flex-col">
                  {profile.homeBase && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mr-2 opacity-70 shrink-0" />
                      {profile.homeBase}
                    </div>
                  )}

                  {activeMembers.length > 0 ? (
                    <div className="space-y-1">
                      {activeMembers.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between text-sm"
                        >
                          <span className="text-foreground">
                            {m.name || (
                              <span className="text-muted-foreground italic">Unnamed</span>
                            )}
                            {m.role && (
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({m.role})
                              </span>
                            )}
                          </span>
                          {m.expectedGigFee != null && m.expectedGigFee > 0 && (
                            <span className="text-primary font-medium tabular-nums text-xs">
                              ${m.expectedGigFee}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Users className="w-4 h-4 mr-2 opacity-70" />
                      {peopleCount} {peopleCount === 1 ? "Person" : "People"}
                    </div>
                  )}

                  <div className="pt-3 mt-auto border-t border-border/40 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Accommodation</div>
                      <div className="font-medium">
                        {profile.accommodationRequired
                          ? (profile.accommodationType ?? "Required")
                          : "Not required"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Avg Food</div>
                      <div className="font-medium">${profile.avgFoodPerDay}/day</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => setActSetupProfileId(profile.id)}
                    >
                      <Settings2 className="w-3 h-3 mr-1" />
                      Update Act Setup
                    </Button>
                    {library.length > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => setMemberLibProfileId(profile.id)}
                      >
                        <BookUser className="w-3 h-3 mr-1" />
                        Member Library
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {actSetupProfile && (
        <ActSetupDialog
          key={`act-setup-${actSetupProfile.id}`}
          open={!!actSetupProfileId}
          onOpenChange={(open) => {
            if (!open) setActSetupProfileId(null);
          }}
          initialActType={actSetupProfile.actType}
          initialLibrary={(() => {
            const { library } = migrateOldMembers(
              actSetupProfile.bandMembers,
              actSetupProfile.activeMemberIds ?? null
            );
            return library;
          })()}
          initialActiveMemberIds={(() => {
            const { activeMemberIds } = migrateOldMembers(
              actSetupProfile.bandMembers,
              actSetupProfile.activeMemberIds ?? null
            );
            return activeMemberIds;
          })()}
          plan={plan as Plan}
          onSave={handleActSetupSave}
          isSaving={updateProfile.isPending}
        />
      )}

      {memberLibProfile && (
        <MemberLibraryDialog
          key={`member-lib-${memberLibProfile.id}`}
          open={!!memberLibProfileId}
          onOpenChange={(open) => {
            if (!open) setMemberLibProfileId(null);
          }}
          library={(() => {
            const { library } = migrateOldMembers(
              memberLibProfile.bandMembers,
              memberLibProfile.activeMemberIds ?? null
            );
            return library;
          })()}
          activeMemberIds={(() => {
            const { activeMemberIds } = migrateOldMembers(
              memberLibProfile.bandMembers,
              memberLibProfile.activeMemberIds ?? null
            );
            return activeMemberIds;
          })()}
          onSave={handleLibrarySave}
          isSaving={updateProfile.isPending}
        />
      )}
    </div>
  );
}
