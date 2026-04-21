import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
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
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  productionContactName: text("production_contact_name"),
  productionContactPhone: text("production_contact_phone"),
  productionContactEmail: text("production_contact_email"),
  roomNotes: text("room_notes"),
  venueStatus: text("venue_status"),
  willPlayAgain: text("will_play_again"),
  accommodationAvailable: boolean("accommodation_available").default(false),
  riderProvided: boolean("rider_provided").default(false),
  playingDays: text("playing_days").array(),
  venueNotes: text("venue_notes"),
  postcode: text("postcode"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
