import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const toursTable = pgTable("tours", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  profileId: integer("profile_id"),
  vehicleId: integer("vehicle_id"),
  startLocation: text("start_location"),
  startLocationLat: numeric("start_location_lat", { precision: 10, scale: 7 }),
  startLocationLng: numeric("start_location_lng", { precision: 11, scale: 7 }),
  endLocation: text("end_location"),
  endLocationLat: numeric("end_location_lat", { precision: 10, scale: 7 }),
  endLocationLng: numeric("end_location_lng", { precision: 11, scale: 7 }),
  returnHome: boolean("return_home").notNull().default(false),
  startDate: text("start_date"),
  endDate: text("end_date"),
  defaultFoodCost: numeric("default_food_cost", { precision: 10, scale: 2 }),
  notes: text("notes"),
  daysOnTour: integer("days_on_tour"),
  totalDistance: numeric("total_distance", { precision: 10, scale: 2 }),
  totalCost: numeric("total_cost", { precision: 10, scale: 2 }),
  totalIncome: numeric("total_income", { precision: 10, scale: 2 }),
  totalProfit: numeric("total_profit", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTourSchema = createInsertSchema(toursTable).omit({ id: true, createdAt: true });
export type InsertTour = z.infer<typeof insertTourSchema>;
export type Tour = typeof toursTable.$inferSelect;
