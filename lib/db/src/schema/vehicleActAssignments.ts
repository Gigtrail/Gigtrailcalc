import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { vehiclesTable } from "./vehicles";
import { profilesTable } from "./profiles";

export const vehicleActAssignmentsTable = pgTable(
  "vehicle_act_assignments",
  {
    vehicleId: integer("vehicle_id").notNull().references(() => vehiclesTable.id, { onDelete: "cascade" }),
    actId: integer("act_id").notNull().references(() => profilesTable.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.vehicleId, t.actId] })]
);

export type VehicleActAssignment = typeof vehicleActAssignmentsTable.$inferSelect;
