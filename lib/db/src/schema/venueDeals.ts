import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const venueDealsTable = pgTable("venue_deals", {
  id: serial("id").primaryKey(),
  venueId: integer("venue_id").notNull(),
  profileId: integer("profile_id"),
  userId: text("user_id"),
  runId: integer("run_id"),
  tourId: integer("tour_id"),
  sourceStopId: integer("source_stop_id"),
  date: date("date"),
  dealType: text("deal_type", { enum: ["ticketed", "guarantee"] }).notNull(),
  ticketPrice: numeric("ticket_price", { precision: 8, scale: 2 }),
  ticketsSoldEstimate: integer("tickets_sold_estimate"),
  ticketsSoldActual: integer("tickets_sold_actual"),
  guaranteeAmount: numeric("guarantee_amount", { precision: 10, scale: 2 }),
  grossRevenue: numeric("gross_revenue", { precision: 10, scale: 2 }).notNull().default("0"),
  totalExpenses: numeric("total_expenses", { precision: 10, scale: 2 }).notNull().default("0"),
  netProfit: numeric("net_profit", { precision: 10, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVenueDealSchema = createInsertSchema(venueDealsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVenueDeal = z.infer<typeof insertVenueDealSchema>;
export type VenueDeal = typeof venueDealsTable.$inferSelect;
