import { pgTable, text, serial, timestamp, integer, numeric, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const profilesTable = pgTable("profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  actType: text("act_type").notNull().default("Solo"),
  homeBase: text("home_base"),
  homeBaseLat: numeric("home_base_lat", { precision: 10, scale: 6 }),
  homeBaseLng: numeric("home_base_lng", { precision: 10, scale: 6 }),
  peopleCount: integer("people_count").notNull().default(1),
  defaultVehicleId: integer("default_vehicle_id"),
  avgAccomPerNight: numeric("avg_accom_per_night", { precision: 10, scale: 2 }).notNull().default("0"),
  avgFoodPerDay: numeric("avg_food_per_day", { precision: 10, scale: 2 }).notNull().default("0"),
  minTakeHomePerPerson: numeric("min_take_home_per_person", { precision: 10, scale: 2 }).notNull().default("0"),
  notes: text("notes"),
  calculationsThisWeek: integer("calculations_this_week").notNull().default(0),
  lastCalculationReset: date("last_calculation_reset"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({ id: true, createdAt: true });
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
