/**
 * Alpha bootstrap utility — recover admin access, seed tester accounts, and
 * prepare demo data without hand-editing the database.
 *
 * Usage:
 *   pnpm --filter @workspace/api-server run bootstrap                # everything
 *   pnpm --filter @workspace/api-server run bootstrap status         # report only, no writes
 *   pnpm --filter @workspace/api-server run bootstrap admin          # verify/repair permanent admin
 *   pnpm --filter @workspace/api-server run bootstrap tester         # ensure demo tester user
 *   pnpm --filter @workspace/api-server run bootstrap free           # ensure demo free user
 *   pnpm --filter @workspace/api-server run bootstrap pro            # ensure demo pro user
 *   pnpm --filter @workspace/api-server run bootstrap sample         # seed sample profile/vehicle/runs/tour for tester
 *   pnpm --filter @workspace/api-server run bootstrap reset-demo     # delete bootstrap demo users + their data
 *
 * Guardrails:
 *   - Refuses to run in production unless BOOTSTRAP_ALLOW_PROD=1 is set.
 *   - All writes are idempotent — re-running the script is safe.
 *   - Demo users use deterministic synthetic IDs (prefix `bootstrap_demo_`)
 *     so they can never collide with real Clerk-issued IDs and are easy
 *     to identify when cleaning up.
 *   - Permanent admin: only role/plan/accessSource are repaired. Email,
 *     stripe IDs, and createdAt are never touched.
 *   - Sample data is only inserted when the demo user has none — real user
 *     data on any other account is never touched.
 *   - reset-demo deletes ONLY rows owned by the bootstrap demo user IDs.
 *     The permanent admin and any real user are never touched.
 */

import { eq, ilike, and, inArray } from "drizzle-orm";
import {
  db,
  usersTable,
  profilesTable,
  vehiclesTable,
  runsTable,
  toursTable,
  tourStopsTable,
} from "@workspace/db";
import {
  PERMANENT_ADMIN_EMAIL,
  derivePlanFromRole,
  type UserRole,
} from "@workspace/entitlements";

// ─── Identity constants ──────────────────────────────────────────────────────

const DEMO_PREFIX = "bootstrap_demo_";

const DEMO_USERS = {
  tester: {
    id: `${DEMO_PREFIX}tester_001`,
    email: "tester+demo@bootstrap.local",
    role: "tester" as UserRole,
    accessSource: "promo" as const,
  },
  free: {
    id: `${DEMO_PREFIX}free_001`,
    email: "free+demo@bootstrap.local",
    role: "free" as UserRole,
    accessSource: "default" as const,
  },
  pro: {
    id: `${DEMO_PREFIX}pro_001`,
    email: "pro+demo@bootstrap.local",
    role: "pro" as UserRole,
    accessSource: "stripe" as const,
  },
} as const;

type DemoKey = keyof typeof DEMO_USERS;

// ─── Logging ────────────────────────────────────────────────────────────────

const ts = () => new Date().toISOString().slice(11, 19);
const log = (kind: "OK" | "CREATED" | "UPDATED" | "SKIP" | "WARN" | "INFO" | "DELETED", msg: string) => {
  console.log(`[bootstrap ${ts()}] ${kind.padEnd(7)} ${msg}`);
};

// ─── Guardrails ─────────────────────────────────────────────────────────────

function assertSafeEnvironment() {
  const env = process.env.NODE_ENV ?? "development";
  const allow = process.env.BOOTSTRAP_ALLOW_PROD === "1";
  if (env === "production" && !allow) {
    console.error(
      `[bootstrap] REFUSED: NODE_ENV=production. ` +
      `Set BOOTSTRAP_ALLOW_PROD=1 to override (you almost certainly do not want this).`
    );
    process.exit(2);
  }
  if (!process.env.DATABASE_URL) {
    console.error("[bootstrap] REFUSED: DATABASE_URL is not set.");
    process.exit(2);
  }
  log("INFO", `env=${env} allow_prod=${allow ? "yes" : "no"}`);
}

// ─── Permanent admin ────────────────────────────────────────────────────────

