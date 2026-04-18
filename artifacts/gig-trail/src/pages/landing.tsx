import { useState } from "react";
import { Link } from "wouter";
import { Check, Fuel, BedDouble, DollarSign, TrendingUp, Map, Calendar, Users, Zap, ArrowRight, Music2, Menu, X, Star, ChevronDown, MapPin } from "lucide-react";

// ─── Config ───────────────────────────────────────────────────────────────────
const PAYHIP_URL = "https://thegigtrail.com/b/Upr79";

// ─── Design tokens (parchment / vintage road) ─────────────────────────────────
const C = {
  bg:        "#EADFCF",
  bgAlt:     "#DDD3BC",
  bgDeep:    "#D0C5AF",
  card:      "#F2EBE0",
  cardAlt:   "#E8DFD0",
  border:    "#C4B49A",
  borderLight:"#D9CEBA",
  accent:    "#B8651E",
  accentHov: "#9A5418",
  highlight: "#C58A2B",
  heading:   "#2C1A0E",
  body:      "#4A3728",
  muted:     "#8B7355",
  mutedLight:"#A89070",
};

// ─── CSS grain texture (SVG noise injected as background-image) ────────────────
const grainBg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='0.045'/%3E%3C/svg%3E")`;

// ─── Style helpers ─────────────────────────────────────────────────────────────
const S = {
  page:    {
    backgroundColor: C.bg,
    backgroundImage: grainBg,
    color: C.body,
    fontFamily: "inherit",
    minHeight: "100vh",
  } as React.CSSProperties,
  nav: {
    backgroundColor: C.bg + "F4",
    backdropFilter: "blur(10px)",
    borderBottom: `1px solid ${C.border}`,
    position: "sticky" as const,
    top: 0,
    zIndex: 50,
  } as React.CSSProperties,
  sectionAlt: {
    backgroundColor: C.bgAlt,
    backgroundImage: grainBg,
    borderTop: `1px solid ${C.borderLight}`,
    borderBottom: `1px solid ${C.borderLight}`,
  } as React.CSSProperties,
  sectionDeep: {
    backgroundColor: C.bgDeep,
    backgroundImage: grainBg,
    borderTop: `1px solid ${C.border}`,
    borderBottom: `1px solid ${C.border}`,
  } as React.CSSProperties,
  card: {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(44,26,14,0.08)",
  } as React.CSSProperties,
  btnPrimary: {
    backgroundColor: C.accent,
    color: "#fff",
    borderRadius: 6,
    fontWeight: 700,
    padding: "13px 26px",
    border: "none",
    cursor: "pointer",
    fontSize: 15,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    letterSpacing: "0.01em",
    boxShadow: "0 2px 8px rgba(184,101,30,0.35)",
  } as React.CSSProperties,
  btnOutline: {
    backgroundColor: "transparent",
    color: C.heading,
    borderRadius: 6,
    fontWeight: 600,
    padding: "12px 26px",
    border: `1.5px solid ${C.border}`,
    cursor: "pointer",
    fontSize: 15,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } as React.CSSProperties,
  h1:    { color: C.heading, fontWeight: 800, letterSpacing: "-0.025em", lineHeight: 1.15 } as React.CSSProperties,
  h2:    { color: C.heading, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 } as React.CSSProperties,
  label: { color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" as const } as React.CSSProperties,
};

// ─── Ornamental divider ───────────────────────────────────────────────────────

function OrnaDivider({ label }: { label?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "0 24px", maxWidth: label ? 600 : "100%", margin: "0 auto" }}>
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${C.border})` }} />
      {label ? (
        <span style={{ color: C.muted, fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{label}</span>
      ) : (
        <span style={{ color: C.border, fontSize: 16, lineHeight: 1 }}>✦</span>
      )}
      <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${C.border})` }} />
    </div>
  );
}

