import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const venueImportBatchesTable = pgTable("venue_import_batches", {
  id: serial("id").primaryKey(),
  sourceDatabase: text("source_database").notNull(),
  fileName: text("file_name").notNull(),
  uploadedByUserId: text("uploaded_by_user_id").references(() => usersTable.id),
  totalRows: integer("total_rows").notNull().default(0),
  readyRows: integer("ready_rows").notNull().default(0),
  duplicateRows: integer("duplicate_rows").notNull().default(0),
  needsReviewRows: integer("needs_review_rows").notNull().default(0),
  missingRequiredRows: integer("missing_required_rows").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VenueImportBatch = typeof venueImportBatchesTable.$inferSelect;
export type InsertVenueImportBatch = typeof venueImportBatchesTable.$inferInsert;