async function ensurePermanentAdmin(): Promise<void> {
  const [row] = await db
    .select()
    .from(usersTable)
    .where(ilike(usersTable.email, PERMANENT_ADMIN_EMAIL));

  if (!row) {
    log(
      "WARN",
      `permanent admin ${PERMANENT_ADMIN_EMAIL} has no DB row yet — ` +
      `it will be auto-created with the correct role on first sign-in via Clerk. ` +
      `No synthetic row is created here to avoid colliding with the real Clerk user ID.`
    );
    return;
  }

  const expectedPlan = derivePlanFromRole("admin");
  const needsRepair =
    row.role !== "admin" || row.plan !== expectedPlan || row.accessSource !== "admin";

  if (!needsRepair) {
    log("OK", `permanent admin ${row.email} (id=${row.id}) — role/plan/accessSource correct`);
    return;
  }

  await db
    .update(usersTable)
    .set({ role: "admin", plan: expectedPlan, accessSource: "admin" })
    .where(eq(usersTable.id, row.id));
  log(
    "UPDATED",
    `permanent admin ${row.email} repaired: ` +
    `role ${row.role}→admin, plan ${row.plan}→${expectedPlan}, accessSource ${row.accessSource}→admin`
  );
}

// ─── Demo users ─────────────────────────────────────────────────────────────

async function ensureDemoUser(key: DemoKey): Promise<void> {
  const spec = DEMO_USERS[key];
  const expectedPlan = derivePlanFromRole(spec.role);

  const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, spec.id));

  if (!existing) {
    await db.insert(usersTable).values({
      id: spec.id,
      email: spec.email,
      role: spec.role,
      plan: expectedPlan,
      accessSource: spec.accessSource,
    }).onConflictDoNothing();
    log("CREATED", `demo ${key} user → ${spec.email} (id=${spec.id}, role=${spec.role})`);
    return;
  }

  // Only repair the columns this script owns. Never touch stripe IDs, createdAt, etc.
  const updates: Record<string, string> = {};
  if (existing.email !== spec.email) updates.email = spec.email;
  if (existing.role !== spec.role) updates.role = spec.role;
  if (existing.plan !== expectedPlan) updates.plan = expectedPlan;
  if (existing.accessSource !== spec.accessSource) updates.accessSource = spec.accessSource;

  if (Object.keys(updates).length === 0) {
    log("OK", `demo ${key} user ${spec.email} (id=${spec.id}) — already correct`);
    return;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, spec.id));
  log("UPDATED", `demo ${key} user ${spec.email}: ${Object.keys(updates).join(", ")}`);
}

// ─── Sample data (attached to demo tester user only) ─────────────────────────

const SAMPLE_PROFILE_NAME = "Bootstrap Demo Band";
const SAMPLE_VEHICLE_NAME = "Bootstrap Demo Van";
const SAMPLE_TOUR_NAME = "Bootstrap Demo Tour";
const SAMPLE_RUN_VENUES = [
  { venueName: "The Workers Club", city: "Melbourne", state: "VIC" },
  { venueName: "Crowbar", city: "Brisbane", state: "QLD" },
  { venueName: "Frankie's", city: "Sydney", state: "NSW" },
];

