import { Shield, Lock, Eye, Trash2, BarChart3, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

function Section({
  icon: Icon,
  color,
  title,
  children,
}: {
  icon: React.ElementType;
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/50 bg-card/50">
      <CardContent className="p-6">
        <div className="flex gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-base">{title}</h3>
            <div className="text-sm text-muted-foreground leading-relaxed space-y-2">
              {children}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Privacy() {
  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in duration-500">

      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Privacy & Data</h1>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Plain-English explanation of how your touring data is handled. No jargon.
        </p>
      </div>

      <div className="space-y-4">

        <Section icon={Lock} color="bg-primary/10 text-primary" title="Your data is private to you">
          <p>
            Your tours, deal figures, venue history, and show income are visible only to you.
            We do not share your individual data with other users, venues, or anyone else.
          </p>
          <p>
            Every piece of information you enter — guarantees, ticket splits, accommodation costs —
            stays locked to your account.
          </p>
        </Section>

        <Section icon={BarChart3} color="bg-[#2E7D32]/10 text-[#2E7D32]" title="Aggregated insights">
          <p>
            We may use anonymised, aggregated data across users to improve product features —
            things like regional average fees or typical venue audience sizes.
          </p>
          <p>
            This aggregated data is never linked back to you personally. Your specific deal
            details are never exposed.
          </p>
        </Section>

        <Section icon={Eye} color="bg-accent/10 text-accent" title="No raw data sharing">
          <p>
            We never expose your specific deal details, income figures, or venue notes to other
            users or to venues themselves.
          </p>
          <p>
            Any future benchmarking features will use anonymised averages only — never individual
            records.
          </p>
        </Section>

        <Section icon={Trash2} color="bg-muted text-muted-foreground" title="You're in control">
          <p>
            You can edit or delete any of your data at any time — shows, venues, profiles,
            tours. Nothing is locked away.
          </p>
          <p>
            If you close your account, all your data is removed from our systems.
          </p>
        </Section>

        <Section icon={ChevronRight} color="bg-border text-muted-foreground" title="Why we collect this data">
          <p>
            The data you enter helps Gig Trail calculate your real touring costs, track
            profitability over time, and surface insights that help you make better decisions
            on the road.
          </p>
          <p>
            That's it. We're a tool for musicians — not a data broker.
          </p>
        </Section>

      </div>

      <div className="rounded-xl border border-border/40 bg-muted/30 p-5">
        <p className="text-sm text-muted-foreground leading-relaxed">
          <span className="font-medium text-foreground">Questions about your data?</span>{" "}
          Reach us at{" "}
          <a
            href="mailto:thegigtrail@gmail.com"
            className="text-primary hover:underline font-medium"
          >
            thegigtrail@gmail.com
          </a>{" "}
          and we'll get back to you straight away.
        </p>
      </div>

    </div>
  );
}
