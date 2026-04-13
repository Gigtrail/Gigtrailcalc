import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Check, Shield } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="px-6 py-4 flex items-center justify-between max-w-4xl mx-auto w-full">
        <img src="/gig-trail-logo.png" alt="The Gig Trail" className="h-10 w-auto" />
        <Link href="/sign-in">
          <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-sm">
            Sign In
          </Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-2xl mx-auto w-full text-center space-y-16">

        <section className="space-y-8">
          <div className="space-y-4">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-[1.1]">
              Is this gig worth<br />
              <span className="text-primary">the drive?</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-sm mx-auto">
              Work out fuel, costs, and profit in seconds.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up">
              <Button
                size="lg"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-10 h-12 text-base font-semibold w-full sm:w-auto"
              >
                Start a Run
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button
                size="lg"
                variant="ghost"
                className="text-muted-foreground hover:text-foreground px-8 h-12 w-full sm:w-auto"
              >
                Sign in →
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground/60 text-sm">Free to start · No credit card needed</p>
        </section>

        <section className="w-full space-y-6" id="plans">
          <p className="text-xs uppercase tracking-widest text-muted-foreground/50 font-medium">Plans</p>
          <div className="grid sm:grid-cols-2 gap-px bg-border/30 rounded-xl overflow-hidden border border-border/30 max-w-xl mx-auto w-full">
            {[
              {
                name: "Free",
                tagline: "Try it out",
                price: "AU$0",
                period: null,
                features: [
                  "5 free calcs/week",
                  "1 act · 1 vehicle",
                  "5 saved shows",
                  "Basic calculator",
                ],
                cta: "Get started",
                highlight: false,
                badge: null,
              },
              {
                name: "Pro",
                tagline: "Plan smarter tours",
                price: "AU$12",
                period: "/mo",
                yearlyNote: "or AU$79/year — best value",
                features: [
                  "Unlimited calculations",
                  "Multiple vehicles",
                  "Accommodation automation",
                  "Full profit breakdowns",
                ],
                cta: "Go Pro",
                highlight: true,
                badge: "Most popular",
              },
            ].map(({ name, tagline, price, period, yearlyNote, features, cta, highlight, badge }) => (
              <div
                key={name}
                className={`flex flex-col gap-4 p-6 relative ${
                  highlight ? "bg-primary/8" : "bg-card"
                }`}
              >
                {badge && (
                  <div className="absolute top-0 right-0">
                    <span className="text-[10px] font-semibold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-bl-lg">
                      {badge}
                    </span>
                  </div>
                )}
                <div>
                  <div className={`text-xs font-semibold uppercase tracking-wider mb-0.5 ${highlight ? "text-primary" : "text-muted-foreground"}`}>
                    {name}
                  </div>
                  <div className="text-xs text-muted-foreground/60 mb-2">{tagline}</div>
                  <div className="flex items-baseline gap-0.5">
                    <span className="text-xl font-bold text-foreground">{price}</span>
                    {period && <span className="text-xs text-muted-foreground">{period}</span>}
                  </div>
                  {"yearlyNote" in { yearlyNote } && yearlyNote && (
                    <div className="text-[11px] text-muted-foreground/70 mt-0.5">{yearlyNote}</div>
                  )}
                </div>
                <ul className="space-y-1.5 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href="/sign-up">
                  <Button
                    size="sm"
                    variant={highlight ? "default" : "ghost"}
                    className={`w-full text-sm ${highlight ? "bg-primary hover:bg-primary/90 text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/50">
            <Shield className="w-3 h-3" />
            Secure payments via Stripe · Cancel anytime
          </p>
        </section>
      </main>
    </div>
  );
}