// ─── Section divider (full-width) ────────────────────────────────────────────
function SectionDivider() {
  return (
    <div style={{ padding: "12px 24px" }}>
      <OrnaDivider />
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function ProblemCard({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div style={{ ...S.card, padding: "24px 20px", display: "flex", alignItems: "flex-start", gap: 16 }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: C.accent + "18", border: `1px solid ${C.accent}30`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <Icon size={18} color={C.accent} />
      </div>
      <p style={{ color: C.body, lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, text }: { icon: React.ElementType; title: string; text: string }) {
  return (
    <div style={{ ...S.card, padding: "24px 20px" }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: C.accent + "15", border: `1px solid ${C.accent}25`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Icon size={16} color={C.accent} />
      </div>
      <p style={{ color: C.heading, fontWeight: 600, marginBottom: 6, margin: "0 0 6px" }}>{title}</p>
      <p style={{ color: C.muted, fontSize: 13, lineHeight: 1.6, margin: 0 }}>{text}</p>
    </div>
  );
}

// ─── Calculator mockup (used in lower sections) ───────────────────────────────

function CalculatorMockup({ compact = false }: { compact?: boolean }) {
  const rows = [
    { label: "Fuel cost",    value: "$147.60", icon: Fuel       },
    { label: "Accommodation",value: "$120.00", icon: BedDouble  },
    { label: "Guarantee fee",value: "$400.00", icon: DollarSign },
    { label: "Total income", value: "$400.00", icon: TrendingUp },
    { label: "Net profit",   value: "+$132.40",icon: TrendingUp },
  ];

  return (
    <div style={{
      backgroundColor: "#111",
      border: `1px solid #2A2A2A`,
      borderRadius: 20,
      overflow: "hidden",
      boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
      maxWidth: compact ? 340 : 480,
      width: "100%",
    }}>
      <div style={{ backgroundColor: "#1A1A1A", padding: "10px 16px", display: "flex", alignItems: "center", gap: 6, borderBottom: "1px solid #2A2A2A" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FF5F57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#FFBD2E" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#28C840" }} />
        <div style={{ flex: 1, textAlign: "center" }}>
          <span style={{ color: "#6E6A63", fontSize: 11 }}>Gig Trail — Tour Calculator</span>
        </div>
      </div>
      <div style={{ padding: "20px 20px 12px", borderBottom: "1px solid #2A2A2A20" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <MapPin size={13} color="#6E6A63" />
          <span style={{ color: "#6E6A63", fontSize: 12 }}>Sydney → Melbourne · 875 km return</span>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: "#22c55e", fontSize: compact ? 28 : 34, fontWeight: 800, letterSpacing: "-0.02em" }}>+$132</span>
          <span style={{ color: "#6E6A63", fontSize: 13 }}>net profit</span>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <span style={{ backgroundColor: "#22c55e20", color: "#22c55e", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6 }}>Worth it ✓</span>
          <span style={{ backgroundColor: "#B8651E20", color: "#B8651E", fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 6 }}>33% margin</span>
        </div>
      </div>
      <div style={{ padding: "0 0 4px" }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: "1px solid #2A2A2A18" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <r.icon size={13} color="#6E6A63" />
              <span style={{ color: "#CFC7BE", fontSize: 13 }}>{r.label}</span>
            </div>
            <span style={{ color: r.label === "Net profit" ? "#22c55e" : "#E8E1D9", fontWeight: r.label === "Net profit" ? 700 : 500, fontSize: 13, fontFamily: "monospace" }}>{r.value}</span>
          </div>
        ))}
      </div>
      <div style={{ padding: "12px 20px", backgroundColor: "#0D0D0D", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "#6E6A63", fontSize: 11 }}>Break-even: 14 tickets at $30</span>
        <span style={{ color: "#B8651E", fontSize: 11, fontWeight: 600 }}>2h 15m drive</span>
      </div>
    </div>
  );
}

// ─── Early Access Form ────────────────────────────────────────────────────────

function EarlyAccessForm() {
  const [name, setName]   = useState("");
  const [email, setEmail] = useState("");
  const [band, setBand]   = useState("");
  const [state, setState] = useState<"idle" | "loading" | "success" | "error" | "already">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setState("loading");
    try {
      const res  = await fetch("/api/early-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), email: email.trim(), bandName: band.trim() || undefined }) });
      const data = await res.json();
      if (!res.ok)               { setErrorMsg(data.error ?? "Something went wrong"); setState("error"); }
      else if (data.alreadyRegistered) setState("already");
      else                             setState("success");
    } catch {
      setErrorMsg("Network error — please try again"); setState("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: C.card,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.heading,
    padding: "12px 14px",
    fontSize: 14,
    width: "100%",
    outline: "none",
    boxSizing: "border-box",
  };

  if (state === "success") return (
    <div style={{ textAlign: "center", padding: "32px 24px", ...S.card }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎸</div>
      <p style={{ color: C.heading, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>You're in!</p>
      <p style={{ color: C.muted, fontSize: 14 }}>We'll be in touch when new features drop. Thanks for being part of the build.</p>
    </div>
  );

  if (state === "already") return (
    <div style={{ textAlign: "center", padding: "32px 24px", ...S.card }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
      <p style={{ color: C.heading, fontWeight: 700, fontSize: 18, marginBottom: 8 }}>You're already signed up!</p>
      <p style={{ color: C.muted, fontSize: 14 }}>We already have you on the list. We'll be in touch.</p>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ ...S.card, padding: 28, display: "flex", flexDirection: "column", gap: 14 }}>
      {[
        { label: "Your Name *", type: "text",  placeholder: "Alex",          val: name,  set: setName,  req: true },
        { label: "Email Address *", type: "email", placeholder: "alex@band.com", val: email, set: setEmail, req: true },
        { label: "Artist / Band Name", type: "text",  placeholder: "The Lucky Ones", val: band,  set: setBand,  req: false },
      ].map(({ label, type, placeholder, val, set, req }) => (
        <div key={label} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ color: C.muted, fontSize: 12, fontWeight: 600 }}>{label}</label>
          <input type={type} required={req} placeholder={placeholder} value={val} onChange={(e) => set(e.target.value)} style={inputStyle} />
        </div>
      ))}
      {state === "error" && <p style={{ color: "#c0392b", fontSize: 13, margin: 0 }}>{errorMsg}</p>}
      <button type="submit" disabled={state === "loading"} style={{ ...S.btnPrimary, justifyContent: "center", opacity: state === "loading" ? 0.7 : 1 }}>
        {state === "loading" ? "Sending…" : "Join Early Access"}{state !== "loading" && <ArrowRight size={15} />}
      </button>
      <p style={{ color: C.muted, fontSize: 12, textAlign: "center", margin: 0 }}>No spam. Just product updates.</p>
    </form>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

function Nav() {
  const [open, setOpen] = useState(false);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setOpen(false);
  }

  const links = [
    { label: "Calculator",    action: () => scrollTo("calculator") },
    { label: "Touring Guide", href: PAYHIP_URL },
    { label: "Join Beta",     action: () => scrollTo("early-access") },
  ];

  return (
    <nav style={S.nav}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 58, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Link href="/">
          <img src="/gig-trail-logo.png" alt="Gig Trail" style={{ height: 34, objectFit: "contain" }} />
        </Link>

        {/* Desktop */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }} className="gt-nav-desktop">
          {links.map((l) => l.href ? (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              style={{ color: C.muted, fontSize: 14, fontWeight: 500, padding: "8px 12px", textDecoration: "none" }}>
              {l.label}
            </a>
          ) : (
            <button key={l.label} onClick={l.action}
              style={{ color: C.muted, fontSize: 14, fontWeight: 500, padding: "8px 12px", background: "none", border: "none", cursor: "pointer" }}>
              {l.label}
            </button>
          ))}
          <span style={{ color: C.border, margin: "0 4px" }}>|</span>
          <Link href="/sign-in">
            <button style={{ ...S.btnOutline, padding: "7px 16px", fontSize: 14 }}>Sign In</button>
          </Link>
          <Link href="/sign-up">
            <button style={{ ...S.btnPrimary, padding: "7px 16px", fontSize: 14 }}>Try for free</button>
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button className="gt-nav-mobile" onClick={() => setOpen(!open)}
          style={{ background: "none", border: "none", cursor: "pointer", color: C.heading, padding: 8 }}>
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: "12px 24px 20px", backgroundColor: C.bg, display: "flex", flexDirection: "column", gap: 4 }} className="gt-nav-mobile">
          {links.map((l) => l.href ? (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              style={{ color: C.body, fontSize: 15, padding: "10px 0", textDecoration: "none", borderBottom: `1px solid ${C.borderLight}` }}>
              {l.label}
            </a>
          ) : (
            <button key={l.label} onClick={l.action}
              style={{ color: C.body, fontSize: 15, padding: "10px 0", background: "none", border: "none", cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.borderLight}` }}>
              {l.label}
            </button>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Link href="/sign-in" style={{ flex: 1 }}><button style={{ ...S.btnOutline, width: "100%", justifyContent: "center" }}>Sign In</button></Link>
            <Link href="/sign-up" style={{ flex: 1 }}><button style={{ ...S.btnPrimary, width: "100%", justifyContent: "center" }}>Try free</button></Link>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Landing page ─────────────────────────────────────────────────────────────

export default function Landing() {
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});
  function imgError(key: string) { setImgErrors((p) => ({ ...p, [key]: true })); }
  const resultsImg = "/images/product/calculator-results.jpg";

  return (
    <div style={S.page}>
      <style>{`
        .gt-nav-desktop { display: flex !important; }
        .gt-nav-mobile  { display: none !important; }
        @media (max-width: 768px) {
          .gt-nav-desktop { display: none !important; }
          .gt-nav-mobile  { display: flex !important; }
          .gt-hero-grid   { grid-template-columns: 1fr !important; }
          .gt-3col        { grid-template-columns: 1fr !important; }
          .gt-ebook-grid  { flex-direction: column !important; }
        }
      `}</style>

      <Nav />

      {/* ── 1. HERO (centered / logo-focused) ── */}
      <section style={{ padding: "64px 24px 56px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>

          {/* Decorative rule + logo */}
          <div style={{ marginBottom: 20 }}>
            <OrnaDivider />
          </div>

          {/* Logo */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
            <img
              src="/gig-trail-hero-logo.png"
              alt="The Gig Trail"
              style={{ width: "clamp(300px, 52vw, 500px)", height: "auto", filter: "drop-shadow(0 4px 20px rgba(44,26,14,0.22))" }}
            />
          </div>

          {/* Ornamental rule below logo */}
          <div style={{ marginBottom: 32 }}>
            <OrnaDivider label="Tour Calculator" />
          </div>

          {/* Headline */}
          <h1 style={{ ...S.h1, fontSize: "clamp(28px, 4.5vw, 48px)", marginBottom: 18 }}>
            Know if your gigs are worth it<br />
            <span style={{ color: C.accent }}>before you lock them in</span>
          </h1>

          {/* Subtext */}
          <p style={{ color: C.body, fontSize: 18, lineHeight: 1.65, marginBottom: 36, maxWidth: 520, margin: "0 auto 36px" }}>
            Fuel, fees, accommodation… it adds up fast.
          </p>

          {/* CTA buttons */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 28 }}>
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

          <p style={{ color: C.mutedLight, fontSize: 13 }}>Free to start · No credit card needed</p>

          {/* Scroll indicator */}
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span style={{ color: C.muted, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Scroll down to get started</span>
            <ChevronDown size={18} color={C.muted} style={{ animation: "gt-bounce 2s ease-in-out infinite" }} />
          </div>
        </div>
      </section>

      <style>{`
        @keyframes gt-bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(5px); }
        }
      `}</style>

      <SectionDivider />

      {/* ── 2. PROBLEM ── */}
      <section style={{ ...S.sectionAlt, padding: "68px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={S.label}>The Problem</p>
            <h2 style={{ ...S.h2, fontSize: "clamp(26px, 4vw, 40px)", marginTop: 12 }}>
              Most tours feel like guesswork
            </h2>
          </div>
          <div className="gt-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <ProblemCard icon={Fuel}       text="Fuel, accommodation and fees add up quickly — and it's hard to see the full picture until after the fact." />
            <ProblemCard icon={DollarSign} text="Hard to know if a show is actually worth doing until you do the maths — which most musicians never have time for." />
            <ProblemCard icon={Music2}     text="Most business tools aren't built for independent musicians touring regional areas on lean margins." />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── 3. TOUR CALCULATOR ── */}
      <section id="calculator" style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div className="gt-hero-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 64, alignItems: "center" }}>
            <div>
              <p style={S.label}>The Tool</p>
              <h2 style={{ ...S.h2, fontSize: "clamp(26px, 4vw, 40px)", marginTop: 12, marginBottom: 16 }}>
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
                  style={{ borderRadius: 16, boxShadow: "0 16px 48px rgba(44,26,14,0.22)", maxWidth: "100%", border: `1px solid ${C.border}` }}
                />
              ) : (
                <CalculatorMockup compact />
              )}
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── 4. EBOOK ── */}
      <section style={{ ...S.sectionAlt, padding: "80px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ ...S.card, padding: "40px", display: "flex", gap: 48, alignItems: "center" }} className="gt-ebook-grid">
            <div style={{ flexShrink: 0 }}>
              <div style={{
                width: 140, height: 200,
                background: `linear-gradient(135deg, ${C.accent}, ${C.highlight})`,
                borderRadius: 8, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", padding: 16, gap: 8,
                boxShadow: "4px 6px 20px rgba(44,26,14,0.3)",
              }}>
                <Music2 size={28} color="#fff" />
                <p style={{ color: "#fff", fontSize: 10, fontWeight: 700, textAlign: "center", letterSpacing: "0.06em", margin: 0, lineHeight: 1.4 }}>
                  THE MUSICIAN'S GUIDE TO BOOKING GIGS & TOURING
                </p>
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={S.label}>Ebook</p>
              <h2 style={{ ...S.h2, fontSize: "clamp(20px, 3vw, 26px)", margin: "10px 0 12px" }}>
                The Musician's Guide to Booking Gigs and Touring Australia
              </h2>
              <p style={{ color: C.body, fontSize: 15, lineHeight: 1.65, marginBottom: 20 }}>
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
                  <button style={S.btnPrimary}>Get the Touring Guide <ArrowRight size={14} /></button>
                </a>
                <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Instant download via Payhip</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── 5. EARLY ACCESS ── */}
      <section id="early-access" style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <p style={S.label}>Early Access</p>
          <h2 style={{ ...S.h2, fontSize: "clamp(26px, 4vw, 38px)", margin: "12px 0 14px" }}>
            Help shape Gig Trail
          </h2>
          <p style={{ color: C.body, fontSize: 16, lineHeight: 1.65, marginBottom: 40 }}>
            We're building this for working musicians. Sign up to get early access to new features and give us feedback on what matters most.
          </p>
          <EarlyAccessForm />
        </div>
      </section>

      <SectionDivider />

      {/* ── 6. FUTURE ── */}
      <section style={{ ...S.sectionDeep, padding: "72px 24px" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <p style={S.label}>What's Coming</p>
            <h2 style={{ ...S.h2, fontSize: "clamp(24px, 4vw, 36px)", marginTop: 12 }}>
              Built for where touring is heading
            </h2>
          </div>
          <div className="gt-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <FeatureCard icon={Map}        title="Venue database"      text="A growing directory of venues with historical data on fees, draw, and value for touring acts." />
            <FeatureCard icon={Calendar}   title="Tour tracking"       text="Log your actual results against projections. See how each show performed and learn from each run." />
            <FeatureCard icon={Users}      title="Band & crew planning" text="Split costs and income across your crew. Know what everyone takes home before you load the van." />
            <FeatureCard icon={Zap}        title="Booking workflows"   text="Streamlined tools for reaching out to venues, tracking conversations, and confirming shows." />
            <FeatureCard icon={TrendingUp} title="Profit analytics"    text="See trends across your tours. Which routes work? Which venues pay? Know your numbers." />
            <FeatureCard icon={Star}       title="Route optimisation"  text="Smarter tour routing to reduce dead kilometres and maximise income per day on the road." />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── 7. FOUNDER ── */}
      <section style={{ padding: "72px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", backgroundColor: C.accent + "18", border: `1px solid ${C.accent}35`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
            <Music2 size={24} color={C.accent} />
          </div>
          <p style={S.label}>The Story</p>
          <h2 style={{ ...S.h2, fontSize: "clamp(22px, 3.5vw, 34px)", margin: "12px 0 20px" }}>
            Built on the road
          </h2>
          <p style={{ color: C.body, fontSize: 17, lineHeight: 1.75, maxWidth: 520, margin: "0 auto" }}>
            Gig Trail is being built by a working musician trying to make touring more sustainable and less of a guessing game. Every feature comes from a real problem on the road.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* ── 8. FINAL CTA ── */}
      <section style={{ ...S.sectionDeep, padding: "80px 24px", textAlign: "center" }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <OrnaDivider />
          <h2 style={{ ...S.h2, fontSize: "clamp(24px, 4vw, 38px)", margin: "32px 0 14px" }}>
            Make better touring decisions<br />before you lock it in
          </h2>
          <p style={{ color: C.body, fontSize: 16, marginBottom: 36 }}>Free to start. No credit card needed.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <Link href="/sign-up">
              <button style={{ ...S.btnPrimary, fontSize: 16, padding: "14px 28px" }}>
                Try the Tour Calculator <ArrowRight size={16} />
              </button>
            </Link>
            <a href={PAYHIP_URL} target="_blank" rel="noopener noreferrer">
              <button style={{ ...S.btnOutline, fontSize: 16, padding: "14px 28px" }}>Get the Touring Guide</button>
            </a>
          </div>
          <div style={{ marginTop: 40 }}>
            <OrnaDivider />
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: "24px 24px", backgroundColor: C.bgDeep, backgroundImage: grainBg }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <img src="/gig-trail-logo.png" alt="Gig Trail" style={{ height: 26, opacity: 0.7 }} />
          <p style={{ color: C.muted, fontSize: 13, margin: 0 }}>Helping musicians make smarter decisions on the road.</p>
          <div style={{ display: "flex", gap: 16 }}>
            <Link href="/sign-in"><span style={{ color: C.muted, cursor: "pointer", fontSize: 13 }}>Sign In</span></Link>
            <Link href="/sign-up"><span style={{ color: C.muted, cursor: "pointer", fontSize: 13 }}>Get Started</span></Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
