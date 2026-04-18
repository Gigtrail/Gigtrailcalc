import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const earlyAccessSignupsTable = pgTable("early_access_signups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  bandName: text("band_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
