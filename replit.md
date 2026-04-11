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
- Landing page (`/`) for unauthenticated users; redirects to `/dashboard` when signed in
- `requireAuth` middleware on all API routes
- All data filtered by `userId` — users only see their own data

### Subscription Plans (Stripe)
- **Free** (AU$0): 1 profile, 1 vehicle, 5 saved runs, no tours
- **Pro** (AU$5/mo): 1 profile, unlimited runs, full tour builder
- **Unlimited** (AU$7.99/mo): unlimited profiles, vehicles, runs, tours
- Stripe Checkout for upgrades, Customer Portal for management
- `stripe-replit-sync` syncs Stripe data (products, prices, subscriptions) to PostgreSQL `stripe.*` tables
- Plan enforcement via `requirePlan` middleware on create routes
- `/api/me` returns current user + plan + limits
- `/api/stripe/*` routes: plans, checkout, portal

### Artist/Band Profiles
- Create and save Solo, Duo, and Band profiles
- Store people count, home base, vehicle, accommodation and food averages

### Vehicles
- Save vehicles with fuel type (petrol/diesel/electric/LPG) and L/100km consumption

### Single Show Calculator
- Flat Fee, Ticketed Show (with deal types), and Hybrid show types
- Live calculation: fuel cost, total trip cost, total income, net profit, break-even fee, profit per member
- Status indicators: "Worth the Drive", "Tight Margins", "Probably Not Worth It"

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
- `users` — user accounts linked to Clerk (id = Clerk userId, email, stripeCustomerId, stripeSubscriptionId, plan)
- `profiles` — artist/band profiles (has userId)
- `vehicles` — vehicles with fuel consumption (has userId)
- `runs` — single show calculations (has userId)
- `tours` — multi-stop tour headers (has userId)
- `tour_stops` — individual stops within a tour

### Stripe sync tables (stripe.*)
- Auto-managed by `stripe-replit-sync` — never insert manually
- Includes: accounts, products, prices, subscriptions, customers, invoices, etc.

## API Routes (artifacts/api-server/src/routes/)

- `/api/me` — current user + plan + limits
- `/api/me/sync-plan` — POST to resync plan from Stripe (called after checkout success)
- `/api/profiles` — CRUD for profiles (filtered by userId)
- `/api/vehicles` — CRUD for vehicles (filtered by userId)
- `/api/runs` — CRUD for single show runs (filtered by userId)
- `/api/tours` — CRUD for tours + stops (filtered by userId)
- `/api/dashboard/summary` — aggregated stats (for userId)
- `/api/dashboard/recent` — recent runs and tours (for userId)
- `/api/stripe/plans` — list Stripe products/prices from DB
- `/api/stripe/checkout` — create Stripe Checkout session
- `/api/stripe/portal` — create Stripe Customer Portal session
- `/api/stripe/webhook` — Stripe webhook handler (managed by stripe-replit-sync)

## Frontend Routes

- `/` — Landing page (signed-out) or redirect to `/dashboard` (signed-in)
- `/sign-in/*?` — Clerk Sign In
- `/sign-up/*?` — Clerk Sign Up
- `/dashboard` — Main dashboard
- `/billing` — Billing & plan management
- `/runs/*` — Single Show Calculator
- `/tours/*` — Tour Builder
- `/profiles/*` — Profile management
- `/vehicles/*` — Vehicle management

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
