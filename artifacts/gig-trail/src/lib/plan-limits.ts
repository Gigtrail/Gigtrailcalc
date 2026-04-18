// ─── Compatibility shim ──────────────────────────────────────────────────────
// All access-control logic now lives in @workspace/entitlements. This file
// re-exports it so the existing `@/lib/plan-limits` imports keep working.
// Prefer importing from "@workspace/entitlements" directly in new code.
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Types
  type UserRole,
  type Plan,
  type AccessSource,
  type Entitlements,
  type PlanLimits,
  type PlanFeature,
  type FeatureInfo,

  // Predicates / derivations
  hasProAccess,
  isFreeRole,
  isProRole,
  isTesterRole,
  isAdminRole,
  isPaidPlan,
  normalizeRole,
  derivePlanFromRole,

  // Entitlements
  getEntitlements,
  getPlanLimits,
  maxBandMembersForRole,
  maxBandMembersForPlan,
  canAddBandMember,
  canUseAdvancedDriving,
  canUseSharedAccommodation,

  // Feature copy registry
  FEATURE_REGISTRY,
  getFeatureInfo,

  // Free-tier calc limit constant
  FREE_CALC_LIMIT_PER_WEEK,
} from "@workspace/entitlements";
