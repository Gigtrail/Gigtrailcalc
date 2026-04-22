import { useEffect, useRef, type ComponentType, type ReactNode } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth, useUser } from "@clerk/react";
import { initAnalytics, identifyUser, resetAnalytics, trackEvent } from "@/lib/analytics";
import { usePlan } from "@/hooks/use-plan";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import Landing from "@/pages/landing";
import SignInPage from "@/pages/sign-in";
import SignUpPage from "@/pages/sign-up";
import Dashboard from "@/pages/dashboard";
import Billing from "@/pages/billing";
import Profiles from "@/pages/profiles";
import ProfileForm from "@/pages/profile-form";

import Runs from "@/pages/runs";
import RunForm from "@/pages/run-form";
import RunDetail from "@/pages/run-detail";
import RunResults from "@/pages/run-results";
import Tours from "@/pages/tours";
import TourForm from "@/pages/tour-form";
import TourDetail from "@/pages/tour-detail";
import TourStopForm from "@/pages/tour-stop-form";
import VenueDetail from "@/pages/venue-detail";
import Venues from "@/pages/venues";
import Garage from "@/pages/vehicles";
import GarageVehicleForm from "@/pages/vehicle-form";
import Onboarding from "@/pages/onboarding";
import Privacy from "@/pages/privacy";
import Feedback from "@/pages/feedback";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";
import { useGetProfiles, setAuthTokenGetter } from "@workspace/api-client-react";
import { findFirstCompleteProfile } from "@/lib/profile-setup";

function ClerkTokenProvider() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// NOTE: in dev this env var will be empty, in prod it will be automatically set
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Clerk passes full paths to routerPush/routerReplace, but wouter's
// setLocation prepends the base — strip it to avoid doubling.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't retry 4xx (client errors) — those won't recover.
      // Only retry network/5xx once to avoid hammering the server.
      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number; response?: { status?: number } })?.status
          ?? (error as { response?: { status?: number } })?.response?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      retryDelay: 1500,
      refetchOnWindowFocus: false,
    },
  },
});

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// Fires login_completed once per browser tab session (cleared on sign-out).
const LOGIN_TRACKED_KEY = "gt_login_tracked";

function AnalyticsIdentifier() {
  const { user, isSignedIn } = useUser();
  const { role, accessSource } = usePlan();
  const prevUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    initAnalytics();
  }, []);

  useEffect(() => {
    if (isSignedIn && user?.id) {
      identifyUser(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        role,
        access_source: accessSource,
      });
      // Fire login_completed once per browser session (not on every page refresh)
      if (!sessionStorage.getItem(LOGIN_TRACKED_KEY)) {
        trackEvent("login_completed");
        sessionStorage.setItem(LOGIN_TRACKED_KEY, "1");
      }
      prevUserIdRef.current = user.id;
    } else if (!isSignedIn && prevUserIdRef.current) {
      resetAnalytics();
      sessionStorage.removeItem(LOGIN_TRACKED_KEY);
      prevUserIdRef.current = null;
    }
  }, [isSignedIn, user?.id, role, accessSource]);

  return null;
}

function SignedInRedirect() {
  const { data: profiles, isLoading } = useGetProfiles();

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  const completeProfile = findFirstCompleteProfile(profiles);

  if (!completeProfile) {
    return <Redirect to="/onboarding" />;
  }

  return <Redirect to={`/runs/new?profileId=${completeProfile.id}`} />;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <SignedInRedirect />
      </Show>
      <Show when="signed-out">
        <Landing />
      </Show>
    </>
  );
}

function RequireCompletedProfile({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: profiles, isLoading } = useGetProfiles();

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (findFirstCompleteProfile(profiles)) {
    return <>{children}</>;
  }

  const params = new URLSearchParams();
  const returnTo =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : location;
  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  return <Redirect to={`/onboarding${params.toString() ? `?${params.toString()}` : ""}`} />;
}

