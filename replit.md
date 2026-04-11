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

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## App Features

### Artist/Band Profiles
- Create and save Solo, Duo, and Band profiles
- Store people count, home base, vehicle, accommodation and food averages

### Vehicles
- Save vehicles with fuel type (petrol/diesel/electric/LPG) and L/100km consumption

### Single Show Calculator
- Flat Fee, Ticketed Show (with deal types), and Hybrid show types
- Live calculation: fuel cost, total trip cost, total income, net profit, break-even fee, profit per member
- Status indicators: "Worth the Drive", "Tight Margins", "Probably Not Worth It"

### Tour Builder
- Multi-stop tour planner with running totals
- Per-stop income and cost breakdown
- Full tour financial summary (per show, per day, per member)

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

## Database Schema (lib/db/src/schema/)

- `profiles` — artist/band profiles
- `vehicles` — vehicles with fuel consumption
- `runs` — single show calculations
- `tours` — multi-stop tour headers
- `tour_stops` — individual stops within a tour

## API Routes (artifacts/api-server/src/routes/)

- `/api/profiles` — CRUD for profiles
- `/api/vehicles` — CRUD for vehicles
- `/api/runs` — CRUD for single show runs
- `/api/tours` — CRUD for tours + stops
- `/api/dashboard/summary` — aggregated stats
- `/api/dashboard/recent` — recent runs and tours

## Seed Data

Seeded with:
- 2 vehicles: Toyota HiAce Van, Coaster Bus
- 2 profiles: Julian & Beci Duo, The Wayward Sons Band
- 1 single show run: Melbourne → Geelong
- 1 multi-stop tour: East Coast Spring Run 2025 (4 stops)

## Future Upgrade Points

- Automatic fuel price by location (currently manual)
- Map/distance APIs for automatic km calculation
- Accommodation estimate tools (current manual)
- Export to PDF or CSV
- Tour comparison tools
- Sharing runs with band members
