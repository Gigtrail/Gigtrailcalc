import { Router, type IRouter } from "express";
import { eq, and, ilike, desc } from "drizzle-orm";
import { db, venuesTable } from "@workspace/db";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function serializeVenue(v: typeof venuesTable.$inferSelect) {
  return {
    ...v,
    lastTotalProfit: v.lastTotalProfit != null ? Number(v.lastTotalProfit) : null,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    updatedAt: v.updatedAt instanceof Date ? v.updatedAt.toISOString() : String(v.updatedAt),
  };
}

router.get("/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const venues = await db.select().from(venuesTable)
    .where(eq(venuesTable.userId, userId))
    .orderBy(desc(venuesTable.updatedAt));
  res.json(venues.map(serializeVenue));
});

router.get("/venues/search", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const q = (req.query.q as string) || "";
  if (!q || q.length < 1) {
    res.json([]);
    return;
  }
  const venues = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), ilike(venuesTable.venueName, `%${q}%`)))
    .orderBy(desc(venuesTable.updatedAt))
    .limit(6);
  res.json(venues.map(serializeVenue));
});

router.post("/venues", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const { venueName, profileId, city, state, country, lastTotalProfit, lastStatus } = req.body as {
    venueName: string;
    profileId?: number | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    lastTotalProfit?: number | null;
    lastStatus?: string | null;
  };

  if (!venueName?.trim()) {
    res.status(400).json({ error: "venueName is required" });
    return;
  }

  const normalized = normalizeVenueName(venueName);

  const [existing] = await db.select().from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), eq(venuesTable.normalizedVenueName, normalized)));

  if (existing) {
    const [updated] = await db.update(venuesTable)
      .set({
        city: city ?? existing.city,
        state: state ?? existing.state,
        country: country ?? existing.country,
        lastTotalProfit: lastTotalProfit != null ? String(lastTotalProfit) : existing.lastTotalProfit,
        lastStatus: lastStatus ?? existing.lastStatus,
        updatedAt: new Date(),
      })
      .where(eq(venuesTable.id, existing.id))
      .returning();
    res.json(serializeVenue(updated));
    return;
  }

  const [created] = await db.insert(venuesTable).values({
    userId,
    profileId: profileId ?? null,
    venueName: venueName.trim(),
    normalizedVenueName: normalized,
    city: city ?? null,
    state: state ?? null,
    country: country ?? null,
    lastTotalProfit: lastTotalProfit != null ? String(lastTotalProfit) : null,
    lastStatus: lastStatus ?? null,
    updatedAt: new Date(),
  }).returning();

  res.status(201).json(serializeVenue(created));
});

router.delete("/venues/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const [venue] = await db.delete(venuesTable)
    .where(and(eq(venuesTable.id, id), eq(venuesTable.userId, userId)))
    .returning();
  if (!venue) {
    res.status(404).json({ error: "Venue not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
