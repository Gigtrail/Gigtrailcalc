import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const feedbackPostsTable = pgTable("feedback_posts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("feature_request"),
  status: text("status").notNull().default("planned"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFeedbackPostSchema = createInsertSchema(feedbackPostsTable).omit({ id: true, createdAt: true });
export type InsertFeedbackPost = z.infer<typeof insertFeedbackPostSchema>;
export type FeedbackPost = typeof feedbackPostsTable.$inferSelect;
