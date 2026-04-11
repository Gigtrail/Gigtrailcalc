import { useGetDashboardSummary, useGetDashboardRecent } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Link } from "wouter";
import { Map, Navigation, Guitar, Truck, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: recent, isLoading: loadingRecent } = useGetDashboardRecent();

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Trail Overview</h1>
          <p className="text-muted-foreground mt-1">Here's how your numbers are looking.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
          <Button asChild variant="default">
            <Link href="/runs/new">
              <Map className="w-4 h-4 mr-2" />
              New Single Show
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/tours/new">
              <Navigation className="w-4 h-4 mr-2" />
              New Tour
            </Link>
          </Button>
        </div>
      </div>

      {loadingSummary || !summary ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-4 rounded-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-1" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
              <span className="text-primary text-xl font-bold">${summary.totalIncome.toLocaleString()}</span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">${summary.totalProfit.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">Net Profit</p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Distance Driven</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.totalKmDriven.toLocaleString()} km</div>
              <p className="text-xs text-muted-foreground mt-1">Across all runs</p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Shows & Tours</CardTitle>
              <Map className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.totalRuns}</div>
              <p className="text-xs text-muted-foreground mt-1">Shows & {summary.totalTours} Tours</p>
            </CardContent>
          </Card>
          
          <Card className="hover-elevate border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Worth the Drive</CardTitle>
              <span className="flex h-3 w-3 rounded-full bg-green-500"></span>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.worthTheDrive}</div>
              <p className="text-xs text-muted-foreground mt-1">High margin gigs</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Single Shows</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild className="h-8">
              <Link href="/runs">View All <ChevronRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingRecent || !recent ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recent.recentRuns.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Map className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No runs logged yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recent.recentRuns.slice(0, 5).map((run) => (
                  <Link key={run.id} href={`/runs/${run.id}`}>
                    <div className="group flex items-center justify-between p-3 rounded-md border border-border/50 bg-background/50 hover:bg-card hover:border-primary/50 transition-colors cursor-pointer">
                      <div className="flex flex-col">
                        <span className="font-medium">{run.origin} → {run.destination}</span>
                        <span className="text-xs text-muted-foreground">{format(new Date(run.createdAt), 'MMM d, yyyy')}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-primary">${run.totalProfit?.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">Net</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Tours</CardTitle>
            </div>
            <Button variant="ghost" size="sm" asChild className="h-8">
              <Link href="/tours">View All <ChevronRight className="w-4 h-4 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingRecent || !recent ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : recent.recentTours.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Navigation className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No tours planned yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recent.recentTours.slice(0, 5).map((tour) => (
                  <Link key={tour.id} href={`/tours/${tour.id}`}>
                    <div className="group flex items-center justify-between p-3 rounded-md border border-border/50 bg-background/50 hover:bg-card hover:border-secondary/50 transition-colors cursor-pointer">
                      <div className="flex flex-col">
                        <span className="font-medium">{tour.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {tour.startDate && format(new Date(tour.startDate), 'MMM d')} - {tour.endDate && format(new Date(tour.endDate), 'MMM d')}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-secondary">${tour.totalProfit?.toLocaleString()}</span>
                        <span className="text-xs text-muted-foreground">Net</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
