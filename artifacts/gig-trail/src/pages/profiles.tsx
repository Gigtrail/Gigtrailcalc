import {
  useGetProfiles,
  useDeleteProfile,
  getGetProfilesQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Plus, Users, MapPin, Edit, Trash2, Lock, BedDouble, UtensilsCrossed, DollarSign, Truck, Star, StarOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
import {
  migrateOldMembers,
  resolveActiveMembers,
  derivePeopleCount,
} from "@/lib/member-utils";
import { useState, useEffect } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const DEFAULT_PROFILE_KEY = "gigtrail_lastUsedProfileId";

export default function Profiles() {
  const { data: profiles, isLoading } = useGetProfiles();
  const deleteProfile = useDeleteProfile();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plan, limits } = usePlan();

  const isPro = plan === "pro" || plan === "unlimited";

  const [defaultProfileId, setDefaultProfileId] = useState<number | null>(() => {
    const stored = localStorage.getItem(DEFAULT_PROFILE_KEY);
    return stored ? parseInt(stored, 10) : null;
  });

  useEffect(() => {
    if (profiles && profiles.length > 0 && defaultProfileId === null) {
      setDefaultProfileId(profiles[0].id);
      localStorage.setItem(DEFAULT_PROFILE_KEY, String(profiles[0].id));
    }
    if (profiles && profiles.length > 0 && defaultProfileId !== null) {
      const stillExists = profiles.some((p) => p.id === defaultProfileId);
      if (!stillExists) {
        setDefaultProfileId(profiles[0].id);
        localStorage.setItem(DEFAULT_PROFILE_KEY, String(profiles[0].id));
      }
    }
  }, [profiles, defaultProfileId]);

  const handleSetDefault = (id: number) => {
    setDefaultProfileId(id);
    localStorage.setItem(DEFAULT_PROFILE_KEY, String(id));
    const profile = profiles?.find((p) => p.id === id);
    toast({ title: `"${profile?.name}" set as default act` });
  };

  const atProfileLimit = (profiles?.length ?? 0) >= limits.maxProfiles;
  const profileCount = profiles?.length ?? 0;

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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
          <p className="text-muted-foreground mt-1">
            {isPro
              ? profileCount > 0
                ? `${profileCount} act${profileCount !== 1 ? "s" : ""} · Manage your acts and bands`
                : "Manage your acts and bands"
              : "Your acts and bands."}
          </p>
        </div>

        {/* Add Profile button area */}
        {isPro ? (
          atProfileLimit ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:block">
                {profileCount} / {limits.maxProfiles} profiles
              </span>
              <Button variant="outline" size="sm" disabled>
                <Plus className="w-4 h-4 mr-2" />
                Add Profile
              </Button>
            </div>
          ) : (
            <Button asChild>
              <Link href="/profiles/new">
                <Plus className="w-4 h-4 mr-2" />
                Add Profile
              </Link>
            </Button>
          )
        ) : atProfileLimit ? (
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
              Add Profile
            </Link>
          </Button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        <Link href="/profiles">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors">
            <Users className="w-3.5 h-3.5" />
            Act Profiles
          </button>
        </Link>
        <Link href="/garage">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px hover:text-foreground transition-colors">
            <Truck className="w-3.5 h-3.5" />
            Manage Garage
          </button>
        </Link>
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
            const { library, activeMemberIds } = migrateOldMembers(
              profile.bandMembers,
              profile.activeMemberIds ?? null
            );
            const activeMembers = resolveActiveMembers(library, activeMemberIds);
            const peopleCount = derivePeopleCount(profile.actType, activeMemberIds);
            const isDefault = profile.id === defaultProfileId;

            const actCostPerShow = activeMembers.length > 0
              ? activeMembers.reduce((sum, m) => sum + (m.expectedGigFee ?? 0), 0)
              : (profile.expectedGigFee ?? 0);

            const foodPerDay = profile.avgFoodPerDay ?? 0;

            return (
              <Card
                key={profile.id}
                className={`group hover-elevate transition-all border-border/50 bg-card/50 flex flex-col ${
                  isDefault ? "ring-2 ring-primary/40" : ""
                }`}
              >
                <CardHeader className="pb-2 flex flex-row items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-xl truncate">{profile.name}</CardTitle>
                      {isDefault && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-primary/15 text-primary border-primary/30 shrink-0">
                          Default
                        </Badge>
                      )}
                    </div>
                    <div className="text-sm text-primary font-medium mt-0.5">
                      {profile.actType}
                    </div>
                  </div>
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    {/* Set as default */}
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-8 w-8 ${isDefault ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                            onClick={() => handleSetDefault(profile.id)}
                            disabled={isDefault}
                          >
                            {isDefault ? <Star className="h-4 w-4 fill-primary" /> : <StarOff className="h-4 w-4" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isDefault ? "Default act" : "Set as default"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

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
                            Are you sure? This will permanently delete "{profile.name}".
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
                  {/* Location */}
                  {profile.homeBase && (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <MapPin className="w-3.5 h-3.5 mr-1.5 opacity-70 shrink-0" />
                      {profile.homeBase}
                    </div>
                  )}

                  {/* Active members */}
                  {activeMembers.length > 0 ? (
                    <div className="space-y-1">
                      {activeMembers.map((m) => (
                        <div key={m.id} className="flex items-center justify-between text-sm">
                          <span className="text-foreground truncate">
                            {m.name || <span className="text-muted-foreground italic">Unnamed</span>}
                            {m.role && (
                              <span className="text-muted-foreground ml-1 text-xs">
                                ({m.role})
                              </span>
                            )}
                          </span>
                          {m.expectedGigFee != null && m.expectedGigFee > 0 && (
                            <span className="text-primary font-medium tabular-nums text-xs ml-2 shrink-0">
                              ${m.expectedGigFee}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center text-sm text-muted-foreground">
                      <Users className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                      {peopleCount} {peopleCount === 1 ? "Person" : "People"}
                    </div>
                  )}

                  {/* Cost summary */}
                  <div className="mt-auto pt-3 border-t border-border/40 grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground text-xs mb-0.5">
                        <DollarSign className="w-3 h-3" />
                        Act Cost / Show
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {actCostPerShow > 0 ? `$${actCostPerShow.toLocaleString()}` : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 text-muted-foreground text-xs mb-0.5">
                        <UtensilsCrossed className="w-3 h-3" />
                        Food / Day
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {foodPerDay > 0 ? `$${foodPerDay}` : "—"}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <div className="flex items-center gap-1 text-muted-foreground text-xs mb-0.5">
                        <BedDouble className="w-3 h-3" />
                        Accommodation
                      </div>
                      <div className="font-semibold text-foreground text-sm">
                        {profile.accommodationRequired
                          ? [
                              (profile.singleRoomsDefault ?? 0) > 0 && `${profile.singleRoomsDefault} single`,
                              (profile.doubleRoomsDefault ?? 0) > 0 && `${profile.doubleRoomsDefault} double`,
                            ].filter(Boolean).join(" + ") || "Required"
                          : "Not required"}
                      </div>
                    </div>
                  </div>

                  {/* Footer actions */}
                  <div className="pt-2 flex gap-1">
                    <Button variant="ghost" size="sm" asChild className="flex-1 text-xs text-muted-foreground h-7 hover:text-foreground">
                      <Link href={`/profiles/${profile.id}/edit`}>
                        <Edit className="w-3 h-3 mr-1.5" />
                        Edit Profile
                      </Link>
                    </Button>
                    {!isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground h-7 hover:text-primary px-2"
                        onClick={() => handleSetDefault(profile.id)}
                      >
                        <Star className="w-3 h-3 mr-1" />
                        Set Default
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add another profile card — Pro only, not at limit */}
          {isPro && !atProfileLimit && profiles && profiles.length > 0 && (
            <Link href="/profiles/new">
              <div className="group h-full min-h-[200px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-primary/10 group-hover:bg-primary/20 flex items-center justify-center mb-3 transition-colors">
                  <Plus className="w-5 h-5 text-primary" />
                </div>
                <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  Add Another Act
                </p>
                <p className="text-xs text-muted-foreground mt-1 opacity-70">
                  {profileCount} of {limits.maxProfiles} profiles used
                </p>
              </div>
            </Link>
          )}

          {/* Upgrade card — Free at limit */}
          {!isPro && atProfileLimit && (
            <Link href="/billing">
              <div className="group h-full min-h-[200px] flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer p-8 text-center">
                <div className="w-10 h-10 rounded-full bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center mb-3 transition-colors">
                  <Lock className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                  Multiple Acts — Pro
                </p>
                <p className="text-xs text-muted-foreground mt-1 opacity-70">
                  Upgrade to manage multiple acts
                </p>
              </div>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
