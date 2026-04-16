import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const venuesTable = pgTable("venues", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  profileId: integer("profile_id"),
  venueName: text("venue_name").notNull(),
  normalizedVenueName: text("normalized_venue_name").notNull(),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  lastTotalProfit: text("last_total_profit"),
  lastStatus: text("last_status"),
  // Extended detail fields
  address: text("address"),
  suburb: text("suburb"),
  fullAddress: text("full_address"),
  capacity: integer("capacity"),
  website: text("website"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  roomNotes: text("room_notes"),
  postcode: text("postcode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
