import { useLocation, useParams } from "wouter";
import { useGetRun, useGetProfile, useGetVehicle } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, Map, Edit, TrendingUp, AlertTriangle, XCircle, Truck, Users, Receipt, Calendar } from "lucide-react";
import { format } from "date-fns";

export default function RunDetail() {
  const [, setLocation] = useLocation();
  const { id } = useParams();
  const runId = parseInt(id || "0");
  
  const { data: run, isLoading: isLoadingRun } = useGetRun(runId, {
    query: { enabled: !!runId, queryKey: ['run', runId] }
  });

  const { data: profile } = useGetProfile(run?.profileId || 0, {
    query: { enabled: !!run?.profileId, queryKey: ['profile', run?.profileId] }
  });

  const { data: vehicle } = useGetVehicle(run?.vehicleId || 0, {
    query: { enabled: !!run?.vehicleId, queryKey: ['vehicle', run?.vehicleId] }
  });

  if (isLoadingRun) {
    return <div className="p-8 text-center text-muted-foreground">Loading run details...</div>;
  }

  if (!run) {
    return <div className="p-8 text-center text-muted-foreground">Run not found.</div>;
  }

  const getStatusInfo = () => {
    const profit = run.totalProfit || 0;
    const income = run.totalIncome || 0;
    
    if (income === 0) {
      return profit > 0 
        ? { text: "Worth the Drive", color: "text-green-500 bg-green-500/10 border-green-500/20", icon: TrendingUp }
        : { text: "Probably Not Worth It", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: XCircle };
    }
    
    const margin = profit / income;
    if (margin > 0.2) return { text: "Worth the Drive", color: "text-green-500 bg-green-500/10 border-green-500/20", icon: TrendingUp };
    if (profit > 0) return { text: "Tight Margins", color: "text-amber-500 bg-amber-500/10 border-amber-500/20", icon: AlertTriangle };
    return { text: "Probably Not Worth It", color: "text-red-500 bg-red-500/10 border-red-500/20", icon: XCircle };
  };

  const status = getStatusInfo();
  const isTicketed = run.showType === "Ticketed Show" || run.showType === "Hybrid";

  return (
    <div className="space-y-6 animate-in fade-in duration-500 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/runs")} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{run.origin} → {run.destination}</h1>
            <p className="text-muted-foreground mt-1 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> {format(new Date(run.createdAt), 'MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setLocation(`/runs/${runId}/edit`)}>
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" /> Act Profile
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{profile?.name || "None"}</div>
                {profile && <div className="text-sm text-muted-foreground mt-1">{profile.peopleCount} members</div>}
              </CardContent>
            </Card>
            
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
                  <Truck className="w-4 h-4" /> Vehicle
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold">{vehicle?.name || "None"}</div>
                {vehicle && <div className="text-sm text-muted-foreground mt-1">{vehicle.avgConsumption}L/100km</div>}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/50 bg-card/50">
            <CardHeader>
              <CardTitle>The Trail</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Distance</div>
                  <div className="font-semibold">{run.distanceKm} km {run.returnTrip ? '(x2)' : ''}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Fuel Price</div>
                  <div className="font-semibold">${run.fuelPrice}/L</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Show Type</div>
                  <div className="font-semibold">{run.showType}</div>
                </div>
                {isTicketed && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Deal</div>
                    <div className="font-semibold capitalize">{run.dealType} {run.splitPct ? `(${run.splitPct}%)` : ''}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary" /> Income</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {run.showType === "Flat Fee" && (
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Fee</span>
                    <span className="font-medium">${run.fee?.toLocaleString()}</span>
                  </div>
                )}
                {isTicketed && (
                  <>
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Est. Tickets ({run.expectedAttendancePct}%)</span>
                      <span className="font-medium">{Math.floor((run.capacity || 0) * ((run.expectedAttendancePct || 0)/100))}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/40 pb-2">
                      <span className="text-muted-foreground">Ticket Price</span>
                      <span className="font-medium">${run.ticketPrice}</span>
                    </div>
                    {run.showType === "Hybrid" && (
                      <div className="flex justify-between border-b border-border/40 pb-2">
                        <span className="text-muted-foreground">Guarantee</span>
                        <span className="font-medium">${run.guarantee?.toLocaleString()}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Merch</span>
                  <span className="font-medium">${run.merchEstimate?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span className="font-bold">Total Income</span>
                  <span className="font-bold text-primary">${run.totalIncome?.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5 text-destructive" /> Expenses</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Fuel</span>
                  <span className="font-medium">${((run.totalCost || 0) - (run.accommodationCost || 0) - (run.foodCost || 0) - (run.extraCosts || 0) - (run.marketingCost || 0)).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Accommodation</span>
                  <span className="font-medium">${run.accommodationCost?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">Food</span>
                  <span className="font-medium">${run.foodCost?.toLocaleString()}</span>
                </div>
                {isTicketed && run.marketingCost! > 0 && (
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Marketing</span>
                    <span className="font-medium">${run.marketingCost?.toLocaleString()}</span>
                  </div>
                )}
                {run.extraCosts! > 0 && (
                  <div className="flex justify-between border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">Extra</span>
                    <span className="font-medium">${run.extraCosts?.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2">
                  <span className="font-bold">Total Costs</span>
                  <span className="font-bold text-destructive">${run.totalCost?.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {run.notes && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader>
                <CardTitle>Trail Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-muted-foreground">{run.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="lg:col-span-1">
          <Card className={`border-2 sticky top-20 shadow-lg ${(run.totalProfit || 0) > 0 ? 'border-primary/50' : 'border-destructive/50'}`}>
             <CardHeader className={`pb-4 border-b border-border/40 ${status.color} rounded-t-lg`}>
              <div className="flex items-center gap-2">
                <status.icon className="w-5 h-5" />
                <CardTitle className="text-lg">{status.text}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div>
                <div className="text-sm text-muted-foreground uppercase tracking-wider font-semibold mb-1">What's It Worth?</div>
                <div className={`text-5xl font-bold ${(run.totalProfit || 0) > 0 ? 'text-primary' : 'text-destructive'}`}>
                  ${run.totalProfit?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
                {profile && (
                  <div className="text-sm text-muted-foreground mt-2 font-medium">
                    ${((run.totalProfit || 0) / profile.peopleCount).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} per member
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
