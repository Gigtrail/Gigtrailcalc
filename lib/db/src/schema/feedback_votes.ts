import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";

export const feedbackVotesTable = pgTable("feedback_votes", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: text("user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("feedback_votes_post_user").on(t.postId, t.userId),
]);

export type FeedbackVote = typeof feedbackVotesTable.$inferSelect;
