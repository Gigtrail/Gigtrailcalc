import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/react";

export type UserRole = "free" | "pro" | "tester" | "admin";

export const PROMO_SESSION_KEY = "gig_trail_pending_promo";
export type AccessSource = "default" | "stripe" | "promo" | "admin";

export interface PlanLimits {
  maxProfiles: number;
  maxVehicles: number;
  maxRuns: number;
  toursEnabled: boolean;
  ticketedShowEnabled: boolean;
  marketingCostEnabled: boolean;
  routingEnabled: boolean;
}

export interface MeResponse {
  userId: string;
  email: string | null;
  role: UserRole;
  accessSource: AccessSource;
  plan: "free" | "paid";
  limits: PlanLimits;
  hasStripeCustomer: boolean;
}

export function hasProAccess(role: UserRole | string): boolean {
  return role === "pro" || role === "tester" || role === "admin";
}

export function usePlan() {
  const { isSignedIn } = useUser();
  const { data, isLoading, refetch } = useQuery<MeResponse>({
    queryKey: ["/api/me"],
    queryFn: async () => {
      const res = await fetch("/api/me", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch plan");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 30_000,
  });

  const role: UserRole = data?.role ?? "free";
  const accessSource: AccessSource = data?.accessSource ?? "default";
  const plan = data?.plan ?? "free";
  const isPro = hasProAccess(role);
  const isAdmin = role === "admin";
  const isTester = role === "tester";
  const limits = data?.limits ?? {
    maxProfiles: 1,
    maxVehicles: 1,
    maxRuns: 5,
    toursEnabled: false,
    ticketedShowEnabled: false,
    marketingCostEnabled: false,
    routingEnabled: false,
  };

  return { plan, role, accessSource, isPro, isAdmin, isTester, limits, me: data, isLoading, refetch };
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
  return useMutation({
    mutationFn: async (priceId: string) => {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      return data as { url: string };
    },
  });
}

export function useCustomerPortal() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        credentials: "include",
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

export function useAdminUsers(q: string) {
  const { isSignedIn } = useUser();
  return useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users", q],
    queryFn: async () => {
      const params = q.length >= 2 ? `?q=${encodeURIComponent(q)}` : "";
      const res = await fetch(`/api/admin/users${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 0,
  });
}

export function useUpdateUserRole() {
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
        credentials: "include",
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
  return useQuery<{ codes: PromoCode[] }>({
    queryKey: ["/api/admin/promo-codes"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promo-codes", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch promo codes");
      return res.json();
    },
    enabled: !!isSignedIn,
    staleTime: 0,
  });
}

export function useCreatePromoCode() {
  return useMutation({
    mutationFn: async (data: {
      code: string;
      grantsRole: string;
      isActive?: boolean;
      maxUses?: number | null;
      expiresAt?: string | null;
      notes?: string | null;
    }) => {
      const res = await fetch("/api/admin/promo-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to create promo code");
      return json as { code: PromoCode };
    },
  });
}

export function useUpdatePromoCode() {
  return useMutation({
    mutationFn: async ({ id, ...data }: Partial<PromoCode> & { id: number }) => {
      const res = await fetch(`/api/admin/promo-codes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update promo code");
      return json as { code: PromoCode };
    },
  });
}

export function useDeletePromoCode() {
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/admin/promo-codes/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete promo code");
      return json as { deleted: boolean };
    },
  });
}

export function usePromoCodeRedemptions(id: number | null) {
  const { isSignedIn } = useUser();
  return useQuery<{ redemptions: PromoCodeRedemption[] }>({
    queryKey: ["/api/admin/promo-codes", id, "redemptions"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/promo-codes/${id}/redemptions`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch redemptions");
      return res.json();
    },
    enabled: !!isSignedIn && id !== null,
    staleTime: 0,
  });
}

export function useRedeemPromo() {
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch("/api/me/redeem-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to redeem promo code");
      return data as { role: string; plan: string };
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
