import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser, useAuth } from "@clerk/react";

/**
 * Fetch wrapper that attaches the Clerk Bearer token, matching the
 * auto-generated `@workspace/api-client-react` behaviour. The plain `fetch()`
 * + cookies path does NOT authenticate against the API in this proxied
 * environment — the API server only reads the Authorization header.
 */
async function authedFetch(input: RequestInfo | URL, getToken: () => Promise<string | null>, init?: RequestInit): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  return fetch(input, { ...init, headers, credentials: "include" });
}
import {
  getEntitlements,
  hasProAccess,
  isAdminRole,
  isTesterRole,
  derivePlanFromRole,
  deserializeEntitlements,
  type UserRole,
  type AccessSource,
  type Entitlements,
  type EntitlementsWire,
  type PlanLimits,
} from "@workspace/entitlements";

// Re-export types for downstream callers (use the central package directly when possible).
export {
  hasProAccess,
  getEntitlements,
  isAdminRole,
  isTesterRole,
  derivePlanFromRole,
};
export type { UserRole, AccessSource, Entitlements, PlanLimits };

export const PROMO_SESSION_KEY = "gig_trail_pending_promo";

export interface MeResponse {
  userId: string;
  email: string | null;
  role: UserRole;
  accessSource: AccessSource;
  plan: "free" | "pro";
  /** Legacy shape — derived from entitlements server-side. */
  limits: PlanLimits;
  /** JSON-safe entitlements shape (Infinity is encoded as null). */
  entitlements: EntitlementsWire;
  hasStripeCustomer: boolean;
}

const FREE_ENTITLEMENTS = getEntitlements("free");

export function usePlan() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const { data, isLoading, refetch } = useQuery<MeResponse>({
    queryKey: ["/api/me"],
    queryFn: async () => {
      const res = await authedFetch("/api/me", () => getToken());
      if (!res.ok) throw new Error(`Failed to fetch plan (${res.status})`);
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const role: UserRole = data?.role ?? "free";
  const accessSource: AccessSource = data?.accessSource ?? "default";
  const plan = data?.plan ?? "free";

  // Prefer server-sent entitlements (single source of truth). Fall back to local
  // computation from role for first-paint / loading states. They MUST match.
  const entitlements: Entitlements = data?.entitlements
    ? deserializeEntitlements(data.entitlements)
    : (data ? getEntitlements(role) : FREE_ENTITLEMENTS);

  const isPro = entitlements.canUseProFeatures;
  const isAdmin = entitlements.canAccessAdmin;
  const isTester = isTesterRole(role);

  // Legacy shape kept for older call-sites that read .limits.maxProfiles etc.
  const limits: PlanLimits = data?.limits ?? {
    maxProfiles: entitlements.maxProfiles === Infinity ? Number.MAX_SAFE_INTEGER : entitlements.maxProfiles,
    maxVehicles: entitlements.maxVehicles === Infinity ? Number.MAX_SAFE_INTEGER : entitlements.maxVehicles,
    maxRuns: entitlements.maxSavedRuns === Infinity ? Number.MAX_SAFE_INTEGER : entitlements.maxSavedRuns,
    toursEnabled: entitlements.canUseTourBuilder,
    ticketedShowEnabled: entitlements.canUseTicketedShows,
    marketingCostEnabled: entitlements.canUseMarketingCost,
    routingEnabled: entitlements.canUseRouting,
  };

  return {
    plan,
    role,
    accessSource,
    isPro,
    isAdmin,
    isTester,
    entitlements,
    limits,
    me: data,
    isLoading,
    refetch,
  };
}

// ─── Weekly calc usage ────────────────────────────────────────────────────────

export interface WeeklyUsage {
  used: number;
  limit: number | null;
  resetsIn: number | null;
  isPro: boolean;
}

export function useWeeklyUsage() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  return useQuery<WeeklyUsage>({
    queryKey: ["/api/profiles/weekly-usage"],
    queryFn: async () => {
      const res = await authedFetch("/api/profiles/weekly-usage", () => getToken());
      if (!res.ok) throw new Error(`Failed to fetch usage (${res.status})`);
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export interface StripePlan {
  id: string;
  name: string;
  description: string;
  metadata: Record<string, string>;
  prices: Array<{
    id: string;
    unitAmount: number;
    currency: string;
    recurring: { interval: string } | null;
  }>;
}

export function useStripePlans() {
  return useQuery<{ data: StripePlan[] }>({
    queryKey: ["/api/stripe/plans"],
    queryFn: async () => {
      const res = await fetch("/api/stripe/plans", { credentials: "include" });
      if (!res.ok) return { data: [] };
      return res.json();
    },
    staleTime: 60_000,
  });
}

export function useCreateCheckout() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (priceId: string) => {
      const res = await authedFetch("/api/stripe/checkout", () => getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      return data as { url: string };
    },
  });
}

export function useCustomerPortal() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const res = await authedFetch("/api/stripe/portal", () => getToken(), {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Portal failed");
      return data as { url: string };
    },
  });
}

export interface AdminUser {
  id: string;
  email: string | null;
  role: string;
  accessSource: string;
  plan: string;
}

export function useAdminUsers() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  return useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await authedFetch("/api/admin/users", () => getToken());
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 0,
  });
}

