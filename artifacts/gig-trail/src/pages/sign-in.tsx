import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar. More information can be found in the Replit docs.
  return (
    <div className="min-h-screen bg-background dark flex flex-col items-center justify-center gap-4 p-4">
      <div className="text-center mb-2">
        <h1 className="text-2xl font-bold text-primary">Gig Trail</h1>
        <p className="text-muted-foreground text-sm mt-1">Sign in to your account</p>
      </div>
      {/* path must be the full browser path — Clerk reads window.location.pathname directly */}
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}
