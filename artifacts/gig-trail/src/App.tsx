import { useEffect, useRef } from "react";
import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth } from "@clerk/react";
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
import Onboarding from "@/pages/onboarding";
import NotFound from "@/pages/not-found";
import { useGetProfiles, setAuthTokenGetter } from "@workspace/api-client-react";

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

const queryClient = new QueryClient();

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

function SignedInRedirect() {
  const { data: profiles, isLoading } = useGetProfiles();

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (!profiles || profiles.length === 0) {
    return <Redirect to="/onboarding" />;
  }

  return <Redirect to="/dashboard" />;
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

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ProtectedFullPage({ component: Component }: { component: React.ComponentType }) {
  return (
    <>
      <Show when="signed-in">
        <Component />
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
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
        <TooltipProvider>
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />
            <Route path="/onboarding">
              {() => <ProtectedFullPage component={Onboarding} />}
            </Route>
            <Route path="/dashboard">
              {() => <ProtectedRoute component={Dashboard} />}
            </Route>
            <Route path="/billing">
              {() => <ProtectedRoute component={Billing} />}
            </Route>
            <Route path="/profiles">
              {() => <ProtectedRoute component={Profiles} />}
            </Route>
            <Route path="/profiles/new">
              {() => <ProtectedRoute component={ProfileForm} />}
            </Route>
            <Route path="/profiles/:id/edit">
              {() => <ProtectedRoute component={ProfileForm} />}
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