async function seedSampleData(): Promise<void> {
  const ownerId = DEMO_USERS.tester.id;

  // 1. Make sure the demo tester exists first.
  const [owner] = await db.select().from(usersTable).where(eq(usersTable.id, ownerId));
  if (!owner) {
    log("WARN", `cannot seed sample data — demo tester user ${ownerId} does not exist. Run "tester" subcommand first.`);
    return;
  }

  // 2. Profile (with two band members).
  const [existingProfile] = await db
    .select()
    .from(profilesTable)
    .where(and(eq(profilesTable.userId, ownerId), eq(profilesTable.name, SAMPLE_PROFILE_NAME)));

  let profileId: number;
  if (existingProfile) {
    profileId = existingProfile.id;
    log("OK", `sample profile "${SAMPLE_PROFILE_NAME}" (id=${profileId}) already exists for demo tester`);
  } else {
    const bandMembers = JSON.stringify([
      { id: "m1", name: "Alex (vocals)", percentage: 50, isActive: true },
      { id: "m2", name: "Sam (guitar)", percentage: 50, isActive: true },
    ]);
    const [created] = await db.insert(profilesTable).values({
      userId: ownerId,
      name: SAMPLE_PROFILE_NAME,
      actType: "Band",
      homeBase: "Melbourne, VIC",
      peopleCount: 2,
      bandMembers,
      activeMemberIds: JSON.stringify(["m1", "m2"]),
      vehicleType: "Van",
      vehicleName: SAMPLE_VEHICLE_NAME,
      fuelConsumption: "12",
      defaultFuelPrice: "1.95",
      expectedGigFee: "800",
      accommodationRequired: true,
      avgAccomPerNight: "120",
      avgFoodPerDay: "60",
      minTakeHomePerPerson: "150",
      maxDriveHoursPerDay: 8,
      notes: "Seeded by bootstrap script — safe to delete via 'reset-demo'.",
    }).returning({ id: profilesTable.id });
    profileId = created!.id;
    log("CREATED", `sample profile "${SAMPLE_PROFILE_NAME}" (id=${profileId}) with 2 band members`);
  }

  // 3. Vehicle.
  const [existingVehicle] = await db
    .select()
    .from(vehiclesTable)
    .where(and(eq(vehiclesTable.userId, ownerId), eq(vehiclesTable.name, SAMPLE_VEHICLE_NAME)));

  let vehicleId: number;
  if (existingVehicle) {
    vehicleId = existingVehicle.id;
    log("OK", `sample vehicle "${SAMPLE_VEHICLE_NAME}" (id=${vehicleId}) already exists`);
  } else {
    const [createdVehicle] = await db.insert(vehiclesTable).values({
      userId: ownerId,
      name: SAMPLE_VEHICLE_NAME,
      vehicleType: "van",
      fuelType: "diesel",
      avgConsumption: "12",
      tankSizeLitres: "80",
      maxPassengers: 5,
      isDefault: true,
      notes: "Seeded by bootstrap script.",
    }).returning({ id: vehiclesTable.id });
    vehicleId = createdVehicle!.id;
    log("CREATED", `sample vehicle "${SAMPLE_VEHICLE_NAME}" (id=${vehicleId})`);
  }

  // 4. Runs (one per sample venue, idempotent by venueName + userId).
  for (const v of SAMPLE_RUN_VENUES) {
    const [existingRun] = await db
      .select()
      .from(runsTable)
      .where(and(
        eq(runsTable.userId, ownerId),
        eq(runsTable.venueName, v.venueName),
        eq(runsTable.profileId, profileId),
      ));

    if (existingRun) {
      log("OK", `sample run "${v.venueName}" (id=${existingRun.id}) already exists`);
      continue;
    }

    const [createdRun] = await db.insert(runsTable).values({
      userId: ownerId,
      profileId,
      vehicleId,
      venueName: v.venueName,
      city: v.city,
      state: v.state,
      country: "Australia",
      status: "draft",
      actType: "Band",
      origin: "Melbourne, VIC",
      destination: `${v.city}, ${v.state}`,
      distanceKm: "750",
      returnTrip: true,
      fuelPrice: "1.95",
      showType: "flat_fee",
      fee: "1200",
      accommodationRequired: true,
      doubleRooms: 1,
      accommodationNights: "1.0",
      accommodationCost: "120",
      foodCost: "120",
      totalCost: "560",
      totalIncome: "1200",
      totalProfit: "640",
      notes: "Seeded by bootstrap script.",
    }).returning({ id: runsTable.id });
    log("CREATED", `sample run "${v.venueName}" (id=${createdRun!.id})`);
  }

  // 5. Tour (with stops mirroring the runs).
  const [existingTour] = await db
    .select()
    .from(toursTable)
    .where(and(eq(toursTable.userId, ownerId), eq(toursTable.name, SAMPLE_TOUR_NAME)));

  let tourId: number;
  if (existingTour) {
    tourId = existingTour.id;
    log("OK", `sample tour "${SAMPLE_TOUR_NAME}" (id=${tourId}) already exists`);
  } else {
    const [createdTour] = await db.insert(toursTable).values({
      userId: ownerId,
      name: SAMPLE_TOUR_NAME,
      profileId,
      vehicleId,
      startLocation: "Melbourne, VIC",
      endLocation: "Melbourne, VIC",
      returnHome: true,
      startDate: "2026-05-01",
      endDate: "2026-05-07",
      defaultFoodCost: "60",
      notes: "Seeded by bootstrap script.",
      fuelType: "diesel",
    }).returning({ id: toursTable.id });
    tourId = createdTour!.id;
    log("CREATED", `sample tour "${SAMPLE_TOUR_NAME}" (id=${tourId})`);

    // Tour stops — only inserted with the new tour, never appended to an existing one.
    let order = 1;
    for (const v of SAMPLE_RUN_VENUES) {
      await db.insert(tourStopsTable).values({
        tourId,
        venueName: v.venueName,
        city: v.city,
        stopOrder: order,
        date: `2026-05-0${order + 1}`,
        showType: "flat_fee",
        fee: "1200",
      }).catch((err: unknown) => {
        log("WARN", `failed to insert tour stop for ${v.venueName}: ${(err as Error).message}`);
      });
      order++;
    }
    log("CREATED", `${SAMPLE_RUN_VENUES.length} tour stops for tour ${tourId}`);
  }
}

