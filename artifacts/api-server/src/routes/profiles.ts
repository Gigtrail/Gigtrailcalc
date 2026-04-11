import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, profilesTable } from "@workspace/db";
import {
  CreateProfileBody,
  GetProfileParams,
  GetProfileResponse,
  UpdateProfileParams,
  UpdateProfileBody,
  UpdateProfileResponse,
  DeleteProfileParams,
  GetProfilesResponse,
  TrackCalculationResponse,
} from "@workspace/api-zod";
import { requireAuth, getPlanLimits, countUserRecords, type AuthenticatedRequest } from "../middlewares/auth";

const FREE_CALC_LIMIT = 10;

function todayString() {
  return new Date().toISOString().split("T")[0];
}

function daysDiff(dateStr: string) {
  const past = new Date(dateStr).getTime();
  const now = Date.now();
  return (now - past) / (1000 * 60 * 60 * 24);
}

const router: IRouter = Router();

function serializeProfile(p: typeof profilesTable.$inferSelect) {
  return {
    ...p,
    avgAccomPerNight: Number(p.avgAccomPerNight),
    avgFoodPerDay: Number(p.avgFoodPerDay),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
  };
}

router.get("/profiles", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const profiles = await db
    .select()
    .from(profilesTable)
    .where(eq(profilesTable.userId, userId))
    .orderBy(profilesTable.createdAt);
  res.json(GetProfilesResponse.parse(profiles.map(serializeProfile)));
});

router.post("/profiles", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userPlan);
  const count = await countUserRecords(profilesTable, userId);
  if (count >= limits.maxProfiles) {
    res.status(403).json({ error: "Plan limit reached", code: "LIMIT_PROFILES", limit: limits.maxProfiles, plan: userPlan });
    return;
  }
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [profile] = await db.insert(profilesTable).values({
    ...parsed.data,
    userId,
    avgAccomPerNight: String(parsed.data.avgAccomPerNight ?? 0),
    avgFoodPerDay: String(parsed.data.avgFoodPerDay ?? 0),
  }).returning();
  res.status(201).json(GetProfileResponse.parse(serializeProfile(profile)));
});

router.get("/profiles/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(and(eq(profilesTable.id, params.data.id), eq(profilesTable.userId, userId)));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetProfileResponse.parse(serializeProfile(profile)));
});

router.patch("/profiles/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.avgAccomPerNight != null) updateData.avgAccomPerNight = String(parsed.data.avgAccomPerNight);
  if (parsed.data.avgFoodPerDay != null) updateData.avgFoodPerDay = String(parsed.data.avgFoodPerDay);
  const [profile] = await db.update(profilesTable).set(updateData).where(and(eq(profilesTable.id, params.data.id), eq(profilesTable.userId, userId))).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(UpdateProfileResponse.parse(serializeProfile(profile)));
});

router.delete("/profiles/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [profile] = await db.delete(profilesTable).where(and(eq(profilesTable.id, params.data.id), eq(profilesTable.userId, userId))).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/profiles/:id/track-calculation", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan } = req as AuthenticatedRequest;
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid profile id" });
    return;
  }

  const [profile] = await db.select().from(profilesTable).where(and(eq(profilesTable.id, id), eq(profilesTable.userId, userId)));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const isPro = userPlan === "pro" || userPlan === "unlimited";

  if (isPro) {
    res.json(TrackCalculationResponse.parse({ allowed: true, count: 0, limit: null }));
    return;
  }

  const today = todayString();
  const needsReset = !profile.lastCalculationReset || daysDiff(profile.lastCalculationReset) >= 7;
  let count = needsReset ? 0 : (profile.calculationsThisWeek ?? 0);

  if (!needsReset && count >= FREE_CALC_LIMIT) {
    res.status(403).json(TrackCalculationResponse.parse({ allowed: false, count, limit: FREE_CALC_LIMIT }));
    return;
  }

  count += 1;
  await db.update(profilesTable)
    .set({
      calculationsThisWeek: count,
      lastCalculationReset: needsReset ? today : profile.lastCalculationReset!,
    })
    .where(eq(profilesTable.id, id));

  res.json(TrackCalculationResponse.parse({ allowed: true, count, limit: FREE_CALC_LIMIT }));
});

export default router;
