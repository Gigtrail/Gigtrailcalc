import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  grantsRole: text("grants_role").notNull().default("pro"),
  maxUses: integer("max_uses"),
  timesUsed: integer("times_used").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  notes: text("notes"),
  createdByAdminId: text("created_by_admin_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromoCode = typeof promoCodesTable.$inferSelect;
