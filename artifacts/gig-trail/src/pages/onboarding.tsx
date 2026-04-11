import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateProfile, useCreateVehicle } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Car, Truck, Bus, User, Users, Music2, Loader2 } from "lucide-react";

const ACT_TYPES = [
  { type: "Solo", icon: User, people: 1, desc: "Just you" },
  { type: "Duo", icon: Users, people: 2, desc: "Two of you" },
  { type: "Band", icon: Music2, people: 3, desc: "Full crew" },
];

const VEHICLE_OPTIONS = [
  { type: "Car", icon: Car, consumption: 7, name: "Car Setup", desc: "7 L/100km" },
  { type: "Van", icon: Truck, consumption: 10, name: "Van Setup", desc: "10 L/100km" },
  { type: "Bus", icon: Bus, consumption: 16, name: "Bus Setup", desc: "16 L/100km" },
];

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [actName, setActName] = useState("");
  const [actType, setActType] = useState("Solo");
  const [peopleCount, setPeopleCount] = useState(1);
  const [homeBase, setHomeBase] = useState("");
  const [vehicleType, setVehicleType] = useState("Car");
  const [fuelPrice, setFuelPrice] = useState("2.00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const actNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    actNameRef.current?.focus();
  }, []);

  const createProfile = useCreateProfile();
  const createVehicle = useCreateVehicle();

  const handleActTypeSelect = (type: string, people: number) => {
    setActType(type);
    setPeopleCount(people);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!actName.trim()) errs.actName = "Please give your act a name";
    if (!homeBase.trim()) errs.homeBase = "Add your home base so we know where the run starts";
    if (!peopleCount || peopleCount < 1) errs.peopleCount = "You need at least 1 person";
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setIsSubmitting(true);
    try {
      const vehicleOption = VEHICLE_OPTIONS.find(v => v.type === vehicleType)!;
      const parsedFuelPrice = parseFloat(fuelPrice) || 2.00;

      const vehicle = await createVehicle.mutateAsync({
        name: vehicleOption.name,
        fuelType: "petrol",
        avgConsumption: vehicleOption.consumption,
      });

      const profile = await createProfile.mutateAsync({
        name: actName.trim(),
        actType,
        peopleCount,
        homeBase: homeBase.trim(),
        defaultVehicleId: vehicle.id,
        avgAccomPerNight: 0,
        avgFoodPerDay: 0,
      });

      await queryClient.invalidateQueries();

      const params = new URLSearchParams({
        profileId: String(profile.id),
        vehicleId: String(vehicle.id),
        origin: homeBase.trim(),
        fuelPrice: String(parsedFuelPrice),
      });

      setLocation(`/runs/new?${params.toString()}`);
    } catch {
      toast({
        title: "Something went wrong",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-start pt-8 pb-12 px-4">
      <div className="w-full max-w-lg space-y-6">

        <div className="text-center space-y-3">
          <img
            src="/gig-trail-logo.png"
            alt="The Gig Trail"
            className="h-20 w-auto mx-auto"
          />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20">
            <span className="w-2 h-2 rounded-full bg-primary inline-block" />
            <span className="text-xs font-medium text-primary">30 seconds and you're in</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Let's set up your act</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We'll use this to calculate your runs properly.{" "}
            <span className="text-muted-foreground/60">You can change all of this later.</span>
          </p>
        </div>

        <div className="bg-card border border-border/60 rounded-xl shadow-sm divide-y divide-border/40">

          <div className="p-6 space-y-2">
            <Label htmlFor="act-name" className="text-sm font-semibold text-foreground">
              Act Name
            </Label>
            <Input
              id="act-name"
              ref={actNameRef}
              value={actName}
              onChange={e => { setActName(e.target.value); setErrors(p => ({ ...p, actName: "" })); }}
              onKeyDown={handleKeyDown}
              placeholder="The Midnight Ramblers"
              className={errors.actName ? "border-destructive" : ""}
            />
            {errors.actName
              ? <p className="text-xs text-destructive">{errors.actName}</p>
              : <p className="text-xs text-muted-foreground">Just something to label your setup</p>
            }
          </div>

          <div className="p-6 space-y-3">
            <div>
              <Label className="text-sm font-semibold text-foreground">What kind of act are you?</Label>
              <p className="text-xs text-muted-foreground mt-0.5">This affects how we split profit later</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {ACT_TYPES.map(({ type, icon: Icon, people, desc }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleActTypeSelect(type, people)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    actType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-sm font-semibold">{type}</span>
                  <span className="text-xs opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 space-y-2">
            <Label htmlFor="people-count" className="text-sm font-semibold text-foreground">
              Number of People
            </Label>
            <Input
              id="people-count"
              type="number"
              min={1}
              max={99}
              value={peopleCount}
              onChange={e => { setPeopleCount(Number(e.target.value)); setErrors(p => ({ ...p, peopleCount: "" })); }}
              onKeyDown={handleKeyDown}
              className={`w-28 ${errors.peopleCount ? "border-destructive" : ""}`}
            />
            {errors.peopleCount
              ? <p className="text-xs text-destructive">{errors.peopleCount}</p>
              : <p className="text-xs text-muted-foreground">Who's sharing the money</p>
            }
          </div>

          <div className="p-6 space-y-2">
            <Label htmlFor="home-base" className="text-sm font-semibold text-foreground">
              Home Base
            </Label>
            <Input
              id="home-base"
              value={homeBase}
              onChange={e => { setHomeBase(e.target.value); setErrors(p => ({ ...p, homeBase: "" })); }}
              onKeyDown={handleKeyDown}
              placeholder="Melbourne, VIC"
              className={errors.homeBase ? "border-destructive" : ""}
            />
            {errors.homeBase
              ? <p className="text-xs text-destructive">{errors.homeBase}</p>
              : <p className="text-xs text-muted-foreground">Where most of your trips start from</p>
            }
          </div>

          <div className="p-6 space-y-3">
            <div>
              <Label className="text-sm font-semibold text-foreground">What do you travel in?</Label>
              <p className="text-xs text-muted-foreground mt-0.5">We use this to estimate fuel costs</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {VEHICLE_OPTIONS.map(({ type, icon: Icon, desc }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setVehicleType(type)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    vehicleType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                  <span className="text-sm font-semibold">{type}</span>
                  <span className="text-xs opacity-70">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-6 space-y-2">
            <Label htmlFor="fuel-price" className="text-sm font-semibold text-foreground">
              Fuel Price ($/L)
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground font-medium">$</span>
              <Input
                id="fuel-price"
                type="number"
                min={0}
                step={0.01}
                value={fuelPrice}
                onChange={e => setFuelPrice(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-28"
              />
              <span className="text-xs text-muted-foreground">/L</span>
            </div>
            <p className="text-xs text-muted-foreground">You can update this for every run</p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Setting things up...
              </>
            ) : (
              "Build My First Run →"
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can edit everything later from your settings
          </p>
        </div>
      </div>
    </div>
  );
}
