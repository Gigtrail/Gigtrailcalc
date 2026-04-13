import { pgTable, text, serial, timestamp, integer, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  name: text("name").notNull(),
  vehicleType: text("vehicle_type").default("van"),
  fuelType: text("fuel_type").notNull().default("petrol"),
  avgConsumption: numeric("avg_consumption", { precision: 6, scale: 2 }).notNull().default("0"),
  tankSizeLitres: numeric("tank_size_litres", { precision: 6, scale: 1 }),
  maxPassengers: integer("max_passengers"),
  isDefault: boolean("is_default").notNull().default(false),
  assignedMemberIds: text("assigned_member_ids"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
