import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Profiles from "@/pages/profiles";
import ProfileForm from "@/pages/profile-form";
import Vehicles from "@/pages/vehicles";
import VehicleForm from "@/pages/vehicle-form";
import Runs from "@/pages/runs";
import RunForm from "@/pages/run-form";
import RunDetail from "@/pages/run-detail";
import Tours from "@/pages/tours";
import TourForm from "@/pages/tour-form";
import TourDetail from "@/pages/tour-detail";
import TourStopForm from "@/pages/tour-stop-form";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/profiles" component={Profiles} />
        <Route path="/profiles/new" component={ProfileForm} />
        <Route path="/profiles/:id/edit" component={ProfileForm} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/vehicles/new" component={VehicleForm} />
        <Route path="/vehicles/:id/edit" component={VehicleForm} />
        <Route path="/runs" component={Runs} />
        <Route path="/runs/new" component={RunForm} />
        <Route path="/runs/:id/edit" component={RunForm} />
        <Route path="/runs/:id" component={RunDetail} />
        <Route path="/tours" component={Tours} />
        <Route path="/tours/new" component={TourForm} />
        <Route path="/tours/:id/edit" component={TourForm} />
        <Route path="/tours/:id/stops/new" component={TourStopForm} />
        <Route path="/tours/:id/stops/:stopId/edit" component={TourStopForm} />
        <Route path="/tours/:id" component={TourDetail} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
