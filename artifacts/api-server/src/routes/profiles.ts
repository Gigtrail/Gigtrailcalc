import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeProfile(p: typeof profilesTable.$inferSelect) {
  return {
    ...p,
    avgAccomPerNight: Number(p.avgAccomPerNight),
    avgFoodPerDay: Number(p.avgFoodPerDay),
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
  };
}

router.get("/profiles", async (_req, res): Promise<void> => {
  const profiles = await db.select().from(profilesTable).orderBy(profilesTable.createdAt);
  res.json(GetProfilesResponse.parse(profiles.map(serializeProfile)));
});

router.post("/profiles", async (req, res): Promise<void> => {
  const parsed = CreateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [profile] = await db.insert(profilesTable).values({
    ...parsed.data,
    avgAccomPerNight: String(parsed.data.avgAccomPerNight ?? 0),
    avgFoodPerDay: String(parsed.data.avgFoodPerDay ?? 0),
  }).returning();
  res.status(201).json(GetProfileResponse.parse(serializeProfile(profile)));
});

router.get("/profiles/:id", async (req, res): Promise<void> => {
  const params = GetProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [profile] = await db.select().from(profilesTable).where(eq(profilesTable.id, params.data.id));
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(GetProfileResponse.parse(serializeProfile(profile)));
});

router.patch("/profiles/:id", async (req, res): Promise<void> => {
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
  if (parsed.data.avgAccomPerNight != null) {
    updateData.avgAccomPerNight = String(parsed.data.avgAccomPerNight);
  }
  if (parsed.data.avgFoodPerDay != null) {
    updateData.avgFoodPerDay = String(parsed.data.avgFoodPerDay);
  }
  const [profile] = await db.update(profilesTable).set(updateData).where(eq(profilesTable.id, params.data.id)).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.json(UpdateProfileResponse.parse(serializeProfile(profile)));
});

router.delete("/profiles/:id", async (req, res): Promise<void> => {
  const params = DeleteProfileParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [profile] = await db.delete(profilesTable).where(eq(profilesTable.id, params.data.id)).returning();
  if (!profile) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
