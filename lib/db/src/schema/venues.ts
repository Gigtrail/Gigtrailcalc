import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const venuesTable = pgTable("venues", {
  id: serial("id").primaryKey(),
  userId: text("user_id"),
  profileId: integer("profile_id"),
  name: text("venue_name").notNull(),
  normalizedVenueName: text("normalized_venue_name").notNull(),
  city: text("city").notNull(),
  state: text("state"),
  country: text("country"),
  address: text("address"),
  suburb: text("suburb"),
  fullAddress: text("full_address"),
  postcode: text("postcode"),
  website: text("website"),
  capacity: integer("capacity"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  productionContactName: text("production_contact_name"),
  productionContactEmail: text("production_contact_email"),
  productionContactPhone: text("production_contact_phone"),
  accommodationAvailable: boolean("accommodation_available").default(false),
  riderFriendly: boolean("rider_friendly").default(false),
  typicalSoundcheckTime: text("typical_soundcheck_time"),
  typicalSetTime: text("typical_set_time"),
  playingDays: text("playing_days").array(),
  venueStatus: text("venue_status", { enum: ["great", "risky", "avoid", "untested"] }).notNull().default("untested"),
  willPlayAgain: text("will_play_again", { enum: ["yes", "no", "unsure"] }).notNull().default("unsure"),
  generalNotes: text("general_notes"),
  productionNotes: text("production_notes"),
  techSpecs: text("tech_specs"),
  stagePlotNotes: text("stage_plot_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVenueSchema = createInsertSchema(venuesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVenue = z.infer<typeof insertVenueSchema>;
export type Venue = typeof venuesTable.$inferSelect;
