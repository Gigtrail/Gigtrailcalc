import { Link } from "wouter";
import { cn } from "@/lib/utils";

interface UsageMeterProps {
  used: number;
  limit: number;
  label: string;
  upgradeHref?: string;
  className?: string;
}

export function UsageMeter({
  used,
  limit,
  label,
  upgradeHref = "/billing",
  className,
}: UsageMeterProps) {
  const pct = Math.min((used / limit) * 100, 100);
  const atLimit = used >= limit;
  const nearLimit = pct >= 80 && !atLimit;

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between text-xs">
        <span
          className={cn(
            "font-medium tabular-nums",
            atLimit ? "text-destructive" : nearLimit ? "text-amber-600" : "text-muted-foreground"
          )}
        >
          {used} of {limit} {label} used
        </span>
        {atLimit ? (
          <Link href={upgradeHref}>
            <button className="text-primary font-medium hover:underline underline-offset-2 focus:outline-none text-xs">
              Upgrade for more
            </button>
          </Link>
        ) : nearLimit ? (
          <Link href={upgradeHref}>
            <button className="text-amber-600 font-medium hover:underline underline-offset-2 focus:outline-none text-xs">
              Almost full
            </button>
          </Link>
        ) : null}
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            atLimit ? "bg-destructive" : nearLimit ? "bg-amber-500" : "bg-primary/50"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
