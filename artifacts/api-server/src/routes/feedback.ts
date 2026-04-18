import { Router, type IRouter } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db, feedbackPostsTable, feedbackVotesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const CATEGORIES = new Set(["bug", "feature_request", "improvement", "ux_issue"]);
const STATUSES = new Set(["planned", "in_progress", "released"]);

router.get("/feedback", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;

  const posts = await db
    .select({
      id: feedbackPostsTable.id,
      userId: feedbackPostsTable.userId,
      title: feedbackPostsTable.title,
      description: feedbackPostsTable.description,
      category: feedbackPostsTable.category,
      status: feedbackPostsTable.status,
      createdAt: feedbackPostsTable.createdAt,
      upvotes: sql<number>`cast(count(${feedbackVotesTable.id}) as int)`,
      hasVoted: sql<boolean>`bool_or(${feedbackVotesTable.userId} = ${userId})`,
    })
    .from(feedbackPostsTable)
    .leftJoin(feedbackVotesTable, eq(feedbackVotesTable.postId, feedbackPostsTable.id))
    .groupBy(feedbackPostsTable.id)
    .orderBy(desc(sql`count(${feedbackVotesTable.id})`), desc(feedbackPostsTable.createdAt));

  res.json(posts.map((p) => ({
    ...p,
    upvotes: Number(p.upvotes),
    hasVoted: Boolean(p.hasVoted),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
  })));
});

router.post("/feedback", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const { title, description, category } = req.body ?? {};

  if (!title || typeof title !== "string" || title.trim().length < 3 || title.trim().length > 200) {
    res.status(400).json({ error: "Title must be 3–200 characters." });
    return;
  }
  if (!description || typeof description !== "string" || description.trim().length < 10 || description.trim().length > 2000) {
    res.status(400).json({ error: "Description must be 10–2000 characters." });
    return;
  }
  const cat = category && CATEGORIES.has(category) ? category : "feature_request";

  const [post] = await db
    .insert(feedbackPostsTable)
    .values({ title: title.trim(), description: description.trim(), category: cat, userId })
    .returning();

  res.status(201).json({
    ...post,
    upvotes: 0,
    hasVoted: false,
    createdAt: post.createdAt instanceof Date ? post.createdAt.toISOString() : String(post.createdAt),
  });
});

router.patch("/feedback/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole } = req as AuthenticatedRequest;
  const postId = Number(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const { status, category } = req.body ?? {};
  const updates: Record<string, string> = {};
  if (status && STATUSES.has(status)) updates.status = status;
  if (category && CATEGORIES.has(category)) updates.category = category;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }

  const [existing] = await db
    .select()
    .from(feedbackPostsTable)
    .where(eq(feedbackPostsTable.id, postId))
    .limit(1);

  if (!existing) {
    res.status(404).json({ error: "Post not found" });
    return;
  }

  const isOwner = existing.userId === userId;
  const isAdmin = userRole === "admin";
  if (!isOwner && !isAdmin) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [updated] = await db
    .update(feedbackPostsTable)
    .set(updates)
    .where(eq(feedbackPostsTable.id, postId))
    .returning();

  res.json({
    ...updated,
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : String(updated.createdAt),
  });
});

router.post("/feedback/:id/vote", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const postId = Number(req.params.id);
  if (isNaN(postId)) {
    res.status(400).json({ error: "Invalid post id" });
    return;
  }

  const [existing] = await db
    .select()
    .from(feedbackVotesTable)
    .where(and(eq(feedbackVotesTable.postId, postId), eq(feedbackVotesTable.userId, userId)))
    .limit(1);

  if (existing) {
    await db
      .delete(feedbackVotesTable)
      .where(and(eq(feedbackVotesTable.postId, postId), eq(feedbackVotesTable.userId, userId)));
    res.json({ voted: false });
  } else {
    await db.insert(feedbackVotesTable).values({ postId, userId });
    res.json({ voted: true });
  }
});

export default router;