// ─── Reset (demo only — never touches real users) ────────────────────────────

async function resetDemo(): Promise<void> {
  const demoIds = Object.values(DEMO_USERS).map((u) => u.id);

  log("INFO", `reset-demo will delete data for users: ${demoIds.join(", ")}`);

  const tourRows = await db.select({ id: toursTable.id })
    .from(toursTable).where(inArray(toursTable.userId, demoIds));
  if (tourRows.length > 0) {
    await db.delete(tourStopsTable).where(inArray(tourStopsTable.tourId, tourRows.map((t) => t.id)));
    log("DELETED", `tour_stops for ${tourRows.length} demo tours`);
  }

  for (const [tableName, table] of [
    ["runs", runsTable],
    ["tours", toursTable],
    ["vehicles", vehiclesTable],
    ["profiles", profilesTable],
  ] as const) {
    const result = await db.delete(table).where(inArray(table.userId, demoIds));
    log("DELETED", `${tableName} owned by demo users (${(result as { rowCount?: number }).rowCount ?? "?"} rows)`);
  }

  const userResult = await db.delete(usersTable).where(inArray(usersTable.id, demoIds));
  log("DELETED", `users (${(userResult as { rowCount?: number }).rowCount ?? "?"} rows) — permanent admin not touched`);
}

// ─── Status report ──────────────────────────────────────────────────────────

async function status(): Promise<void> {
  const [adminRow] = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role, plan: usersTable.plan, accessSource: usersTable.accessSource })
    .from(usersTable)
    .where(ilike(usersTable.email, PERMANENT_ADMIN_EMAIL));

  if (adminRow) {
    log("INFO", `permanent admin: ${adminRow.email} role=${adminRow.role} plan=${adminRow.plan} accessSource=${adminRow.accessSource}`);
  } else {
    log("INFO", `permanent admin: NOT IN DB (will be auto-created on first sign-in)`);
  }

  for (const key of Object.keys(DEMO_USERS) as DemoKey[]) {
    const spec = DEMO_USERS[key];
    const [row] = await db
      .select({ role: usersTable.role, plan: usersTable.plan, accessSource: usersTable.accessSource })
      .from(usersTable)
      .where(eq(usersTable.id, spec.id));
    if (row) {
      log("INFO", `demo ${key}: ${spec.email} role=${row.role} plan=${row.plan} accessSource=${row.accessSource}`);
    } else {
      log("INFO", `demo ${key}: NOT SEEDED (run "${key}" subcommand)`);
    }
  }

  // Sample data summary
  const owner = DEMO_USERS.tester.id;
  const profCount = (await db.select({ id: profilesTable.id }).from(profilesTable).where(eq(profilesTable.userId, owner))).length;
  const vehCount = (await db.select({ id: vehiclesTable.id }).from(vehiclesTable).where(eq(vehiclesTable.userId, owner))).length;
  const runCount = (await db.select({ id: runsTable.id }).from(runsTable).where(eq(runsTable.userId, owner))).length;
  const tourCount = (await db.select({ id: toursTable.id }).from(toursTable).where(eq(toursTable.userId, owner))).length;
  log("INFO", `demo tester data — profiles=${profCount} vehicles=${vehCount} runs=${runCount} tours=${tourCount}`);
}

// ─── Entry point ────────────────────────────────────────────────────────────

async function main() {
  assertSafeEnvironment();

  const cmd = (process.argv[2] ?? "all").toLowerCase();
  log("INFO", `command: ${cmd}`);

  switch (cmd) {
    case "all":
      await ensurePermanentAdmin();
      await ensureDemoUser("tester");
      await ensureDemoUser("free");
      await ensureDemoUser("pro");
      await seedSampleData();
      break;
    case "status":
      await status();
      break;
    case "admin":
      await ensurePermanentAdmin();
      break;
    case "tester":
      await ensureDemoUser("tester");
      break;
    case "free":
      await ensureDemoUser("free");
      break;
    case "pro":
      await ensureDemoUser("pro");
      break;
    case "sample":
      await seedSampleData();
      break;
    case "reset-demo":
      await resetDemo();
      break;
    default:
      console.error(
        `[bootstrap] Unknown command "${cmd}". ` +
        `Valid: all | status | admin | tester | free | pro | sample | reset-demo`
      );
      process.exit(1);
  }

  log("INFO", "done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[bootstrap] FATAL:", err);
  process.exit(1);
});
