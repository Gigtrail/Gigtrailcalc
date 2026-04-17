import { useQuery, useMutation } from "@tanstack/react-query";
import { useUser } from "@clerk/react";

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
  plan: "free" | "paid";
  role: "user" | "admin";
  limits: PlanLimits;
  hasStripeCustomer: boolean;
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

  const plan = data?.plan ?? "free";
  const role = data?.role ?? "user";
  const limits = data?.limits ?? {
    maxProfiles: 1,
    maxVehicles: 1,
    maxRuns: 5,
    toursEnabled: false,
    ticketedShowEnabled: false,
    marketingCostEnabled: false,
    routingEnabled: false,
  };

  return { plan, role, limits, me: data, isLoading, refetch };
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
  plan: string;
  role: string;
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

export function useUpdateUserPlan() {
  return useMutation({
    mutationFn: async ({ userId, plan }: { userId: string; plan: string }) => {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      return data as { user: AdminUser };
    },
  });
}
