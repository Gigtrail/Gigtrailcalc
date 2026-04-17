import {
  useGetVehicles,
  useDeleteVehicle,
  useGetProfiles,
  useUpdateProfile,
  useSetVehicleActAssignments,
  getGetVehiclesQueryKey,
  getGetProfilesQueryKey,
} from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Plus, Truck, Fuel, Droplets, Star, Edit, Trash2, Users, ChevronDown } from "lucide-react";
import { UpgradeCTA } from "@/components/upgrade-cta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/hooks/use-plan";
import { getStandardVehicle } from "@/lib/garage-constants";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Garage() {
  const { data: vehicles, isLoading } = useGetVehicles();
  const { data: profiles } = useGetProfiles();
  const deleteVehicle = useDeleteVehicle();
  const updateProfile = useUpdateProfile();
  const setActAssignments = useSetVehicleActAssignments();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "paid";
  const [, setLocation] = useLocation();

  // Build a map: profileId -> profile name
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));

  const handleDelete = (id: number, name: string) => {
    deleteVehicle.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
          toast({ title: `"${name}" removed from garage` });
        },
        onError: () => {
          toast({ title: "Failed to remove vehicle", variant: "destructive" });
        },
      }
    );
  };

  const handleSetDefault = (vehicleId: number, actId: number, actName: string) => {
    updateProfile.mutate(
      { id: actId, data: { defaultVehicleId: vehicleId } as never },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
          toast({ title: `Set as default vehicle for "${actName}"` });
        },
        onError: () => {
          toast({ title: "Failed to set default vehicle", variant: "destructive" });
        },
      }
    );
  };

  const handleAddVehicle = () => {
    if (!isPro) {
      setLocation("/billing");
    } else {
      setLocation("/garage/new");
    }
  };

  const handleEditVehicle = (id: number) => {
    if (isPro) {
      setLocation(`/garage/${id}/edit`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Garage</h1>
          <p className="text-muted-foreground mt-1">
            Manage your custom touring vehicles and fuel settings.
          </p>
        </div>
        {isPro && (
          <Button onClick={handleAddVehicle}>
            <Plus className="w-4 h-4 mr-2" />
            Add Vehicle
          </Button>
        )}
      </div>

      {/* Section tabs */}
      <div className="flex items-center gap-1 border-b border-border/50 pb-0">
        <Link href="/profiles">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground border-b-2 border-transparent -mb-px hover:text-foreground transition-colors">
            <Users className="w-3.5 h-3.5" />
            Act Profiles
          </button>
        </Link>
        <Link href="/garage">
          <button className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary -mb-px transition-colors">
            <Truck className="w-3.5 h-3.5" />
            Manage Garage
          </button>
        </Link>
      </div>

      {!isPro && (
        <UpgradeCTA feature="more_vehicles" variant="banner" />
      )}

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">
            {isPro ? "Your custom vehicles" : "Custom vehicles"}
          </h2>
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
        ) : vehicles?.length === 0 ? (
          isPro ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border border-dashed">
              <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-40" />
              <h3 className="text-lg font-medium">No custom vehicles yet</h3>
              <p className="text-muted-foreground mb-4 text-sm">
                Add a vehicle to track fuel specs, tank size, and assign it to your acts.
              </p>
              <Button onClick={handleAddVehicle}>
                <Plus className="w-4 h-4 mr-2" />
                Add Vehicle
              </Button>
            </div>
          ) : (
            <UpgradeCTA feature="more_vehicles" variant="card" className="min-h-[200px]" />
          )
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {vehicles?.map((vehicle) => {
              const sv = getStandardVehicle(vehicle.vehicleType);
              const Icon = sv.Icon;
              const assignedActIds = vehicle.assignedActIds ?? [];
              const assignedActNames = assignedActIds
                .map((id) => profileMap.get(id))
                .filter(Boolean) as string[];
              // Which acts have this vehicle as their default?
              const defaultForActs = (profiles ?? [])
                .filter((p) => p.defaultVehicleId === vehicle.id)
                .map((p) => p.id);

              return (
                <Card key={vehicle.id} className="group hover:shadow-sm transition-all border-border/50 bg-card/50">
                  <CardHeader className="pb-2 flex flex-row items-start justify-between">
                    <div className="flex items-start gap-2.5 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <CardTitle className="text-base leading-tight">{vehicle.name}</CardTitle>
                          {defaultForActs.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] py-0 h-4 gap-0.5">
                              <Star className="w-2.5 h-2.5" />
                              Default
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="mt-0.5 text-xs">{sv.displayName}</CardDescription>
                      </div>
                    </div>
                    <div className="flex space-x-1 shrink-0 ml-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => handleEditVehicle(vehicle.id)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remove from Garage</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure? This will permanently delete "{vehicle.name}" from your garage.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(vehicle.id, vehicle.name)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Remove
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      <div className="flex items-center text-sm text-muted-foreground">
                        <Fuel className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                        {vehicle.avgConsumption} L/100km
                      </div>
                      {vehicle.tankSizeLitres && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Droplets className="w-3.5 h-3.5 mr-1.5 opacity-70" />
                          {vehicle.tankSizeLitres}L tank
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">{vehicle.fuelType}</div>

                    {/* Assigned acts */}
                    {assignedActNames.length > 0 && (
                      <div className="pt-1 flex items-center gap-1 flex-wrap">
                        <span className="text-xs text-muted-foreground">Assigned to:</span>
                        {assignedActNames.map((name) => (
                          <Badge key={name} variant="outline" className="text-[10px] py-0 h-4 font-normal">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {vehicle.notes && (
                      <div className="pt-2 mt-1 border-t border-border/40 text-xs text-muted-foreground italic">
                        "{vehicle.notes}"
                      </div>
                    )}

                    {/* Set as default / assign per act — shows ALL profiles */}
                    {isPro && (profiles ?? []).length > 0 && (
                      <div className="pt-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs gap-1 w-full">
                              <Star className="w-3 h-3" />
                              Set as default for act
                              <ChevronDown className="w-3 h-3 ml-auto" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-56">
                            <DropdownMenuLabel className="text-xs">Choose act</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(profiles ?? []).map((profile) => {
                              const isAssigned = assignedActIds.includes(profile.id);
                              const isCurrentDefault = defaultForActs.includes(profile.id);
                              return (
                                <DropdownMenuItem
                                  key={profile.id}
                                  disabled={isCurrentDefault}
                                  className="text-xs"
                                  onClick={() => {
                                    if (!isAssigned) {
                                      // Assign vehicle to this act first, then set as default
                                      const newActIds = [...assignedActIds, profile.id];
                                      setActAssignments.mutate(
                                        {
                                          id: vehicle.id,
                                          data: { actIds: newActIds, defaultForActIds: [profile.id] },
                                        },
                                        {
                                          onSuccess: () => {
                                            queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
                                            queryClient.invalidateQueries({ queryKey: getGetProfilesQueryKey() });
                                            toast({ title: `Assigned to "${profile.name}" and set as default` });
                                          },
                                          onError: () => {
                                            toast({ title: "Failed to assign vehicle", variant: "destructive" });
                                          },
                                        }
                                      );
                                    } else {
                                      handleSetDefault(vehicle.id, profile.id, profile.name);
                                    }
                                  }}
                                >
                                  {isCurrentDefault
                                    ? <Star className="w-3 h-3 mr-2 text-primary fill-primary" />
                                    : <span className="w-3 h-3 mr-2 inline-block" />
                                  }
                                  <span className="flex-1">{profile.name}</span>
                                  {isCurrentDefault && (
                                    <span className="ml-2 text-muted-foreground">current</span>
                                  )}
                                  {!isAssigned && (
                                    <span className="ml-2 text-muted-foreground/60 text-[10px]">+ assign</span>
                                  )}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-border/30">
        <p className="text-xs text-muted-foreground">
          Standard vehicle types (Small Car, SUV/Wagon, Van, Bus) are configured directly in each{" "}
          <Link href="/profiles" className="text-primary underline underline-offset-2">Profile</Link>.{" "}
          Different acts can use different vehicles — assign vehicles per act for accurate touring costs.
        </p>
      </div>

    </div>
  );
}