export function useUpdateUserRole() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await authedFetch(`/api/admin/users/${userId}/role`, () => getToken(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      return data as { user: AdminUser };
    },
  });
}

/** @deprecated Use useUpdateUserRole instead */
export function useUpdateUserPlan() {
  return useUpdateUserRole();
}

export interface PromoCode {
  id: number;
  code: string;
  isActive: boolean;
  grantsRole: string;
  maxUses: number | null;
  timesUsed: number;
  expiresAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PromoCodeRedemption {
  id: number;
  promoCodeId: number;
  userId: string;
  grantedRole: string;
  signupEmail: string | null;
  redeemedAt: string;
}

export function useAdminPromoCodes() {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  return useQuery<{ codes: PromoCode[] }>({
    queryKey: ["/api/admin/promo-codes"],
    queryFn: async () => {
      const res = await authedFetch("/api/admin/promo-codes", () => getToken());
      if (!res.ok) throw new Error("Failed to fetch promo codes");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 0,
  });
}

export function useCreatePromoCode() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (data: {
      code: string;
      grantsRole: string;
      isActive?: boolean;
      maxUses?: number | null;
      expiresAt?: string | null;
      notes?: string | null;
    }) => {
      const res = await authedFetch("/api/admin/promo-codes", () => getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create promo code");
      return json as { code: PromoCode };
    },
  });
}

export function useUpdatePromoCode() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PromoCode> & { id: number }) => {
      const res = await authedFetch(`/api/admin/promo-codes/${id}`, () => getToken(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update promo code");
      return json as { code: PromoCode };
    },
  });
}

export function useDeletePromoCode() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authedFetch(`/api/admin/promo-codes/${id}`, () => getToken(), {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete promo code");
      return json as { deleted: boolean };
    },
  });
}

export function usePromoCodeRedemptions(id: number | null) {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  return useQuery<{ redemptions: PromoCodeRedemption[] }>({
    queryKey: ["/api/admin/promo-codes", id, "redemptions"],
    queryFn: async () => {
      const res = await authedFetch(`/api/admin/promo-codes/${id}/redemptions`, () => getToken());
      if (!res.ok) throw new Error("Failed to fetch redemptions");
      return res.json();
    },
    enabled: !!isSignedIn && id !== null,
    staleTime: 0,
  });
}

export function useRedeemPromo() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await authedFetch("/api/me/redeem-promo", () => getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to redeem promo code");
      return data as { role: string; plan: string };
    },
  });
}

// ─── Admin: Feedback Management ───────────────────────────────────────────────

export type AdminFeedbackCategory = "bug" | "feature_request" | "improvement" | "ux_issue";
export type AdminFeedbackStatus = "planned" | "in_progress" | "released";
export type AdminFeedbackSort = "newest" | "oldest" | "top_voted";

export interface AdminFeedbackPost {
  id: number;
  userId: string;
  title: string;
  description: string;
  category: AdminFeedbackCategory;
  status: AdminFeedbackStatus;
  adminReply: string | null;
  adminReplyUpdatedAt: string | null;
  internalNotes: string | null;
  deletedAt: string | null;
  deletedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  authorEmail: string | null;
  upvotes: number;
}

export interface AdminFeedbackFilters {
  search?: string;
  status?: AdminFeedbackStatus | "";
  category?: AdminFeedbackCategory | "";
  sort?: AdminFeedbackSort;
  needsReply?: boolean;
  includeDeleted?: boolean;
}

export function useAdminFeedback(filters: AdminFeedbackFilters = {}) {
  const { isSignedIn } = useUser();
  const { getToken } = useAuth();
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.needsReply) params.set("needsReply", "true");
  if (filters.includeDeleted) params.set("includeDeleted", "true");
  const qs = params.toString();
  return useQuery<{ posts: AdminFeedbackPost[] }>({
    queryKey: ["/api/admin/feedback", filters],
    queryFn: async () => {
      const res = await authedFetch(`/api/admin/feedback${qs ? `?${qs}` : ""}`, () => getToken());
      if (!res.ok) throw new Error("Failed to fetch feedback");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 0,
  });
}

export function useUpdateAdminFeedback() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: {
      id: number;
      status?: AdminFeedbackStatus;
      category?: AdminFeedbackCategory;
      adminReply?: string | null;
      internalNotes?: string | null;
    }) => {
      const res = await authedFetch(`/api/admin/feedback/${id}`, () => getToken(), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update feedback");
      return json as { post: AdminFeedbackPost };
    },
  });
}

export function useDeleteAdminFeedback() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authedFetch(`/api/admin/feedback/${id}`, () => getToken(), {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete feedback");
      return json as { deleted: boolean };
    },
  });
}

export function useRestoreAdminFeedback() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await authedFetch(`/api/admin/feedback/${id}/restore`, () => getToken(), {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to restore feedback");
      return json as { post: AdminFeedbackPost };
    },
  });
}

export function useValidatePromoCode() {
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/promo-codes/validate?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      return data as { valid: boolean; grantsRole?: string; error?: string };
    },
  });
}

export function useSyncPlan() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: async () => {
      const res = await authedFetch("/api/me/sync-plan", () => getToken(), {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync plan");
      return data as { role: string; plan: string };
    },
  });
}
