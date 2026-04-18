import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { promoCodesTable } from "./promo_codes";

export const promoCodeRedemptionsTable = pgTable("promo_code_redemptions", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id")
    .notNull()
    .references(() => promoCodesTable.id),
  userId: text("user_id").notNull(),
  grantedRole: text("granted_role").notNull(),
  signupEmail: text("signup_email"),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PromoCodeRedemption = typeof promoCodeRedemptionsTable.$inferSelect;
