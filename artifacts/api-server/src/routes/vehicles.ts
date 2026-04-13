import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, vehiclesTable } from "@workspace/db";
import { requireAuth, getPlanLimits, countUserRecords, type AuthenticatedRequest } from "../middlewares/auth";
import {
  CreateVehicleBody,
  GetVehicleParams,
  GetVehicleResponse,
  UpdateVehicleParams,
  UpdateVehicleBody,
  UpdateVehicleResponse,
  DeleteVehicleParams,
  GetVehiclesResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function serializeVehicle(v: typeof vehiclesTable.$inferSelect) {
  return {
    ...v,
    avgConsumption: Number(v.avgConsumption),
    tankSizeLitres: v.tankSizeLitres != null ? Number(v.tankSizeLitres) : null,
    isDefault: v.isDefault ?? false,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
  };
}

router.get("/vehicles", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const vehicles = await db.select().from(vehiclesTable).where(eq(vehiclesTable.userId, userId)).orderBy(vehiclesTable.createdAt);
  res.json(GetVehiclesResponse.parse(vehicles.map(serializeVehicle)));
});

router.post("/vehicles", requireAuth, async (req, res): Promise<void> => {
  const { userId, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userPlan);
  const count = await countUserRecords(vehiclesTable, userId);
  if (count >= limits.maxVehicles) {
    res.status(403).json({ error: "Plan limit reached", code: "LIMIT_VEHICLES", limit: limits.maxVehicles, plan: userPlan });
    return;
  }
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vehicle] = await db.insert(vehiclesTable).values({
    ...parsed.data,
    userId,
    avgConsumption: String(parsed.data.avgConsumption),
    tankSizeLitres: parsed.data.tankSizeLitres != null ? String(parsed.data.tankSizeLitres) : null,
  }).returning();
  res.status(201).json(GetVehicleResponse.parse(serializeVehicle(vehicle)));
});

router.get("/vehicles/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = GetVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vehicle] = await db.select().from(vehiclesTable).where(and(eq(vehiclesTable.id, params.data.id), eq(vehiclesTable.userId, userId)));
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(GetVehicleResponse.parse(serializeVehicle(vehicle)));
});

router.patch("/vehicles/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = UpdateVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.avgConsumption != null) updateData.avgConsumption = String(parsed.data.avgConsumption);
  if (parsed.data.tankSizeLitres != null) updateData.tankSizeLitres = String(parsed.data.tankSizeLitres);
  const [vehicle] = await db.update(vehiclesTable).set(updateData).where(and(eq(vehiclesTable.id, params.data.id), eq(vehiclesTable.userId, userId))).returning();
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.json(UpdateVehicleResponse.parse(serializeVehicle(vehicle)));
});

router.delete("/vehicles/:id", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = DeleteVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [vehicle] = await db.delete(vehiclesTable).where(and(eq(vehiclesTable.id, params.data.id), eq(vehiclesTable.userId, userId))).returning();
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
