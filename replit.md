# Gig Trail Tour Calculator

## Overview

The Gig Trail Tour Calculator is a full-stack web application designed for touring musicians to assess the financial viability of single shows or multi-show tours. It provides tools for calculating potential earnings, managing profiles and vehicles, and planning tours, all within a musician-first, road-worn, and practical brand aesthetic. The project aims to empower musicians with financial clarity for their touring decisions, offering a blend of free and premium features to cater to different needs.

## User Preferences

- The agent should prioritize high-level architectural decisions and system design choices over minute implementation details.
- When making changes, the agent should ask for confirmation before implementing major alterations to the codebase or architectural patterns.
- The agent should always ensure that any new features or modifications align with The Gig Trail's branding (warm, road-worn, practical, musician-first).
- The agent should focus on consolidating redundant information and removing changelogs or update logs.

## System Architecture

The application is built as a pnpm monorepo using Node.js 24 and TypeScript 5.9.

**Frontend:**
- Developed with React and Vite.
- Employs `wouter` for routing and `react-hook-form` with `shadcn` for forms.
- **UI/UX Decisions:**
    - The main application UI uses a warm beige color scheme.
    - The public landing page (`/`) features a distinct dark theme (`#0F0F0F` background, amber `#B8651E` accent) to differentiate from the app's internal UI.
    - Product screenshots are used on the landing page for visual context.
    - Dashboard is designed as a command-center UI with hero section, cards for profit health, cost pressure, and show performance, insights, tour status, and recent show cards.

**Backend:**
- An Express 5 API server handles business logic.
- PostgreSQL is used as the database, interfaced via Drizzle ORM.
- Zod with `drizzle-zod` is used for validation.
- Orval generates API hooks and Zod schemas from OpenAPI specifications.
- Authentication is handled by Clerk, providing sign-up/sign-in with email and Google OAuth. All API routes require authentication, and data is filtered by `userId`.
- The system supports a role-based access control (`free`, `pro`, `tester`, `admin`) to manage feature availability.

**Core Features & Implementations:**
- **Onboarding Flow:** Guides new users to create an act profile, including act name, type, number of people, home base, vehicle type, and fuel price.
- **User Role System:** Differentiates user access based on subscription status or administrative assignment.
- **Public Landing Page:** Provides information about the app, problem statement, features, early access signup, and founder information.
- **Promo Codes:** Allows for activation of special roles or access tiers via promo codes with backend validation and redemption.
- **Subscription Plans:** Integrates Stripe for managing free and paid subscriptions, handling upgrades and customer portals.
- **Artist/Band Profiles:** Allows creation and management of individual or band profiles with associated vehicles, accommodation, and food averages.
- **Garage:** Manages standard and custom vehicle types, allowing Pro users to add detailed vehicle information.
- **Single Show Calculator:**
    - Supports Flat Fee, Ticketed, and Hybrid show types.
    - Computes route details (via Google Maps), generates a financial verdict, per-person take-home, cost breakdown, and insights.
    - Stores `calculationSnapshot` as JSONB for historical viewing.
    - Accomodation recommendations are derived from profile settings and drive time.
- **Tour Builder (Pro+):** Provides a multi-stop tour planner with running totals and financial summaries.
- **Feedback Board:** Allows users to submit and upvote feedback, with admin capabilities for status updates.
- **Analytics:** PostHog integration (`posthog-js`) is used for tracking user interactions and key events, with a focus on login, signup, calculation, and upgrade workflows.

## External Dependencies

- **Authentication:** Clerk (`@clerk/react`, `@clerk/express`)
- **Payments:** Stripe via Replit Connector (`stripe-replit-sync`)
- **Database:** PostgreSQL
- **ORM:** Drizzle ORM
- **Validation:** Zod (`zod/v4`), `drizzle-zod`
- **API Codegen:** Orval (from OpenAPI spec)
- **Analytics:** PostHog (`posthog-js`)
- **Mapping/Routing:** Google Maps (for route calculations)