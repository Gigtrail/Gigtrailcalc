# Gig Trail

Gig Trail is a web app for musicians who need to work out whether a show is actually worth doing.

The alpha focus is simple: help an artist sign in, set up one usable act profile, calculate one show, save it, reopen it, and understand the money without keeping the whole story in a spreadsheet.

This repo is still early. It contains more product surface than the alpha promise, including tour, venue, vehicle, billing, admin, and feedback work. Treat the alpha as the narrow reliable path described below, not as a finished production product.

## Project Overview

Gig Trail is built as a pnpm monorepo with:

- a React/Vite frontend
- an Express API server
- a shared Postgres/Drizzle database package
- generated API client and validation packages
- shared entitlement logic for free, pro, tester, and admin access
- Stripe billing wiring through Replit Connectors
- Clerk auth through Replit Auth/Clerk
- Google Maps browser-side location and routing support

The project is currently Replit-oriented. The artifact config, ports, Clerk proxy, Stripe connector, and deployment assumptions all come from that setup. It can be run locally, but the smoothest path today is still through the Replit workspace routing.

## Current Alpha Scope

Alpha should prove these core journeys:

- Sign up or sign in with Clerk.
- Complete onboarding.
- Create one practical act profile.
- Calculate a single show.
- Save and reopen that show.
- See dashboard totals based on trustworthy saved past-show snapshots.
- Upgrade through Stripe or redeem promo tester access.
- Submit feedback.

For alpha, reliability matters more than breadth. One profile and one dependable single-show flow are enough.

The repo includes broader areas such as Tour Builder, Venues, Garage, admin tools, feedback management, and marketing pages. Some of that exists and may be useful for demos, but it should not be treated as the alpha release bar unless it directly supports the journeys above.

## Monorepo Structure

```text
.
+-- artifacts/
|   +-- api-server/        Express API server
|   +-- gig-trail/         Main React/Vite web app
|   +-- mockup-sandbox/    Separate mockup/prototyping artifact
+-- docs/
|   +-- alpha-scope.md     Current alpha scope and tester journeys
+-- lib/
|   +-- api-client-react/  Generated React Query API client
|   +-- api-spec/          OpenAPI spec and Orval config
|   +-- api-zod/           Shared Zod API schemas
|   +-- db/                Drizzle schema, migrations, and DB client
|   +-- entitlements/      Shared roles, plans, limits, and feature flags
+-- scripts/               Utility scripts, including Stripe product seeding
+-- package.json           Root workspace scripts
+-- pnpm-workspace.yaml    Workspace package list and dependency catalog
+-- tsconfig*.json         Shared TypeScript config
```

Package overview:

- `@workspace/gig-trail`: the customer-facing web app.
- `@workspace/api-server`: the backend API, auth middleware, Stripe webhooks, promo code seeding, and alpha bootstrap script.
- `@workspace/db`: Postgres access through Drizzle, plus schema and migrations.
- `@workspace/entitlements`: the single source of truth for roles, plans, limits, and feature access.
- `@workspace/api-spec`: OpenAPI source and client code generation.
- `@workspace/api-client-react`: generated frontend API hooks and custom fetch behavior.
- `@workspace/api-zod`: shared API validation schemas.
- `@workspace/scripts`: workspace utility scripts, currently including Stripe product seeding.

## Environment Variables

Frontend variables live in `artifacts/gig-trail/.env.local`. Start from:

```bash
cp artifacts/gig-trail/.env.example artifacts/gig-trail/.env.local
```

Required frontend variables:

```text
VITE_CLERK_PUBLISHABLE_KEY=...
VITE_GOOGLE_MAPS_API_KEY=...
```

Optional frontend variables:

```text
VITE_POSTHOG_KEY=...
VITE_POSTHOG_HOST=https://us.i.posthog.com
VITE_CLERK_PROXY_URL=...
```

`VITE_CLERK_PROXY_URL` is mainly for production/custom-domain Clerk proxying. In local dev it is usually empty.

Required backend variables:

```text
DATABASE_URL=postgres://...
PORT=8080
```

Common backend/runtime variables:

```text
NODE_ENV=development
LOG_LEVEL=info
CLERK_SECRET_KEY=...
BASE_PATH=/
```

Replit/connector-provided variables:

```text
REPLIT_CONNECTORS_HOSTNAME=...
REPL_IDENTITY=...
WEB_REPL_RENEWAL=...
REPLIT_DEPLOYMENT=...
REPLIT_DOMAINS=...
```

You normally do not hand-write the Replit connector variables. They are provided by Replit when running with connected services. Stripe will not fully work outside that connector path unless the Stripe integration is changed to use direct Stripe keys.

Bootstrap safety variable:

```text
BOOTSTRAP_ALLOW_PROD=1
```

Only set this if you intentionally want the bootstrap script to write in production. Most of the time, do not set it.

## Local Setup

Install Node 24 or a compatible current Node version, then install dependencies with pnpm:

```bash
pnpm install
```

This repo enforces pnpm. It also has a minimum package release age policy in `pnpm-workspace.yaml`, so very fresh package releases may be blocked on purpose.

Set up the frontend env file:

```bash
cp artifacts/gig-trail/.env.example artifacts/gig-trail/.env.local
```

Then fill in at least:

- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`

For the backend, make sure Postgres is available and `DATABASE_URL` is set before starting the API or running DB commands.

If you need to push the Drizzle schema:

```bash
pnpm --filter @workspace/db run push
```

The alpha bootstrap utility can repair the permanent admin role, seed demo users, and add sample data:

```bash
pnpm --filter @workspace/api-server run bootstrap
pnpm --filter @workspace/api-server run bootstrap status
```

It refuses production writes unless `BOOTSTRAP_ALLOW_PROD=1` is set.

## Running the App

In Replit, use the workspace run configuration. The artifact setup is:

- API server on port `8080`, serving `/api`
- web app on port `22623`, serving `/`
- web `BASE_PATH=/`

Manual backend startup:

```bash
PORT=8080 DATABASE_URL=postgres://... pnpm --filter @workspace/api-server run dev
```

On Windows PowerShell, the package's `dev` script uses POSIX `export`, so run the build and start steps manually:

```powershell
$env:NODE_ENV="development"
$env:PORT="8080"
$env:DATABASE_URL="postgres://..."
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Manual frontend startup:

```bash
PORT=22623 BASE_PATH=/ pnpm --filter @workspace/gig-trail run dev
```

On Windows PowerShell:

```powershell
$env:PORT="22623"
$env:BASE_PATH="/"
pnpm --filter @workspace/gig-trail run dev
```

Important local-dev note: the frontend calls `/api` as a same-origin path. Replit routes `/api` to the API artifact. If you run the frontend and backend as plain separate local ports without that router, you may need to add a local proxy or use a dev environment that preserves the Replit-style routing.

## Build / Typecheck / Test

Root build:

```bash
pnpm run build
```

Root typecheck:

```bash
pnpm run typecheck
```

Library-only typecheck:

```bash
pnpm run typecheck:libs
```

Frontend build:

```bash
pnpm --filter @workspace/gig-trail run build
```

Frontend typecheck:

```bash
pnpm --filter @workspace/gig-trail run typecheck
```

Frontend tests:

```bash
pnpm --filter @workspace/gig-trail run test
```

API build:

```bash
pnpm --filter @workspace/api-server run build
```

API typecheck:

```bash
pnpm --filter @workspace/api-server run typecheck
```

Regenerate the React API client from the OpenAPI spec:

```bash
pnpm --filter @workspace/api-spec run codegen
```

Seed Stripe products in the connected Replit Stripe sandbox:

```bash
pnpm --filter @workspace/scripts run seed-stripe
```

## Auth / Billing / Maps Notes

Auth is Clerk-based through `@clerk/react` on the frontend and `@clerk/express` on the backend.

The app expects `VITE_CLERK_PUBLISHABLE_KEY` on the frontend. The backend uses Clerk middleware and may use `CLERK_SECRET_KEY` for production Clerk proxy behavior. In this Replit setup, auth provider configuration is managed through the workspace Auth pane, not a separate hand-maintained config file in the repo.

Access is role-based:

- `free`: default account with alpha limits.
- `pro`: paid Stripe access.
- `tester`: Pro-level access granted by promo code.
- `admin`: full access plus admin tools.

The permanent admin email is:

```text
thegigtrail@gmail.com
```

That account is repaired to admin access on sign-in or by the bootstrap/admin repair paths.

Stripe is wired through Replit Connectors and `stripe-replit-sync`. The backend fetches Stripe credentials from the connector at request time instead of storing static Stripe keys in the repo. Checkout, portal, product sync, and webhook handling are present, but they depend on the Replit connector environment.

The current Pro pricing seed script creates:

- AU$12/month
- AU$79/year

Google Maps is used browser-side for places, address parsing, directions, and distance/duration helpers. Set:

```text
VITE_GOOGLE_MAPS_API_KEY=...
```

The key should have the relevant Maps JavaScript/Places/Directions or Distance Matrix capabilities enabled. If the key is missing, location services degrade and the app logs `Missing VITE_GOOGLE_MAPS_API_KEY`.

Promo code tester access:

```text
TESTER101
```

The API server attempts to seed or repair `TESTER101` on startup when `DATABASE_URL` is available. It grants `tester` access, which gets Pro-level alpha access without payment.

## Alpha Risks / Known Gaps

- The repo contains more UI than the alpha guarantee. Tour Builder, Venues, Garage depth, and broader admin/feedback sophistication should be treated as non-core until tested end to end.
- Plain local dev is not as polished as Replit dev. Same-origin `/api` routing, Stripe connectors, and Clerk proxy behavior assume the Replit artifact/router setup.
- Stripe currently depends on Replit connector variables. A normal local `.env` with `STRIPE_SECRET_KEY` is not enough without changing the integration.
- The API server `dev` script uses POSIX shell syntax, so Windows PowerShell users should use the manual build/start flow above.
- Dashboard alpha confidence depends on saved past-show snapshots. Drafts, future shows, tours, projections, and incomplete financial rows should not be counted.
- Google Maps behavior depends on a valid browser API key and enabled Google APIs.
- The frontend has PostHog wiring, but analytics should not be considered release-critical for alpha.
- The alpha data model is still moving. Be careful with migrations and avoid hand-editing production data.

## Recommended Next Steps

- Run the tester journeys in `docs/alpha-scope.md` and fix any break in the core alpha path before adding new features.
- Make the two-port local dev story cleaner by adding a Vite `/api` proxy or documenting a single recommended local router.
- Add an API test command if backend route coverage becomes part of the release bar.
- Keep `@workspace/entitlements` as the only place for role, plan, limit, and feature-flag decisions.
- Tighten the README whenever setup changes, especially around Clerk, Stripe, and database migrations.
- Before inviting external testers, verify sign-up, onboarding, first calculation, save/reopen, dashboard totals, promo redemption, admin access, and feedback submission in a fresh environment.
