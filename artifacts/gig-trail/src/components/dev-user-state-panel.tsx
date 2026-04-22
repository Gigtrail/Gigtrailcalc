import { useEffect, useMemo, useRef, useState } from "react";
import { useUser } from "@clerk/react";
import { RefreshCw } from "lucide-react";
import { usePlan, type Entitlements } from "@/hooks/use-plan";
import { Button } from "@/components/ui/button";

const ENTITLEMENT_FLAGS = [
  ["Pro", "canUseProFeatures"],
  ["Tours", "canUseTourBuilder"],
  ["Routing", "canUseRouting"],
  ["Admin", "canAccessAdmin"],
  ["Advanced driving", "canUseAdvancedDriving"],
  ["Shared accom", "canUseSharedAccommodation"],
  ["Ticketed shows", "canUseTicketedShows"],
] as const satisfies readonly (readonly [string, keyof Entitlements])[];

function formatValue(value: unknown): string {
  if (value === Infinity) return "unlimited";
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "yes" : "no";
  return String(value);
}

export default function DevUserStatePanel() {
  const { isSignedIn } = useUser();
  const { me, role, plan, accessSource, entitlements, isLoading, refetch } = usePlan();
  const [isOpen, setIsOpen] = useState(true);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [changes, setChanges] = useState<string[]>([]);
  const previousSnapshotRef = useRef<Record<string, unknown> | null>(null);

  const snapshot = useMemo(() => ({
    userId: me?.userId ?? "(loading)",
    role,
    plan,
    accessSource,
    canUseProFeatures: entitlements.canUseProFeatures,
    canUseTourBuilder: entitlements.canUseTourBuilder,
    canUseRouting: entitlements.canUseRouting,
    canAccessAdmin: entitlements.canAccessAdmin,
    canUseAdvancedDriving: entitlements.canUseAdvancedDriving,
    canUseSharedAccommodation: entitlements.canUseSharedAccommodation,
    canUseTicketedShows: entitlements.canUseTicketedShows,
  }), [
    accessSource,
    entitlements.canAccessAdmin,
    entitlements.canUseAdvancedDriving,
    entitlements.canUseProFeatures,
    entitlements.canUseRouting,
    entitlements.canUseSharedAccommodation,
    entitlements.canUseTicketedShows,
    entitlements.canUseTourBuilder,
    me?.userId,
    plan,
    role,
  ]);

  useEffect(() => {
    if (!me) return;

    const previousSnapshot = previousSnapshotRef.current;
    if (previousSnapshot) {
      const nextChanges = Object.entries(snapshot)
        .filter(([key, value]) => previousSnapshot[key] !== value)
        .map(([key, value]) => `${key}: ${formatValue(previousSnapshot[key])} -> ${formatValue(value)}`);
      setChanges(nextChanges);
      if (nextChanges.length > 0) {
        console.log("[DevUserStatePanel] /api/me changed", nextChanges);
      }
    }

    previousSnapshotRef.current = snapshot;
    setLastReadAt(new Date().toLocaleTimeString());
    console.log("[DevUserStatePanel] /api/me snapshot", snapshot);
  }, [me, snapshot]);

  async function refreshState() {
    const result = await refetch();
    if (result.data) {
      setLastReadAt(new Date().toLocaleTimeString());
    }
  }

  if (!isSignedIn) return null;

  return (
    <aside className="fixed bottom-3 right-3 z-50 w-[min(22rem,calc(100vw-1.5rem))] rounded-md border border-amber-300 bg-background/95 text-foreground shadow-xl backdrop-blur">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <button
          type="button"
          className="text-left text-[11px] font-bold uppercase tracking-widest text-amber-700"
          onClick={() => setIsOpen((value) => !value)}
        >
          Dev user state
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {lastReadAt ? `read ${lastReadAt}` : "waiting"}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={refreshState}
            disabled={isLoading}
            title="Refresh /api/me"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {isOpen && (
        <div className="space-y-3 px-3 py-3 text-xs">
          <dl className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">userId</dt>
            <dd className="truncate font-mono" title={me?.userId ?? undefined}>
              {me?.userId ?? "(loading)"}
            </dd>
            <dt className="text-muted-foreground">role</dt>
            <dd className="font-mono">{role}</dd>
            <dt className="text-muted-foreground">plan</dt>
            <dd className="font-mono">{plan}</dd>
            <dt className="text-muted-foreground">accessSource</dt>
            <dd className="font-mono">{accessSource}</dd>
          </dl>

          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Key entitlements
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {ENTITLEMENT_FLAGS.map(([label, key]) => (
                <div key={key} className="flex items-center justify-between rounded border border-border/70 px-2 py-1">
                  <span className="truncate">{label}</span>
                  <span className="font-mono">{formatValue(entitlements[key])}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded border border-border/70 bg-muted/30 px-2 py-2">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Changed since previous /api/me
            </div>
            {changes.length > 0 ? (
              <ul className="space-y-1 font-mono text-[11px]">
                {changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                No change detected yet. Redeem a promo, then refresh or wait for the automatic refetch.
              </p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
