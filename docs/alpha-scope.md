# Gig Trail Alpha Scope

## Purpose

This document defines the smallest reliable alpha release for the current Gig Trail repo.

The goal is not to add features. The goal is to cut scope down to the core flows that already exist in the codebase and make those flows dependable end to end.

If a feature does not directly support one of the eight alpha flows below, it is out of scope for alpha.

## Alpha Release Goal

Alpha should let a musician:

1. sign up or sign in
2. complete onboarding
3. create one usable profile
4. calculate one show
5. save and reopen that show
6. see a dashboard with trustworthy totals
7. upgrade or redeem promo access, with admin access working
8. submit feedback

## In For Alpha

### 1. Sign up / Sign in

- Clerk-based sign up and sign in are in.
- Email and existing configured auth providers are in.
- Promo code validation on sign up is in because it already exists and feeds the access flow.
- Redirect logic is in:
  - new user with no profile goes to onboarding
  - existing user with a profile goes to the single-show flow

### 2. Onboarding

- First-run onboarding is in.
- Onboarding should create the user's first profile with just the defaults needed to run a calculation:
  - act name
  - act type
  - home base
  - one starting vehicle assumption
  - default fuel price
- Onboarding redirect to the calculator is in.

### 3. Create Profile

- One core act profile is in for alpha.
- Profile data needed by the single-show calculator is in:
  - act identity
  - people count
  - home base
  - vehicle default
  - fuel defaults
  - accommodation defaults
  - food defaults
- Editing that one profile is in.
- Alpha should treat profile correctness as release-critical because calculator outputs depend on it.

### 4. Calculate A Single Show

- The single-show calculator is in.
- The alpha promise is one reliable end-to-end show calculation flow, not the full product surface.
- Core calculation inputs are in:
  - profile
  - origin and destination
  - show date
  - distance
  - fuel
  - accommodation
  - food
  - extra costs
  - show income inputs
- Results page is in.
- Saved calculation snapshot is in.
- The shared calculation engine and its existing tests are in and are part of the alpha confidence story.

### 5. Save And Reopen That Show

- Saving a single show is in.
- Reopening from Saved Calculations is in.
- Reopening from the saved results snapshot is in.
- Draft / current / past lifecycle behavior is in because it is already built into the saved-show flow.
- Past shows becoming read-only after the show date passes is in.

### 6. Dashboard With Trustworthy Totals

- Dashboard totals are in only as a past-show snapshot.
- Trustworthy totals for alpha mean:
  - totals are computed on the backend
  - totals use past shows only
  - drafts are excluded
  - current and future shows are excluded
  - tours and projections are excluded
  - shows with incomplete saved financial data are excluded from totals
- Recent past shows on the dashboard are in.
- The dashboard should be treated as a reporting surface, not a planning surface, for alpha.

### 7. Upgrade / Promo / Admin Access

- Billing page and upgrade flow are in.
- Stripe checkout / customer portal flow is in where already wired.
- Promo code validate and redeem flow is in.
- Role-based access is in:
  - free
  - pro
  - tester
  - admin
- Permanent admin access for `thegigtrail@gmail.com` is in.
- Admin access to the admin area is in.
- User role management and promo code management are in because they support alpha operations.

### 8. Submit Feedback

- Feedback submission is in.
- A signed-in user being able to create a feedback post is in.
- Basic feedback list visibility is in if already present.
- Feedback should be treated as a support channel for alpha, not a roadmap product in its own right.

## Out For Alpha

### Product Areas

- Tour Builder and all multi-stop tour planning flows are out.
- Tour stop editing, tour imports, and tour-derived planning flows are out.
- Venue library, venue detail workflows, venue intelligence, and venue-history autofill are out.
- Garage depth beyond the one calculator-ready default vehicle path is out.
- Multi-profile management as a core alpha promise is out.
  - The repo supports more, but alpha should only rely on one usable profile working well.
- Public marketing depth is out.
  - landing-page polish
  - early-access marketing flows
  - founder-story content
- Feedback board sophistication is out.
  - voting is not alpha-critical
  - admin roadmap curation is not alpha-critical
  - feedback status management is not alpha-critical

### Calculator Depth

- Advanced calculator variants that are not required for one dependable single-show flow are out of the alpha commitment.
- Multi-vehicle planning is out.
- Tour-level vehicle assignment is out.
- Route-planning sophistication beyond what is needed for one show is out.
- Any result views that depend on future planning or tour projections are out.

### Dashboard / Reporting

- Future potential and projection reporting are out.
- Any dashboard totals based on tours, projections, or upcoming work are out.
- Cross-surface financial comparisons beyond saved past-show totals are out.

### Admin / Billing Extras

- Admin self-service debug conveniences are out.
- Broad internal tooling beyond role control and promo control is out.
- New pricing experiments, new plans, or new role types are out.

### Non-Core Work

- New analytics events are out.
- New design exploration is out.
- Mockup sandbox work is out.
- Any new feature work outside the eight alpha flows is out.

## Alpha Rules

- No new features.
- Reliability beats breadth.
- One profile is enough for alpha.
- One show flow is enough for alpha.
- Dashboard numbers must be explainable from saved past shows.
- If a flow depends on projections, multiple entities, or optional enrichments, it should not block alpha.

## Release Bar

Alpha is ready when all of the following are true:

- A new user can sign up, finish onboarding, and land in the calculator without dead ends.
- That user can save a show and reopen it later with the same financial snapshot.
- Dashboard totals match saved past-show data and clearly exclude non-past items.
- A user can upgrade or redeem a promo code and see access change correctly.
- The admin account can access admin tools without role drift.
- A signed-in user can submit feedback successfully.

## Tester Journeys

### 1. New User To First Saved Show

- Sign up as a brand-new user.
- Complete onboarding and create the first profile.
- Calculate a single show.
- Save it.
- Reopen it from Saved Calculations and confirm the saved result matches the original result.

### 2. Returning User Sign In And Resume

- Sign in as an existing user with one saved show.
- Confirm the app skips onboarding.
- Open the saved show from the runs list or results page.
- Edit the show if it is still current, save again, and confirm the updated snapshot persists.

### 3. Profile Defaults Drive Calculator Correctly

- Start with one existing profile.
- Edit the profile defaults for home base, fuel, accommodation, and food.
- Create a new single-show calculation from that profile.
- Confirm the calculator uses the updated defaults without needing manual re-entry everywhere.

### 4. Dashboard Totals Are Trustworthy

- Save one past-dated show with known totals.
- Save one future-dated show and one draft calculation.
- Open the dashboard.
- Confirm dashboard totals match the past show only and exclude the future show and draft.
- Confirm recent past shows list the completed show.

### 5. Access And Feedback Ops Check

- Redeem a valid promo code or complete a Pro upgrade and confirm the account role/access updates.
- Sign in as the permanent admin account and confirm admin access works.
- From a normal signed-in account, submit a feedback post successfully.
- Confirm the feedback submission appears in the feedback list.
