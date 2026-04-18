import { useState, useRef } from "react";
import { Link } from "wouter";
import { Check, MapPin, Fuel, BedDouble, DollarSign, TrendingUp, Map, Calendar, Users, Zap, ArrowRight, Music2, Menu, X, Star } from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
// Update this to your Payhip product URL
const PAYHIP_URL = "https://thegigtrail.com/b/Upr79";

// ─── Design tokens (dark road theme) ─────────────────────────────────────────
const C = {
  bg:        "#0F0F0F",
  section:   "#1A1A1A",
  card:      "#141414",
  border:    "#2A2A2A",
  accent:    "#B8651E",
  accentHov: "#D27A2C",
  highlight: "#C58A2B",
  heading:   "#E8E1D9",
  body:      "#CFC7BE",
  muted:     "#6E6A63",
};

// ─── Inline style helpers ─────────────────────────────────────────────────────
const S = {
  page:       { backgroundColor: C.bg, color: C.body, fontFamily: "inherit", minHeight: "100vh" } as React.CSSProperties,
  nav:        { backgroundColor: C.bg + "F0", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.border}`, position: "sticky" as const, top: 0, zIndex: 50 } as React.CSSProperties,
  sectionDark:{ backgroundColor: C.section, borderTop: `1px solid ${C.border}` } as React.CSSProperties,
  card:       { backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 16 } as React.CSSProperties,
  btnPrimary: { backgroundColor: C.accent, color: "#fff", borderRadius: 8, fontWeight: 600, padding: "12px 24px", border: "none", cursor: "pointer", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8, transition: "background 0.15s" } as React.CSSProperties,
  btnOutline: { backgroundColor: "transparent", color: C.heading, borderRadius: 8, fontWeight: 500, padding: "11px 24px", border: `1px solid ${C.border}`, cursor: "pointer", fontSize: 15, display: "inline-flex", alignItems: "center", gap: 8, transition: "all 0.15s" } as React.CSSProperties,
  h1:         { color: C.heading, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.1 } as React.CSSProperties,
  h2:         { color: C.heading, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.2 } as React.CSSProperties,
  accent:     { color: C.accent } as React.CSSProperties,
  muted:      { color: C.muted, fontSize: 13 } as React.CSSProperties,
  label:      { color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const } as React.CSSProperties,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function Divider() {
  return <hr style={{ borderColor: C.border, margin: 0 }} />;
}

function ProblemCard({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div style={{ ...S.card, padding: "24px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: C.accent + "20", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} color={C.accent} />
      </div>
      <p style={{ color: C.body, lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div style={{ ...S.card, padding: "24px 20px" }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Icon size={16} color={C.accent} />
      </div>
      <p style={{ color: C.heading, fontWeight: 600, marginBottom: 6, margin: "0 0 6px" }}>{title}</p>
      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  );
}

// ─── Demo calculator screenshot mockup ───────────────────────────────────────

function CalculatorMockup({ compact = false }: { compact?: boolean }) {
  const rows = [
    { label: "Fuel cost",          value: "$147.60", icon: Fuel,      pos: true  },
    { label: "Accommodation",      value: "$120.00", icon: BedDouble, pos: true  },
    { label: "Guarantee fee",      value: "$400.00", icon: DollarSign,pos: true  },
    { label: "Total income",       value: "$400.00", icon: TrendingUp,pos: true  },
    { label: "Net profit",         value: "+$132.40",icon: TrendingUp,pos: true  },
  ];

  return (
    <div style={{
      backgroundColor: "#111",
      border: `1px solid ${C.border}`,
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: "0 24px 64px rgba(0,0,0,0.7)",
      maxWidth: compact ? 340 : 480,
      width: "100%",
    }}>
      {/* Window bar */}
      <div style={{ backgroundColor: "#1A1A1A", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FF5F57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FFBD2E" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#28C840" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ color: C.muted, fontSize: 11 }}>Gig Trail — Tour Calculator</span>
        </div>
      </div>

      {/* Result header */}
      <div style={{ padding: "20px 20px 12px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <MapPin size={13} color={C.muted} />
          <span style={{ color: C.muted, fontSize: 12 }}>Sydney → Melbourne · 875 km return</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: "#22c55e", fontSize: compact ? 28 : 34, fontWeight: 800, letterSpacing: "-0.02em" }}>+$132</span>
          <span style={{ color: C.muted, fontSize: 13 }}>net profit</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <span style={{ backgroundColor: "#22c55e20", color: "#22c55e", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6 }}>Worth it ✓</span>
          <span style={{ backgroundColor: C.accent + "20", color: C.accent, fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6 }}>33% margin</span>
        </div>
      </div>

      {/* Cost rows */}
      <div style={{ padding: "0 0 4px" }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${C.border}20` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <r.icon size={13} color={C.muted} />
              <span style={{ color: C.body, fontSize: 13 }}>{r.label}</span>
            </div>
            <span style={{ color: r.label === "Net profit" ? "#22c55e" : C.heading, fontWeight: r.label === "Net profit" ? 700 : 500, fontSize: 13, fontFamily: "monospace" }}>{r.value}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 20px", backgroundColor: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: C.muted, fontSize: 11 }}>Break-even: 14 tickets at $30</span>
        <span style={{ color: C.accent, fontSize: 11, fontWeight: 600 }}>2h 15m drive</span>
      </div>
    </div>
  );
}

