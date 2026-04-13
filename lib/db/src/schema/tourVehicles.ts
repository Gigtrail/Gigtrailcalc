import { pgTable, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const tourVehiclesTable = pgTable(
  "tour_vehicles",
  {
    id: serial("id").primaryKey(),
    tourId: integer("tour_id").notNull(),
    vehicleId: integer("vehicle_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("tour_vehicle_unique").on(t.tourId, t.vehicleId)],
);

export type TourVehicle = typeof tourVehiclesTable.$inferSelect;
