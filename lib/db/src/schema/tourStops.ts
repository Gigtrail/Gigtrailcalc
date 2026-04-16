import { pgTable, text, serial, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tourStopsTable = pgTable("tour_stops", {
  id: serial("id").primaryKey(),
  tourId: integer("tour_id").notNull(),
  venueId: integer("venue_id"),
  bookingStatus: text("booking_status").default("confirmed"),
  stopOrder: integer("stop_order").notNull().default(0),
  date: text("date"),
  city: text("city").notNull(),
  cityLat: numeric("city_lat", { precision: 10, scale: 6 }),
  cityLng: numeric("city_lng", { precision: 10, scale: 6 }),
  venueName: text("venue_name"),
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
  extraCosts: numeric("extra_costs", { precision: 10, scale: 2 }),
  distanceOverride: numeric("distance_override", { precision: 10, scale: 2 }),
  fuelPriceOverride: numeric("fuel_price_override", { precision: 6, scale: 3 }),
  accommodationMode: text("accommodation_mode"),
  notes: text("notes"),
});

export const insertTourStopSchema = createInsertSchema(tourStopsTable).omit({ id: true });
export type InsertTourStop = z.infer<typeof insertTourStopSchema>;
export type TourStop = typeof tourStopsTable.$inferSelect;