// ─── Early Access Form ────────────────────────────────────────────────────────

function EarlyAccessForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [band, setBand] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error" | "already">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setState("loading");
    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), bandName: band.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "Something went wrong");
        setState("error");
      } else if (data.alreadyRegistered) {
        setState("already");
      } else {
        setState("success");
      }
    } catch {
      setErrorMsg("Network error — please try again");
      setState("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#1A1A1A",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    color: C.heading,
    padding: "12px 14px",
    fontSize: 14,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  if (state === "success") {
    return (
      <div style={{ textAlign: "center", padding: "32px 24px", ...S.card }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎸</div>
        <p style={{ color: C.heading, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>You're in!</p>
        <p style={{ color: C.muted, fontSize: 14 }}>We'll be in touch when new features drop. Thanks for being part of the build.</p>
      </div>
    );
  }

  if (state === "already") {
    return (
      <div style={{ textAlign: "center", padding: "32px 24px", ...S.card }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
        <p style={{ color: C.heading, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>You're already signed up!</p>
        <p style={{ color: C.muted, fontSize: 14 }}>We already have you on the list. We'll be in touch.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...S.card, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>Your Name *</label>
        <input
          type="text"
          required
          placeholder="Alex"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>Email Address *</label>
        <input
          type="email"
          required
          placeholder="alex@band.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>Artist / Band Name</label>
        <input
          type="text"
          placeholder="The Lucky Ones"
          value={band}
          onChange={(e) => setBand(e.target.value)}
          style={inputStyle}
        />
      </div>
      {state === "error" && (
        <p style={{ color: "#ef4444", fontSize: 13, margin: 0 }}>{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={state === "loading"}
        style={{ ...S.btnPrimary, justifyContent: "center", opacity: state === "loading" ? 0.7 : 1 }}
      >
        {state === "loading" ? "Sending…" : "Join Early Access"}
        {state !== "loading" && <ArrowRight size={15} />}
      </button>
      <p style={{ color: C.muted, fontSize: 12, textAlign: "center", margin: 0 }}>No spam. Just product updates.</p>
    </form>
  );
}

// ─── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  const [open, setOpen] = useState(false);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setOpen(false);
  }

  const links = [
    { label: "Calculator", action: () => scrollTo("calculator") },
    { label: "Touring Guide", href: PAYHIP_URL },
    { label: "Join Beta", action: () => scrollTo("early-access") },
  ];

  return (
    <nav style={S.nav}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/">
          <img src="/gig-trail-logo.png" alt="Gig Trail" style={{ height: 36, objectFit: "contain" }} />
        </Link>

        {/* Desktop links */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }} className="gt-nav-desktop">
          {links.map((l) => (
            l.href ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                style={{ color: C.muted, fontSize: 14, fontWeight: 500, padding: "8px 12px", textDecoration: "none", borderRadius: 6 }}>
                {l.label}
              </a>
            ) : (
              <button key={l.label} onClick={l.action}
                style={{ color: C.muted, fontSize: 14, fontWeight: 500, padding: "8px 12px", background: "none", border: "none", cursor: "pointer", borderRadius: 6 }}>
                {l.label}
              </button>
            )
          ))}
          <Link href="/sign-in">
            <button style={{ ...S.btnOutline, padding: "8px 18px", fontSize: 14 }}>Sign In</button>
          </Link>
          <Link href="/sign-up">
            <button style={{ ...S.btnPrimary, padding: "8px 18px", fontSize: 14 }}>Try for free</button>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button
          className="gt-nav-mobile"
          onClick={() => setOpen(!open)}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.heading, padding: 8 }}
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "12px 24px 20px", display: "flex", flexDirection: "column", gap: 4 }} className="gt-nav-mobile">
          {links.map((l) => (
            l.href ? (
              <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
                style={{ color: C.body, fontSize: 15, padding: "10px 0", textDecoration: "none", borderBottom: `1px solid ${C.border}20` }}>
                {l.label}
              </a>
            ) : (
              <button key={l.label} onClick={l.action}
                style={{ color: C.body, fontSize: 15, padding: "10px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}20` }}>
                {l.label}
              </button>
            )
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Link href="/sign-in" style={{ flex: 1 }}>
              <button style={{ ...S.btnOutline, width: "100%", justifyContent: "center" }}>Sign In</button>
            </Link>
            <Link href="/sign-up" style={{ flex: 1 }}>
              <button style={{ ...S.btnPrimary, width: "100%", justifyContent: "center" }}>Try free</button>
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Main landing page ────────────────────────────────────────────────────────

export default function Landing() {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  function imgError(key: string) {
    setImgErrors((prev) => ({ ...prev, [key]: true }));
  }

  const heroImg = "/images/product/calculator-overview.jpg";
  const resultsImg = "/images/product/calculator-results.jpg";

  return (
    <div style={S.page}>
      <style>{`
        .gt-nav-desktop { display: flex !important; }
        .gt-nav-mobile { display: none !important; }
        @media (max-width: 768px) {
          .gt-nav-desktop { display: none !important; }
          .gt-nav-mobile { display: flex !important; }
          .gt-hero-grid { grid-template-columns: 1fr !important; }
          .gt-3col { grid-template-columns: 1fr !important; }
          .gt-2col { grid-template-columns: 1fr !important; }
          .gt-ebook-grid { flex-direction: column !important; }
        }
      `}</style>

      <Nav />

      {/* ── 1. HERO ── */}
      <section style={{ padding: "80px 24px 72px", maxWidth: 1200, margin: "0 auto" }}>
        <div
          className="gt-hero-grid"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}
        >
          <div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, backgroundColor: C.accent + "18", border: `1px solid ${C.accent}40`, borderRadius: 20, padding: "6px 14px", marginBottom: 24 }}>
              <Music2 size={12} color={C.accent} />
              <span style={{ color: C.accent, fontSize: 12, fontWeight: 600 }}>Built by a working touring musician</span>
            </div>
            <h1 style={{ ...S.h1, fontSize: "clamp(36px, 5vw, 56px)", marginBottom: 20 }}>
              Know if your gigs are worth it
              <span style={{ ...S.accent }}> before you lock them in</span>
            </h1>
            <p style={{ color: C.body, fontSize: 18, lineHeight: 1.65, marginBottom: 36, maxWidth: 480 }}>
              Fuel, fees, accommodation… it adds up fast. Gig Trail helps musicians work out if a show or tour actually makes sense before they commit.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
              <Link href="/sign-up">
                <button style={{ ...S.btnPrimary, fontSize: 16, padding: "14px 28px" }}>
                  Try the Tour Calculator <ArrowRight size={16} />
                </button>
              </Link>
              <a href={PAYHIP_URL} target="_blank" rel="noopener noreferrer">
                <button style={{ ...S.btnOutline, fontSize: 16, padding: "14px 28px" }}>
                  Get the Touring Guide
                </button>
              </a>
            </div>
            <p style={{ ...S.muted }}>Free to start · No credit card needed</p>
          </div>

          {/* Screenshot / mockup */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            {!imgErrors[heroImg] ? (
              <img
                src={heroImg}
                alt="Gig Trail Calculator"
                onError={() => imgError(heroImg)}
                style={{ borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.6)", maxWidth: "100%", border: `1px solid ${C.border}` }}
              />
            ) : (
              <CalculatorMockup />
            )}
          </div>
        </div>
      </section>

      <Divider />

      {/* ── 2. PROBLEM ── */}
      <section style={{ ...S.sectionDark, padding: "72px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={S.label}>The Problem</p>
            <h2 style={{ ...S.h2, fontSize: "clamp(28px, 4vw, 42px)", marginTop: 12 }}>
              Most tours feel like guesswork
            </h2>
          </div>
          <div
            className="gt-3col"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
          >
            <ProblemCard icon={Fuel}      text="Fuel, accommodation and fees add up quickly — and it's hard to see the full picture until after the fact." />
            <ProblemCard icon={DollarSign} text="Hard to know if a show is actually worth doing until you do the maths — which most musicians never have time for." />
            <ProblemCard icon={Music2}    text="Most business tools aren't built for independent musicians touring regional areas on lean margins." />
          </div>
        </div>
      </section>

      <Divider />

      {/* ── 3. TOUR CALCULATOR ── */}
      <section id="calculator" style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div
            className="gt-hero-grid"
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}
          >
            <div>
              <p style={S.label}>The Tool</p>
              <h2 style={{ ...S.h2, fontSize: "clamp(28px, 4vw, 42px)", marginTop: 12, marginBottom: 16 }}>
                Start with the Tour Calculator
              </h2>
              <p style={{ color: C.body, fontSize: 17, lineHeight: 1.65, marginBottom: 28 }}>
                A simple tool to test your shows before you commit.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 36px", display: "flex", flexDirection: "column", gap: 12 }}>
                {[
                  "Calculate real touring costs — fuel, accommodation, fees",
                  "See break-even ticket numbers instantly",
                  "Compare guarantee vs door split scenarios",
                  "Plan smarter runs with actual numbers",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, color: C.body, fontSize: 15, lineHeight: 1.5 }}>
                    <Check size={16} color={C.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <Link href="/sign-up">
                <button style={{ ...S.btnPrimary, fontSize: 15 }}>
                  Try the Tour Calculator <ArrowRight size={15} />
                </button>
              </Link>
            </div>

            <div style={{ display: "flex", justifyContent: "center" }}>
              {!imgErrors[resultsImg] ? (
                <img
                  src={resultsImg}
                  alt="Calculator results breakdown"
                  onError={() => imgError(resultsImg)}
                  style={{ borderRadius: 20, boxShadow: "0 24px 64px rgba(0,0,0,0.6)", maxWidth: "100%", border: `1px solid ${C.border}` }}
                />
              ) : (
                <CalculatorMockup compact />
              )}
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── 4. EBOOK ── */}
      <section style={{ ...S.sectionDark, padding: "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ ...S.card, padding: "40px", display: "flex", gap: 48, alignItems: "center" }} className="gt-ebook-grid">

            {/* Book image */}
            <div style={{ flexShrink: 0 }}>
              <div style={{
                width: 140, height: 200,
                background: `linear-gradient(135deg, ${C.accent}, ${C.highlight})`,
                borderRadius: 8, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: 16, gap: 8,
                boxShadow: "4px 4px 20px rgba(0,0,0,0.5)",
              }}>
                <Music2 size={28} color="#fff" />
                <p style={{ color: "#fff", fontSize: 10, fontWeight: 700, textAlign: "center", letterSpacing: "0.05em", margin: 0, lineHeight: 1.4 }}>
                  THE MUSICIAN'S GUIDE TO BOOKING GIGS & TOURING
                </p>
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.label}>Ebook</p>
              <h2 style={{ ...S.h2, fontSize: "clamp(20px, 3vw, 28px)", margin: "10px 0 12px" }}>
                The Musician's Guide to Booking Gigs and Touring Australia
              </h2>
              <p style={{ color: C.body, fontSize: 15, lineHeight: 1.6, marginBottom: 20 }}>
                A practical guide to booking gigs, planning tours, and making it work on the road.
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  "How to book gigs that actually pay",
                  "Touring strategies that work in regional areas",
                  "Avoid costly mistakes before you leave home",
                  "Real-world advice from the road",
                ].map((item) => (
                  <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, color: C.body, fontSize: 14, lineHeight: 1.5 }}>
                    <Check size={14} color={C.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                    {item}
                  </li>
                ))}
              </ul>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
                <a href={PAYHIP_URL} target="_blank" rel="noopener noreferrer">
                  <button style={{ ...S.btnPrimary }}>
                    Get the Touring Guide <ArrowRight size={14} />
                  </button>
                </a>
                <p style={{ ...S.muted, margin: 0 }}>Instant download via Payhip</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── 5. EARLY ACCESS ── */}
      <section id="early-access" style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <p style={S.label}>Early Access</p>
          <h2 style={{ ...S.h2, fontSize: "clamp(28px, 4vw, 40px)", margin: "12px 0 14px" }}>
            Help shape Gig Trail
          </h2>
          <p style={{ color: C.body, fontSize: 16, lineHeight: 1.65, marginBottom: 40 }}>
            We're building this for working musicians. Sign up to get early access to new features and give us feedback on what matters most.
          </p>
          <EarlyAccessForm />
        </div>
      </section>

      <Divider />

      {/* ── 6. FUTURE ── */}
      <section style={{ ...S.sectionDark, padding: "72px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={S.label}>What's Coming</p>
            <h2 style={{ ...S.h2, fontSize: "clamp(26px, 4vw, 38px)", marginTop: 12 }}>
              Built for where touring is heading
            </h2>
          </div>
          <div
            className="gt-3col"
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}
          >
            <FeatureCard icon={Map}      title="Venue database"       text="A growing directory of venues with historical data on fees, draw, and value for touring acts." />
            <FeatureCard icon={Calendar} title="Tour tracking"        text="Log your actual results against projections. See how each show performed and learn from each run." />
            <FeatureCard icon={Users}    title="Band & crew planning" text="Split costs and income across your crew. Know what everyone takes home before you load the van." />
            <FeatureCard icon={Zap}      title="Booking workflows"    text="Streamlined tools for reaching out to venues, tracking conversations, and confirming shows." />
            <FeatureCard icon={TrendingUp} title="Profit analytics"   text="See trends across your tours. Which routes work? Which venues pay? Know your numbers." />
            <FeatureCard icon={Star}     title="Route optimisation"   text="Smarter tour routing to reduce dead kilometres and maximise income per day on the road." />
          </div>
        </div>
      </section>

      <Divider />

      {/* ── 7. FOUNDER ── */}
      <section style={{ padding: "72px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: C.accent + "20", border: `1px solid ${C.accent}40`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <Music2 size={24} color={C.accent} />
          </div>
          <p style={S.label}>The Story</p>
          <h2 style={{ ...S.h2, fontSize: "clamp(24px, 3.5vw, 36px)", margin: "12px 0 20px" }}>
            Built on the road
          </h2>
          <p style={{ color: C.body, fontSize: 17, lineHeight: 1.75, maxWidth: 540, margin: "0 auto" }}>
            Gig Trail is being built by a working musician trying to make touring more sustainable and less of a guessing game. Every feature comes from a real problem on the road.
          </p>
        </div>
      </section>

      <Divider />

      {/* ── 8. FINAL CTA ── */}
      <section style={{ ...S.sectionDark, padding: "80px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <h2 style={{ ...S.h2, fontSize: "clamp(26px, 4vw, 40px)", marginBottom: 16 }}>
            Make better touring decisions<br />before you lock it in
          </h2>
          <p style={{ color: C.body, fontSize: 16, marginBottom: 36 }}>
            Free to start. No credit card needed.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <Link href="/sign-up">
              <button style={{ ...S.btnPrimary, fontSize: 16, padding: "14px 28px" }}>
                Try the Tour Calculator <ArrowRight size={16} />
              </button>
            </Link>
            <a href={PAYHIP_URL} target="_blank" rel="noopener noreferrer">
              <button style={{ ...S.btnOutline, fontSize: 16, padding: "14px 28px" }}>
                Get the Touring Guide
              </button>
            </a>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "28px 24px", backgroundColor: C.bg }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <img src="/gig-trail-logo.png" alt="Gig Trail" style={{ height: 28, opacity: 0.7 }} />
          <p style={{ ...S.muted, margin: 0 }}>Helping musicians make smarter decisions on the road.</p>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/sign-in"><span style={{ ...S.muted, cursor: "pointer", textDecoration: "none" }}>Sign In</span></Link>
            <Link href="/sign-up"><span style={{ ...S.muted, cursor: "pointer", textDecoration: "none" }}>Get Started</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
