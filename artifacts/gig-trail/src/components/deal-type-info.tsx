import { Banknote, Ticket, Scale } from "lucide-react";

interface DealTypeInfoProps {
  showType: string | null | undefined;
}

const INFO: Record<
  string,
  {
    icon: React.ElementType;
    headline: string;
    detail: string;
    bestFor: string;
    bullets: string[];
  }
> = {
  "Flat Fee": {
    icon: Banknote,
    headline: "You get paid a fixed amount regardless of ticket sales.",
    detail: "Your fee is agreed upfront — no surprises on the night.",
    bestFor: "Guaranteed income and low risk.",
    bullets: [
      "The venue offers a set fee",
      "You want predictable income",
      "You're playing a support slot or short set",
    ],
  },
  "Ticketed Show": {
    icon: Ticket,
    headline: "Your income depends on ticket sales.",
    detail:
      "You earn a percentage of ticket revenue after fees are deducted.",
    bestFor: "Higher potential earnings when turnout is strong.",
    bullets: [
      "You're headlining and expect solid attendance",
      "The venue has a strong ticketing track record",
      "You want upside if the show sells well",
    ],
  },
  Hybrid: {
    icon: Scale,
    headline:
      "You get a guaranteed minimum, or a share of ticket sales — whichever is higher.",
    detail:
      "The guarantee acts as your floor. If the door beats it, you take the door instead.",
    bestFor: "Balancing risk and upside.",
    bullets: [
      "You want a safety net but still benefit from good turnout",
      "You're established enough to negotiate a floor",
      "The show could go either way on attendance",
    ],
  },
};

export function DealTypeInfo({ showType }: DealTypeInfoProps) {
  if (!showType) return null;
  const info = INFO[showType];
  if (!info) return null;

  const Icon = info.icon;

  return (
    <div className="rounded-lg bg-muted/50 border border-border/40 px-4 py-3 space-y-2.5">
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 text-primary shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground leading-snug">
            {info.headline}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {info.detail}
          </p>
        </div>
      </div>

      <div className="pl-6.5 space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Best for: <span className="font-normal normal-case tracking-normal">{info.bestFor}</span>
        </p>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Use this when:
        </p>
        <ul className="space-y-0.5">
          {info.bullets.map((b) => (
            <li key={b} className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <span className="text-primary shrink-0 mt-0.5">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
