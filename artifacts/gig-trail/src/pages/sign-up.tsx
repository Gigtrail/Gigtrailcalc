import { useState, useRef } from "react";
import { SignUp } from "@clerk/react";
import { CheckCircle2, XCircle, Loader2, Tag } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROMO_SESSION_KEY } from "@/hooks/use-plan";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignUpPage() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"idle" | "validating" | "valid" | "invalid">("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const lastValidated = useRef("");

  const handleBlur = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed || trimmed === lastValidated.current) return;
    lastValidated.current = trimmed;
    setStatus("validating");
    try {
      const res = await fetch(`/api/promo-codes/validate?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.valid) {
        setStatus("valid");
        setStatusMsg(`Code accepted — ${data.grantsRole === "tester" ? "Tester access" : data.grantsRole === "pro" ? "Pro access" : data.grantsRole} will be applied to your account.`);
        sessionStorage.setItem(PROMO_SESSION_KEY, trimmed);
      } else {
        setStatus("invalid");
        setStatusMsg(data.error ?? "Promo code not recognised");
        sessionStorage.removeItem(PROMO_SESSION_KEY);
      }
    } catch {
      setStatus("idle");
      sessionStorage.removeItem(PROMO_SESSION_KEY);
    }
  };

  const handleChange = (val: string) => {
    const upper = val.toUpperCase();
    setCode(upper);
    if (status !== "idle") {
      setStatus("idle");
      setStatusMsg("");
    }
    if (!upper.trim()) {
      sessionStorage.removeItem(PROMO_SESSION_KEY);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 p-4">
      <img
        src="/gig-trail-logo.png"
        alt="The Gig Trail"
        className="h-28 w-auto object-contain"
      />

      {/* Promo code field — above Clerk widget */}
      <div className="w-full max-w-sm space-y-1.5">
        <Label className="text-sm font-medium flex items-center gap-1.5 text-foreground">
          <Tag className="w-3.5 h-3.5" />
          Promo Code <span className="text-muted-foreground font-normal">(optional)</span>
        </Label>
        <div className="relative">
          <Input
            placeholder="e.g. TESTER101"
            value={code}
            onChange={e => handleChange(e.target.value)}
            onBlur={handleBlur}
            className={
              status === "valid"
                ? "border-green-500 focus-visible:ring-green-500"
                : status === "invalid"
                ? "border-destructive focus-visible:ring-destructive"
                : ""
            }
          />
          {status === "validating" && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
          )}
          {status === "valid" && (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
          )}
          {status === "invalid" && (
            <XCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-destructive" />
          )}
        </div>
        {statusMsg && (
          <p className={`text-xs ${status === "valid" ? "text-green-600" : "text-destructive"}`}>
            {statusMsg}
          </p>
        )}
      </div>

      {/* path must be the full browser path — Clerk reads window.location.pathname directly */}
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}
