# Gig Trail Tour Calculator

## Overview

A full-stack web app for touring musicians to calculate whether a single show or multi-show tour is financially worth doing. Built with The Gig Trail branding: warm, road-worn, practical, musician-first.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/gig-trail)
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Routing**: wouter
- **Forms**: react-hook-form + shadcn
- **Auth**: Clerk (`@clerk/react`, `@clerk/express`)
- **Payments**: Stripe via Replit Connector + `stripe-replit-sync`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/scripts run seed-stripe` — seed Stripe products (run once after connecting Stripe)

## App Features

### Authentication (Clerk)
- Sign Up / Sign In via Clerk (email + Google OAuth)
- Session cookies (NOT bearer tokens) — no `setAuthTokenGetter` needed
- Landing page (`/`) for unauthenticated users; signed-in users with no profiles go to `/onboarding`, others to `/dashboard`
- `requireAuth` middleware on all API routes
- All data filtered by `userId` — users only see their own data

### Onboarding Flow
- Route: `/onboarding` — full-screen (no sidebar), protected, shown automatically to new users with 0 profiles
- Fields: Act Name, Act Type (Solo/Duo/Band card buttons), Number of People (auto-filled from type), Home Base, Vehicle (4 standard cards: Small Car/SUV/Van/Bus), Fuel Price
- On submit: creates profile via `POST /profiles` with vehicleType + fuelConsumption + defaultFuelPrice (no separate vehicle record created)
- Redirects to `/runs/new?profileId=X&origin=...&fuelPrice=...` for prefilled calculator
- Run form reads URL params and prefills form fields after profiles load
- `HomeRedirect` uses `SignedInRedirect` component that calls `useGetProfiles` to detect new users

### User Role System
- **4 roles**: `free` | `pro` | `tester` | `admin`
  - `free` — default for all new users, limited access
  - `pro` — paid subscribers (Stripe-managed) or manually assigned by admin
  - `tester` — full Pro access without payment, permanent until changed
  - `admin` — full Pro access plus admin panel; permanent admin = `thegigtrail@gmail.com`
- `hasProAccess(role)` returns true for `pro`, `tester`, `admin`
- `access_source` on users: `default` | `stripe` | `promo` | `admin` — prevents Stripe sync from downgrading promo/admin users

### Promo Codes
- `promo_codes` table: code, isActive, grantsRole, maxUses, timesUsed, expiresAt, notes
- `promo_code_redemptions` table: audit trail of who redeemed what
- `GET /api/promo-codes/validate?code=XXX` — public validation (no auth)
- `POST /api/me/redeem-promo` — authenticated redemption
- Admin can manage all codes from billing page admin panel (Users / Promo Codes tabs)
- Default seed: `TESTER101` (grants tester role, unlimited uses, never expires)
- Signup page has optional "Promo Code" field; stored in sessionStorage; auto-redeemed on onboarding page

### Subscription Plans (Stripe)
- **Free** (AU$0): 1 profile, 1 vehicle, 5 saved runs, no tours
- **Paid** (AU$12/mo or AU$79/yr): everything — tours, unlimited runs, multi-vehicle garage, etc.
- Stripe Checkout for upgrades, Customer Portal for management
- `stripe-replit-sync` syncs Stripe data (products, prices, subscriptions) to PostgreSQL `stripe.*` tables
- Stripe product metadata uses `plan: "pro"` (legacy); normalized to role `"pro"` on sync
- Stripe sync respects `access_source` — never downgrades `tester` or `admin` users
- `/api/me` returns: userId, email, role, accessSource, plan, limits, hasStripeCustomer
- `/api/me/sync-plan` — POST to resync role from Stripe after checkout

### Artist/Band Profiles
- Create and save Solo, Duo, and Band profiles
- Store people count, home base, vehicle, accommodation and food averages

### Garage
- **Standard vehicle types** (all plans): Small Car (7.5 L/100km), SUV/Wagon (10 L/100km), Van (11.5 L/100km), Bus (16 L/100km)
- **Key constants**: `STANDARD_VEHICLES` and helpers (`normaliseVehicleKey`, `getStandardVehicle`) in `artifacts/gig-trail/src/lib/garage-constants.ts`
- **Profile Garage section**: 2×2 card grid for free users (read-only presets); Pro users get same 4 cards + nickname field + custom fuel consumption input + "Manage garage" link
- **Legacy vehicle type normalisation**: Old values ("Car" → "small_car", "Van" → "van", "Bus" → "bus") handled by `normaliseVehicleKey()`
- **Custom garage vehicles** (Pro only): `/garage` page + `/garage/new` + `/garage/:id/edit` — stored in `vehiclesTable` with new fields: `vehicleType`, `tankSizeLitres`, `isDefault`, `assignedMemberIds`
- **vehicleType field in profiles** uses new lowercase keys: "small_car", "suv_wagon", "van", "bus"

### Single Show Calculator
- Flat Fee, Ticketed Show (with deal types), and Hybrid show types
- Two-step flow: input form → dedicated results screen (`/runs/results`)
- `handleCalculate` computes route (Google Maps), then navigates to `/runs/results` with result stored in `sessionStorage` as `gigtrail_result`
- On save, a `calculationSnapshot` (all computed result data minus session-specific fields) is stored as JSONB on the run record
- `run-results.tsx` shows: verdict banner, per-person take-home, route summary, accommodation recommendation, cost breakdown, smart insights, Save/Edit/New actions
- **Historical snapshot mode**: `/runs/results?runId=X` loads the stored `calculationSnapshot` from the DB and renders the exact same result page with a "Saved result" badge; back button goes to `/runs`; shows "Run again with current settings" button instead of "Calculate Another Run"
- Old runs without a snapshot redirect to `/runs/:id` (run-detail.tsx) for the legacy detail view
- **Accommodation comes from profile** — no manual accommodation controls on form; nights estimated from drive time ÷ max daily driving hours
- **Constants centralized** in `artifacts/gig-trail/src/lib/gig-constants.ts`: `ACCOM_RATES` (Single=$120, Queen=$180, Twin=$200, Double Room=$180, Multiple Rooms=$300), `DEFAULT_MAX_DRIVE_HOURS_PER_DAY=8`
- Status: "Worth the Drive", "Tight Margins", "Probably Not Worth It"
- Free users: read-only home base (locked from profile), Pro users: editable origin
- `maxDriveHoursPerDay` in profiles (Pro-only field) used for accommodation night recommendation

### Tour Builder (Pro+ only)
- Multi-stop tour planner with running totals
- Per-stop income and cost breakdown
- Full tour financial summary (per show, per day, per member)
- Free users see a locked gate with upgrade CTA

### Dashboard
- Summary stats: total income, net profit, km driven, shows/tours
- Recent runs and tours with profitability status

## Design System

- **Background**: #121212 (deep charcoal)
- **Card**: #1F1F1F (soft dark)
- **Foreground**: #F5F3EF (warm white)
- **Primary**: #D2691E (burnt orange)
- **Accent**: #C2A14D (dusty gold)
- **Muted**: #7A7A7A (muted grey)

## Database Schema

### App tables (lib/db/src/schema/)
- `users` — user accounts linked to Clerk (id = Clerk userId, email, role, accessSource, stripeCustomerId, stripeSubscriptionId, plan)
- `promo_codes` — admin-managed promo codes (code unique, grantsRole, isActive, maxUses, timesUsed, expiresAt, notes)
- `promo_code_redemptions` — audit trail of promo code redemptions (promoCodeId, userId, grantedRole, signupEmail, redeemedAt)
- `profiles` — artist/band profiles (has userId); `defaultVehicleId` = per-act default garage vehicle
- `vehicles` — vehicles with fuel consumption (has userId); `isDefault` = legacy global default (replaced by per-act via profiles.defaultVehicleId)
- `vehicle_act_assignments` — many-to-many: vehicles ↔ profiles (acts); composite PK (vehicleId, actId)
- `runs` — single show calculations (has userId); includes `calculation_snapshot jsonb` storing the full result at time of calculation
- `tours` — multi-stop tour headers (has userId)
- `tour_stops` — individual stops within a tour

### Stripe sync tables (stripe.*)
- Auto-managed by `stripe-replit-sync` — never insert manually
- Includes: accounts, products, prices, subscriptions, customers, invoices, etc.

### Feedback Board
- Route: `/feedback` — authenticated, in sidebar
- Any user can create a feedback post (title, description, category) and upvote any post
- 1 vote per user (toggle — clicking again removes vote)
- Posts sorted by upvotes desc, then newest first
- Search bar filters by title/description/category in real time
- Categories: Bug | Feature Request | Improvement | UX Issue
- Statuses: Planned | In Progress | Released — admin users can update status inline
- Beta banner at top: "You're part of the early beta — vote on what we build next."

## API Routes (artifacts/api-server/src/routes/)

- `/api/me` — current user + plan + limits
- `/api/me/sync-plan` — POST to resync plan from Stripe (called after checkout success)
- `/api/profiles` — CRUD for profiles (filtered by userId)
- `/api/vehicles` — CRUD for vehicles (filtered by userId); GET returns `assignedActIds[]` per vehicle; POST/PATCH accept `actIds[]` + `defaultForActIds[]`
- `/api/vehicles/:id/act-assignments` — PUT to replace act assignments for a vehicle
- `/api/runs` — CRUD for single show runs (filtered by userId)
- `/api/tours` — CRUD for tours + stops (filtered by userId)
- `/api/dashboard/summary` — aggregated stats (for userId)
- `/api/dashboard/recent` — recent runs and tours (for userId)
- `/api/stripe/plans` — list Stripe products/prices from DB
- `/api/stripe/checkout` — create Stripe Checkout session
- `/api/stripe/portal` — create Stripe Customer Portal session
- `/api/stripe/webhook` — Stripe webhook handler (managed by stripe-replit-sync)
- `/api/feedback` — GET all posts (sorted by votes), POST create post
- `/api/feedback/:id/vote` — POST to toggle upvote (1 per user)
- `/api/feedback/:id` — PATCH to update status/category (owner or admin only)

## Frontend Routes

- `/` — Landing page (signed-out) or redirect to `/dashboard` (signed-in)
- `/sign-in/*?` — Clerk Sign In
- `/sign-up/*?` — Clerk Sign Up
- `/dashboard` — Main dashboard
- `/billing` — Billing & plan management
- `/runs/*` — Single Show Calculator
- `/tours/*` — Tour Builder (7-step guided wizard on create; sectioned form on edit)
- `/profiles/*` — Profile management
- `/garage` — Garage (custom vehicle management, Pro)
- `/garage/new` — Add custom vehicle
- `/garage/:id/edit` — Edit custom vehicle
- `/feedback` — Feedback board (all users)

## Analytics (PostHog)

- Package: `posthog-js` in `@workspace/gig-trail`
- Central helper: `artifacts/gig-trail/src/lib/analytics.ts`
  - `initAnalytics()` — called once in App.tsx `AnalyticsIdentifier` on mount
  - `identifyUser(id, props)` — called after Clerk user loads; sends role, email, access_source
  - `resetAnalytics()` — called on sign-out
  - `trackEvent(name, props?)` — safe wrapper around `posthog.capture()`
- Env vars required: `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`
- Events tracked: `login_completed`, `signup_completed`, `show_calc_started`, `show_calc_completed`, `calc_error`, `save_failed`, `tour_calc_started`, `tour_calc_completed`, `tour_saved`, `vehicle_added`, `member_added`, `pro_feature_clicked`, `pricing_viewed`, `upgrade_started`, `upgrade_completed`
- `login_completed` uses `sessionStorage` key `gt_login_tracked` to fire once per browser session (cleared on sign-out)
- `upgrade_started`/`upgrade_completed` pass plan name via `sessionStorage` key `gt_pending_plan` to survive the Stripe redirect
- All calls are wrapped in try/catch — analytics never crashes the app

## Important Notes

- Stripe client (`stripeClient.ts`) uses Replit Connector — NEVER cache it, always call `getUncachableStripeClient()` fresh
- `VITE_CLERK_PUBLISHABLE_KEY` is auto-provisioned by Replit Clerk integration
- Stripe products have `metadata.plan` = "pro" or "unlimited" for plan tier mapping
- After connecting Stripe, run `pnpm --filter @workspace/scripts run seed-stripe` once to create products
- `stripe-replit-sync` manages a webhook automatically via `findOrCreateManagedWebhook`

## Seed Data

Initially seeded with:
- 2 vehicles: Toyota HiAce Van, Coaster Bus
- 2 profiles: Julian & Beci Duo, The Wayward Sons Band
- 1 single show run: Melbourne → Geelong
- 1 multi-stop tour: East Coast Spring Run 2025 (4 stops)

(Seed data has no userId, so won't appear for logged-in users)
