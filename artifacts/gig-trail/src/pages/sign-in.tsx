import { SignIn } from "@clerk/react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function SignInPage() {
  // To update login providers, app branding, or OAuth settings use the Auth
  // pane in the workspace toolbar.
  return (
    <div className="min-h-screen bg-background dark flex flex-col items-center justify-center gap-6 p-4">
      <img
        src="/gig-trail-logo.png"
        alt="The Gig Trail"
        className="h-28 w-auto object-contain"
      />
      {/* path must be the full browser path — Clerk reads window.location.pathname directly */}
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}
