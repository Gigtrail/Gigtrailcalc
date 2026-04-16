import { Lock, Zap } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FEATURE_REGISTRY, type PlanFeature } from "@/lib/plan-limits";

interface UpgradeCTAProps {
  feature: PlanFeature;
  variant?: "inline" | "banner" | "card";
  className?: string;
}

export function UpgradeCTA({
  feature,
  variant = "inline",
  className,
}: UpgradeCTAProps) {
  const info = FEATURE_REGISTRY[feature];

  if (variant === "inline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 text-xs text-muted-foreground",
          className
        )}
      >
        <Lock className="w-3 h-3 flex-shrink-0 opacity-60" />
        <span>{info.proUnlock}</span>
        <Link href="/billing">
          <button className="text-primary font-medium hover:underline underline-offset-2 focus:outline-none">
            Upgrade to Pro
          </button>
        </Link>
      </span>
    );
  }

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3",
          className
        )}
      >
        <Zap className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground leading-snug">
            {info.proUnlock}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {info.proDescription}
          </p>
        </div>
        <Button asChild size="sm" className="flex-shrink-0 h-8 text-xs px-3">
          <Link href="/billing">Upgrade</Link>
        </Button>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <Link href="/billing">
        <div
          className={cn(
            "group h-full min-h-[180px] flex flex-col items-center justify-center rounded-xl",
            "border-2 border-dashed border-border/40 hover:border-primary/40 hover:bg-primary/5",
            "transition-all cursor-pointer p-8 text-center",
            className
          )}
        >
          <div className="w-10 h-10 rounded-full bg-muted/50 group-hover:bg-primary/10 flex items-center justify-center mb-3 transition-colors">
            <Lock className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <p className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors leading-snug">
            {info.proUnlock}
          </p>
          <p className="text-xs text-muted-foreground mt-1.5 opacity-70 leading-relaxed max-w-[160px]">
            {info.freeLimit} on the free plan
          </p>
          <span className="mt-3 text-xs font-medium text-primary opacity-0 group-hover:opacity-100 transition-opacity">
            See Pro plans →
          </span>
        </div>
      </Link>
    );
  }

  return null;
}