function ProtectedRoute({
  component: Component,
  allowIncompleteProfile = false,
}: {
  component: ComponentType;
  allowIncompleteProfile?: boolean;
}) {
  return (
    <>
      <Show when="signed-in">
        {allowIncompleteProfile ? (
          <Layout>
            <Component />
          </Layout>
        ) : (
          <RequireCompletedProfile>
            <Layout>
              <Component />
            </Layout>
          </RequireCompletedProfile>
        )}
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedFullPage({
  component: Component,
  allowIncompleteProfile = false,
}: {
  component: ComponentType;
  allowIncompleteProfile?: boolean;
}) {
  return (
    <>
      <Show when="signed-in">
        {allowIncompleteProfile ? (
          <Component />
        ) : (
          <RequireCompletedProfile>
            <Component />
          </RequireCompletedProfile>
        )}
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function NewProfileRedirect() {
  return <Redirect to="/onboarding?start=1" />;
}

function OnboardingRoutePage() {
  const { data: profiles, isLoading } = useGetProfiles();

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  const completeProfile = findFirstCompleteProfile(profiles);
  if (completeProfile) {
    return <Redirect to={`/runs/new?profileId=${completeProfile.id}`} />;
  }

  return <Onboarding />;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl || undefined}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkTokenProvider />
        <ClerkQueryClientCacheInvalidator />
        <AnalyticsIdentifier />
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboarding">
              {() => <ProtectedFullPage component={OnboardingRoutePage} allowIncompleteProfile />}
            </Route>
            <Route path="/dashboard">
              {() => <ProtectedRoute component={Dashboard} />}
            </Route>
            <Route path="/billing">
              {() => <ProtectedRoute component={Billing} allowIncompleteProfile />}
            </Route>
            <Route path="/privacy">
              {() => <ProtectedRoute component={Privacy} allowIncompleteProfile />}
            </Route>
            <Route path="/feedback">
              {() => <ProtectedRoute component={Feedback} allowIncompleteProfile />}
            </Route>
            <Route path="/admin">
              {() => <ProtectedRoute component={Admin} />}
            </Route>
            <Route path="/profiles">
              {() => <ProtectedRoute component={Profiles} />}
            </Route>
            <Route path="/profiles/new">
              {() => <ProtectedFullPage component={NewProfileRedirect} allowIncompleteProfile />}
            </Route>
            <Route path="/profiles/:id/edit">
              {() => <ProtectedRoute component={ProfileForm} allowIncompleteProfile />}
            </Route>
            <Route path="/garage">
              {() => <ProtectedRoute component={Garage} />}
            </Route>
            <Route path="/garage/new">
              {() => <ProtectedRoute component={GarageVehicleForm} />}
            </Route>
            <Route path="/garage/:id/edit">
              {() => <ProtectedRoute component={GarageVehicleForm} />}
            </Route>

            <Route path="/runs">
              {() => <ProtectedRoute component={Runs} />}
            </Route>
            <Route path="/runs/new">
              {() => <ProtectedRoute component={RunForm} />}
            </Route>
            <Route path="/runs/results">
              {() => <ProtectedRoute component={RunResults} />}
            </Route>
            <Route path="/runs/:id/edit">
              {() => <ProtectedRoute component={RunForm} />}
            </Route>
            <Route path="/runs/:id">
              {() => <ProtectedRoute component={RunDetail} />}
            </Route>
            <Route path="/tours">
              {() => <ProtectedRoute component={Tours} />}
            </Route>
            <Route path="/tours/new">
              {() => <ProtectedRoute component={TourForm} />}
            </Route>
            <Route path="/tours/:id/edit">
              {() => <ProtectedRoute component={TourForm} />}
            </Route>
            <Route path="/tours/:id/stops/new">
              {() => <ProtectedRoute component={TourStopForm} />}
            </Route>
            <Route path="/tours/:id/stops/:stopId/edit">
              {() => <ProtectedRoute component={TourStopForm} />}
            </Route>
            <Route path="/tours/:id">
              {() => <ProtectedRoute component={TourDetail} />}
            </Route>
            <Route path="/venues">
              {() => <ProtectedRoute component={Venues} />}
            </Route>
            <Route path="/venues/:id">
              {() => <ProtectedRoute component={VenueDetail} />}
            </Route>
            <Route component={NotFound} />
          </Switch>
        </TooltipProvider>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
