import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { venueImportBatchesTable } from "./venueImportBatches";
import { venuesTable } from "./venues";

export const venueImportRowsTable = pgTable("venue_import_rows", {
  id: serial("id").primaryKey(),
  importBatchId: integer("import_batch_id").notNull().references(() => venueImportBatchesTable.id, { onDelete: "cascade" }),
  sourceDatabase: text("source_database").notNull(),
  sourceSheet: text("source_sheet"),
  sourceRowNumber: integer("source_row_number"),
  venueName: text("venue_name"),
  cityTown: text("city_town"),
  country: text("country"),
  bookingEmail: text("booking_email"),
  bookingContactName: text("booking_contact_name"),
  bookingPhone: text("booking_phone"),
  website: text("website"),
  facebook: text("facebook"),
  instagram: text("instagram"),
  notes: text("notes"),
  rawAction: text("raw_action"),
  duplicateKey: text("duplicate_key"),
  importStatus: text("import_status", {
    enum: ["unverified", "ready_to_import", "needs_review", "duplicate", "missing_required", "imported", "skipped"],
  }).notNull().default("unverified"),
  duplicateStatus: text("duplicate_status"),
  matchedVenueId: integer("matched_venue_id").references(() => venuesTable.id),
  rawOriginalData: jsonb("raw_original_data").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VenueImportRow = typeof venueImportRowsTable.$inferSelect;
export type InsertVenueImportRow = typeof venueImportRowsTable.$inferInsert;
