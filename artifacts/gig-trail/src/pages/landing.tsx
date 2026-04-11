import { Link } from "wouter";
import { Map, Navigation, TrendingUp, Shield, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <img
          src="/gig-trail-logo.png"
          alt="The Gig Trail"
          className="h-12 w-auto"
        />
        <div className="flex gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" className="text-muted-foreground hover:text-foreground">Sign In</Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">Get Started Free</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 space-y-24">
        <section className="text-center space-y-8 pt-10 pb-4">
          <div className="flex justify-center">
            <img
              src="/gig-trail-logo.png"
              alt="The Gig Trail"
              className="w-56 h-56 object-contain drop-shadow-[0_0_50px_rgba(184,97,27,0.45)]"
            />
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-bold tracking-tight leading-tight">
              Is this gig worth<br />
              <span className="text-primary">the drive?</span>
            </h2>
            <p className="text-muted-foreground text-xl max-w-2xl mx-auto leading-relaxed">
              Calculate the real cost of any show or tour. Factor in fuel, accommodation, food,
              marketing, and more — then see exactly what lands in your pocket.
            </p>
          </div>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/sign-up">
              <Button size="lg" className="bg-primary hover:bg-primary/90 text-primary-foreground px-8">
                Start for free
              </Button>
            </Link>
            <Link href="/sign-in">
              <Button size="lg" variant="outline" className="px-8 border-border/60">
                Sign in
              </Button>
            </Link>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Map,
              title: "Single Show Calculator",
              desc: "Enter a flat fee, ticketed show, or hybrid deal. Get instant net profit, break-even analysis, and per-member split.",
            },
            {
              icon: Navigation,
              title: "Tour Builder",
              desc: "Plan multi-stop tours with automatic routing and fuel estimates. See the full financial picture before you commit.",
            },
            {
              icon: TrendingUp,
              title: "Smart Financials",
              desc: "Track income, expenses, fuel, accommodation, food, and marketing across every show. Know your real numbers.",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <Card key={title} className="bg-card border-border/40">
              <CardContent className="p-6 space-y-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">{title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-8">
          <h2 className="text-3xl font-bold text-center">Simple, honest pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                name: "Free",
                price: "AU$0",
                period: "forever",
                features: ["1 act profile", "1 vehicle", "Single show calculator", "5 saved calculations"],
                cta: "Get started",
                href: "/sign-up",
                highlight: false,
              },
              {
                name: "Pro",
                price: "AU$5",
                period: "per month",
                features: ["1 act profile", "Unlimited saved runs", "Full tour builder", "Ticketed show tools", "Marketing cost tracking", "Routing & fuel estimates"],
                cta: "Go Pro",
                href: "/sign-up",
                highlight: true,
              },
              {
                name: "Unlimited Bands",
                price: "AU$7.99",
                period: "per month",
                features: ["Unlimited profiles", "Unlimited vehicles", "Everything in Pro", "Manage multiple acts"],
                cta: "Go Unlimited",
                href: "/sign-up",
                highlight: false,
              },
            ].map(({ name, price, period, features, cta, href, highlight }) => (
              <Card key={name} className={`border ${highlight ? "border-primary bg-primary/5" : "border-border/40 bg-card"}`}>
                <CardContent className="p-6 space-y-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">{name}</div>
                    <div className="text-3xl font-bold text-foreground mt-1">{price}</div>
                    <div className="text-sm text-muted-foreground">{period}</div>
                  </div>
                  <ul className="space-y-2">
                    {features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Zap className="w-3.5 h-3.5 text-accent shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link href={href}>
                    <Button className={`w-full ${highlight ? "bg-primary hover:bg-primary/90 text-primary-foreground" : ""}`} variant={highlight ? "default" : "outline"}>
                      {cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="text-center space-y-4 pb-16">
          <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
            <Shield className="w-4 h-4" />
            Secure payments via Stripe · Cancel anytime
          </div>
          <p className="text-muted-foreground text-sm">
            Your existing data is never deleted on downgrade — you just lose access to over-limit items until you upgrade again.
          </p>
        </section>
      </main>
    </div>
  );
}
