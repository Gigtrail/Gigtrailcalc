import { useState } from "react";
import { Banknote, Ticket, Scale } from "lucide-react";

interface DealTypeInfoProps {
  showType: string | null | undefined;
}

const INFO: Record<
  string,
  {
    icon: React.ElementType;
    summary: string;
    headline: string;
    detail: string;
    bestFor: string;
    bullets: string[];
  }
> = {
  "Flat Fee": {
    icon: Banknote,
    summary: "Fixed amount regardless of ticket sales.",
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
    summary: "Your earnings depend on ticket sales.",
    headline: "Your income depends on ticket sales.",
    detail: "You earn a percentage of ticket revenue after fees are deducted.",
    bestFor: "Higher potential earnings when turnout is strong.",
    bullets: [
      "You're headlining and expect solid attendance",
      "The venue has a strong ticketing track record",
      "You want upside if the show sells well",
    ],
  },
  Hybrid: {
    icon: Scale,
    summary: "Guaranteed minimum or door share — whichever is higher.",
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
  const [expanded, setExpanded] = useState(false);

  if (!showType) return null;
  const info = INFO[showType];
  if (!info) return null;

  const Icon = info.icon;

  return (
    <div className="rounded-lg bg-muted/50 border border-border/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs text-muted-foreground flex-1 leading-snug">
          {info.summary}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-primary hover:underline shrink-0 ml-1"
        >
          {expanded ? "Less info" : "More info"}
        </button>
      </div>

      <div
        className={`grid transition-all duration-200 ease-in-out ${
          expanded ? "grid-rows-[1fr] mt-2.5" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="space-y-2 pb-0.5">
            <p className="text-xs font-medium text-foreground leading-snug">
              {info.headline}
            </p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {info.detail}
            </p>
            <p className="text-[11px] text-muted-foreground">
              <span className="font-semibold">Best for: </span>
              {info.bestFor}
            </p>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground mb-0.5">
                Use this when:
              </p>
              <ul className="space-y-0.5">
                {info.bullets.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground"
                  >
                    <span className="text-primary shrink-0 mt-0.5">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
