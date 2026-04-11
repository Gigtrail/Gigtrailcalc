import { useGetVehicles, useDeleteVehicle, getGetVehiclesQueryKey } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { Plus, Truck, Fuel, Users, Edit, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { usePlan } from "@/hooks/use-plan";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Vehicles() {
  const { data: vehicles, isLoading } = useGetVehicles();
  const deleteVehicle = useDeleteVehicle();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [, setLocation] = useLocation();

  const handleDelete = (id: number) => {
    deleteVehicle.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetVehiclesQueryKey() });
          toast({ title: "Vehicle deleted" });
        },
        onError: () => {
          toast({ title: "Failed to delete vehicle", variant: "destructive" });
        },
      }
    );
  };

  const handleAddVehicle = () => {
    if (!isPro) {
      setShowUpgradeModal(true);
    } else {
      setLocation("/vehicles/new");
    }
  };

  const handleEditVehicle = (id: number) => {
    if (!isPro) {
      setShowUpgradeModal(true);
    } else {
      setLocation(`/vehicles/${id}/edit`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vehicles</h1>
          <p className="text-muted-foreground mt-1">Manage your fleet and fuel consumption.</p>
        </div>
        <Button onClick={handleAddVehicle}>
          {!isPro ? <Lock className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          New Vehicle
        </Button>
      </div>

      {!isPro && (
        <div className="rounded-lg border border-border/50 bg-muted/30 p-4 flex items-start gap-3">
          <Lock className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Free plan</span> — custom vehicles are a Pro feature.
            Use Car, Van, or Bus presets in the calculator.{" "}
            <Button variant="link" className="h-auto p-0 text-primary text-sm" onClick={() => setShowUpgradeModal(true)}>
              Upgrade to Pro
            </Button>
          </div>
        </div>
      )}

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
        <div className="text-center py-12 bg-card rounded-lg border border-border border-dashed">
          <Truck className="w-12 h-12 mx-auto text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium">No vehicles yet</h3>
          <p className="text-muted-foreground mb-4">
            {isPro ? "Add a vehicle to calculate travel costs." : "Upgrade to Pro to add custom vehicles."}
          </p>
          <Button onClick={handleAddVehicle}>
            {isPro ? "Add Vehicle" : "Upgrade to Pro"}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {vehicles?.map((vehicle) => (
            <Card key={vehicle.id} className="group hover-elevate transition-all border-border/50 bg-card/50">
              <CardHeader className="pb-2 flex flex-row items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{vehicle.name}</CardTitle>
                  <div className="text-sm text-primary font-medium mt-1">{vehicle.fuelType}</div>
                </div>
                <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => handleEditVehicle(vehicle.id)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Vehicle</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure? This will permanently delete "{vehicle.name}".
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(vehicle.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center text-sm text-muted-foreground">
                  <Fuel className="w-4 h-4 mr-2 opacity-70" />
                  {vehicle.avgConsumption} L/100km
                </div>
                {vehicle.maxPassengers && (
                  <div className="flex items-center text-sm text-muted-foreground">
                    <Users className="w-4 h-4 mr-2 opacity-70" />
                    Max {vehicle.maxPassengers} passengers
                  </div>
                )}
                {vehicle.notes && (
                  <div className="pt-3 mt-3 border-t border-border/40 text-sm text-muted-foreground italic">
                    "{vehicle.notes}"
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Truck className="w-5 h-5 text-primary" />
              </div>
              <DialogTitle className="text-xl">Custom vehicles are a Pro feature</DialogTitle>
            </div>
            <DialogDescription className="text-base">
              Upgrade to Pro to match your real setup and get more accurate results.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowUpgradeModal(false)} className="w-full sm:w-auto">
              Keep using presets
            </Button>
            <Button onClick={() => { setShowUpgradeModal(false); setLocation("/billing"); }} className="w-full sm:w-auto">
              Upgrade to Pro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
