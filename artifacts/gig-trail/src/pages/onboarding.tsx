import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useCreateProfile } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePlan } from "@/hooks/use-plan";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { User, Users, Music2, Loader2, Lock, Zap } from "lucide-react";
import { STANDARD_VEHICLES } from "@/lib/garage-constants";
import { Link } from "wouter";

const ACT_TYPES = [
  { type: "Solo", icon: User, people: 1, desc: "Just you", locked: false },
  { type: "Duo", icon: Users, people: 2, desc: "Two of you", locked: false },
  { type: "Band", icon: Music2, people: 4, desc: "Full crew", locked: true },
];


function generateStarterMembers(actType: string): { bandMembersJson: string; activeMemberIdsJson: string } {
  const configs: Record<string, Array<{ name: string; role: string }>> = {
    Solo: [{ name: "You", role: "Performer" }],
    Duo: [{ name: "Member 1", role: "Performer" }, { name: "Member 2", role: "Performer" }],
    Band: [
      { name: "Member 1", role: "Performer" },
      { name: "Member 2", role: "Performer" },
      { name: "Member 3", role: "Performer" },
      { name: "Member 4", role: "Performer" },
    ],
  };
  const memberConfigs = configs[actType] ?? configs["Solo"];
  const members = memberConfigs.map((m, i) => ({
    id: `member-${i + 1}`,
    name: m.name,
    role: m.role,
    expectedGigFee: 0,
  }));
  return {
    bandMembersJson: JSON.stringify(members),
    activeMemberIdsJson: JSON.stringify(members.map(m => m.id)),
  };
}

export default function Onboarding() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { plan } = usePlan();
  const isPro = plan === "pro" || plan === "unlimited";

  const [actName, setActName] = useState("");
  const [actType, setActType] = useState("Solo");
  const [homeBase, setHomeBase] = useState("");
  const [homeBaseLat, setHomeBaseLat] = useState<number | undefined>(undefined);
  const [homeBaseLng, setHomeBaseLng] = useState<number | undefined>(undefined);
  const [vehicleType, setVehicleType] = useState("van");
  const [fuelPrice, setFuelPrice] = useState("2.00");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const actNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    actNameRef.current?.focus();
  }, []);

  const createProfile = useCreateProfile();

  const handleActTypeClick = (type: string, locked: boolean) => {
    if (locked && !isPro) {
      setShowUpgradeModal(true);
      return;
    }
    setActType(type);
  };

  const getPeopleCount = () => {
    const found = ACT_TYPES.find(a => a.type === actType);
    return found ? found.people : 1;
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!actName.trim()) errs.actName = "Please give your act a name";
    if (!homeBase.trim()) errs.homeBase = "Add your home base so we know where the run starts";
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
      const sv = STANDARD_VEHICLES.find(v => v.key === vehicleType) ?? STANDARD_VEHICLES[2];
      const parsedFuelPrice = parseFloat(fuelPrice) || 2.00;
      const peopleCount = getPeopleCount();

      const { bandMembersJson, activeMemberIdsJson } = generateStarterMembers(actType);

      const profile = await createProfile.mutateAsync({
        data: {
          name: actName.trim(),
          actType,
          peopleCount,
          homeBase: homeBase.trim(),
          homeBaseLat: homeBaseLat ?? null,
          homeBaseLng: homeBaseLng ?? null,
          vehicleType: sv.key,
          fuelConsumption: sv.fuelConsumptionL100km,
          defaultFuelPrice: parsedFuelPrice,
          avgAccomPerNight: 0,
          avgFoodPerDay: 0,
          bandMembers: bandMembersJson,
          activeMemberIds: activeMemberIdsJson,
        },
      });

      await queryClient.invalidateQueries();

      const params = new URLSearchParams({
        profileId: String(profile.id),
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
            className="h-16 w-auto mx-auto"
          />
          <h1 className="text-3xl font-bold text-foreground">Let's set up your profile</h1>
          <p className="text-muted-foreground text-sm">
            Takes about 30 seconds. We'll use this to personalise your calculator and build your starting profile.
          </p>
          <p className="text-xs text-muted-foreground/60">
            Don't worry — you can change everything later.
          </p>
        </div>

        <div className="bg-card border border-border/60 rounded-xl shadow-sm divide-y divide-border/40">

          {/* Act Name */}
          <div className="p-5 space-y-2">
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

          {/* Act Type */}
          <div className="p-5 space-y-3">
            <div>
              <Label className="text-sm font-semibold text-foreground">What kind of act are you?</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Affects how profit is split later</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {ACT_TYPES.map(({ type, icon: Icon, desc, locked }) => {
                const isLocked = locked && !isPro;
                const isSelected = actType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleActTypeClick(type, locked)}
                    className={`relative flex flex-col items-center gap-1.5 p-4 rounded-xl border-2 transition-all cursor-pointer ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : isLocked
                        ? "border-border/40 bg-background/50 text-muted-foreground/50 cursor-pointer"
                        : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                    }`}
                  >
                    {isLocked && (
                      <span className="absolute top-2 right-2 flex items-center gap-0.5 bg-accent/20 text-accent-foreground/70 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-accent/30">
                        <Lock className="w-2.5 h-2.5" />
                        Pro
                      </span>
                    )}
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-semibold">{type}</span>
                    <span className="text-xs opacity-60">{desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Home Base */}
          <div className="p-5 space-y-2">
            <Label htmlFor="home-base" className="text-sm font-semibold text-foreground">
              Home Base
            </Label>
            <PlacesAutocomplete
              id="home-base"
              value={homeBase}
              onChange={(text, place) => {
                setHomeBase(text);
                setHomeBaseLat(place?.lat);
                setHomeBaseLng(place?.lng);
                setErrors(p => ({ ...p, homeBase: "" }));
              }}
              onKeyDown={handleKeyDown}
              placeholder="Melbourne, VIC"
              className={errors.homeBase ? "border-destructive" : ""}
            />
            {errors.homeBase
              ? <p className="text-xs text-destructive">{errors.homeBase}</p>
              : <p className="text-xs text-muted-foreground">Where most of your trips start from</p>
            }
          </div>

          {/* Vehicle */}
          <div className="p-5 space-y-3">
            <div>
              <Label className="text-sm font-semibold text-foreground">What do you travel in?</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Standard presets — customise in Pro</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {STANDARD_VEHICLES.map((sv) => (
                <button
                  key={sv.key}
                  type="button"
                  onClick={() => setVehicleType(sv.key)}
                  className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 transition-all cursor-pointer text-left ${
                    vehicleType === sv.key
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 bg-background text-muted-foreground hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <sv.Icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm font-semibold">{sv.displayName}</span>
                  </div>
                  <span className="text-xs opacity-60 pl-0.5">{sv.fuelConsumptionL100km} L/100km</span>
                </button>
              ))}
            </div>
          </div>

          {/* Fuel Price */}
          <div className="p-5 space-y-2">
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

      {/* Upgrade Modal */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="max-w-sm bg-card border-border/60">
          <DialogHeader>
            <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center mb-2">
              <Zap className="w-5 h-5 text-accent" />
            </div>
            <DialogTitle className="text-lg font-bold">Band setups are on Pro</DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
              Upgrade to Pro to unlock Band act type, unlimited saved runs, the full tour builder, and more.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 pt-1">
            <Link href="/billing">
              <Button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
                Upgrade to Pro — AU$5/mo
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setShowUpgradeModal(false)}
            >
              Continue as Solo or Duo
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
