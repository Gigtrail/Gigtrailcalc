import { Router, type IRouter } from "express";
import { eq, and, ne, inArray } from "drizzle-orm";
import { db, vehiclesTable, vehicleActAssignmentsTable, profilesTable } from "@workspace/db";
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
  SetVehicleActAssignmentsParams,
  SetVehicleActAssignmentsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getAssignedActIds(vehicleId: number): Promise<number[]> {
  const rows = await db
    .select({ actId: vehicleActAssignmentsTable.actId })
    .from(vehicleActAssignmentsTable)
    .where(eq(vehicleActAssignmentsTable.vehicleId, vehicleId));
  return rows.map((r) => r.actId);
}

async function setActAssignments(
  vehicleId: number,
  userId: string,
  actIds: number[],
  defaultForActIds: number[]
): Promise<void> {
  // Verify all actIds belong to this user
  if (actIds.length > 0) {
    const validProfiles = await db
      .select({ id: profilesTable.id })
      .from(profilesTable)
      .where(and(eq(profilesTable.userId, userId), inArray(profilesTable.id, actIds)));
    const validIds = new Set(validProfiles.map((p) => p.id));
    actIds = actIds.filter((id) => validIds.has(id));
    defaultForActIds = defaultForActIds.filter((id) => validIds.has(id));
  }

  // Replace assignments (delete all then re-insert)
  await db
    .delete(vehicleActAssignmentsTable)
    .where(eq(vehicleActAssignmentsTable.vehicleId, vehicleId));

  if (actIds.length > 0) {
    await db.insert(vehicleActAssignmentsTable).values(
      actIds.map((actId) => ({ vehicleId, actId }))
    );
  }

  // Update defaultVehicleId on profiles where this vehicle should be the default
  if (defaultForActIds.length > 0) {
    for (const actId of defaultForActIds) {
      if (actIds.includes(actId)) {
        await db
          .update(profilesTable)
          .set({ defaultVehicleId: vehicleId })
          .where(and(eq(profilesTable.id, actId), eq(profilesTable.userId, userId)));
      }
    }
  }
}

function serializeVehicle(v: typeof vehiclesTable.$inferSelect, assignedActIds: number[]) {
  return {
    ...v,
    avgConsumption: Number(v.avgConsumption),
    tankSizeLitres: v.tankSizeLitres != null ? Number(v.tankSizeLitres) : null,
    isDefault: v.isDefault ?? false,
    createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt),
    assignedActIds,
  };
}

router.get("/vehicles", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const vehicles = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.userId, userId))
    .orderBy(vehiclesTable.createdAt);

  // Fetch all assignments for this user's vehicles in one query
  const vehicleIds = vehicles.map((v) => v.id);
  let assignmentMap: Record<number, number[]> = {};
  if (vehicleIds.length > 0) {
    const assignments = await db
      .select()
      .from(vehicleActAssignmentsTable)
      .where(inArray(vehicleActAssignmentsTable.vehicleId, vehicleIds));
    for (const a of assignments) {
      if (!assignmentMap[a.vehicleId]) assignmentMap[a.vehicleId] = [];
      assignmentMap[a.vehicleId].push(a.actId);
    }
  }

  res.json(GetVehiclesResponse.parse(vehicles.map((v) => serializeVehicle(v, assignmentMap[v.id] ?? []))));
});

router.post("/vehicles", requireAuth, async (req, res): Promise<void> => {
  const { userId, userRole, userPlan } = req as AuthenticatedRequest;
  const limits = getPlanLimits(userRole);
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
  const { actIds, defaultForActIds, ...vehicleData } = parsed.data;
  if (vehicleData.isDefault) {
    await db.update(vehiclesTable).set({ isDefault: false }).where(eq(vehiclesTable.userId, userId));
  }
  const [vehicle] = await db.insert(vehiclesTable).values({
    ...vehicleData,
    userId,
    avgConsumption: String(vehicleData.avgConsumption),
    tankSizeLitres: vehicleData.tankSizeLitres != null ? String(vehicleData.tankSizeLitres) : null,
  }).returning();

  const resolvedActIds = actIds ?? [];
  const resolvedDefaultForActIds = defaultForActIds ?? [];
  await setActAssignments(vehicle.id, userId, resolvedActIds, resolvedDefaultForActIds);
  const assignedActIds = await getAssignedActIds(vehicle.id);

  res.status(201).json(GetVehicleResponse.parse(serializeVehicle(vehicle, assignedActIds)));
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
  const assignedActIds = await getAssignedActIds(vehicle.id);
  res.json(GetVehicleResponse.parse(serializeVehicle(vehicle, assignedActIds)));
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
  const { actIds, defaultForActIds, ...vehicleData } = parsed.data;
  const updateData: Record<string, unknown> = { ...vehicleData };
  if (vehicleData.avgConsumption != null) updateData.avgConsumption = String(vehicleData.avgConsumption);
  if (vehicleData.tankSizeLitres != null) updateData.tankSizeLitres = String(vehicleData.tankSizeLitres);
  if (vehicleData.isDefault) {
    await db.update(vehiclesTable).set({ isDefault: false }).where(
      and(eq(vehiclesTable.userId, userId), ne(vehiclesTable.id, params.data.id))
    );
  }
  const [vehicle] = await db.update(vehiclesTable).set(updateData).where(and(eq(vehiclesTable.id, params.data.id), eq(vehiclesTable.userId, userId))).returning();
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  if (actIds !== undefined && actIds !== null) {
    await setActAssignments(vehicle.id, userId, actIds, defaultForActIds ?? []);
  }
  const assignedActIds = await getAssignedActIds(vehicle.id);

  res.json(UpdateVehicleResponse.parse(serializeVehicle(vehicle, assignedActIds)));
});

router.put("/vehicles/:id/act-assignments", requireAuth, async (req, res): Promise<void> => {
  const { userId } = req as AuthenticatedRequest;
  const params = SetVehicleActAssignmentsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = SetVehicleActAssignmentsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vehicle] = await db.select().from(vehiclesTable).where(and(eq(vehiclesTable.id, params.data.id), eq(vehiclesTable.userId, userId)));
  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  await setActAssignments(vehicle.id, userId, parsed.data.actIds, parsed.data.defaultForActIds ?? []);
  const assignedActIds = await getAssignedActIds(vehicle.id);

  res.json(GetVehicleResponse.parse(serializeVehicle(vehicle, assignedActIds)));
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
