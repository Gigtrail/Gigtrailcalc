import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const runsTable = pgTable("runs", {
  id: serial("id").primaryKey(),
  profileId: integer("profile_id"),
  vehicleId: integer("vehicle_id"),
  origin: text("origin"),
  destination: text("destination"),
  distanceKm: numeric("distance_km", { precision: 10, scale: 2 }).notNull().default("0"),
  returnTrip: boolean("return_trip").notNull().default(false),
  fuelPrice: numeric("fuel_price", { precision: 6, scale: 3 }).notNull().default("0"),
  showType: text("show_type").notNull().default("flat_fee"),
  fee: numeric("fee", { precision: 10, scale: 2 }),
  capacity: integer("capacity"),
  ticketPrice: numeric("ticket_price", { precision: 8, scale: 2 }),
  expectedAttendancePct: numeric("expected_attendance_pct", { precision: 5, scale: 2 }),
  dealType: text("deal_type"),
  splitPct: numeric("split_pct", { precision: 5, scale: 2 }),
  guarantee: numeric("guarantee", { precision: 10, scale: 2 }),
  merchEstimate: numeric("merch_estimate", { precision: 10, scale: 2 }),
  marketingCost: numeric("marketing_cost", { precision: 10, scale: 2 }),
  accommodationCost: numeric("accommodation_cost", { precision: 10, scale: 2 }),
  foodCost: numeric("food_cost", { precision: 10, scale: 2 }),
  extraCosts: numeric("extra_costs", { precision: 10, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }),
  totalIncome: numeric("total_income", { precision: 10, scale: 2 }),
  totalProfit: numeric("total_profit", { precision: 10, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRunSchema = createInsertSchema(runsTable).omit({ id: true, createdAt: true });
export type InsertRun = z.infer<typeof insertRunSchema>;
export type Run = typeof runsTable.$inferSelect;
