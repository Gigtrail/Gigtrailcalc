import { Router, type IRouter } from "express";
import { requireAuth, requireAdmin, type AuthenticatedRequest } from "../middlewares/auth";
import { db, usersTable } from "@workspace/db";
import { eq, ilike, or } from "drizzle-orm";

const router: IRouter = Router();

const PERMANENT_ADMIN_EMAIL = "thegigtrail@gmail.com";

router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = (req.query.q as string | undefined)?.trim() ?? "";

  const users = q.length >= 2
    ? await db
        .select({ id: usersTable.id, email: usersTable.email, plan: usersTable.plan, role: usersTable.role })
        .from(usersTable)
        .where(ilike(usersTable.email, `%${q}%`))
        .limit(50)
    : await db
        .select({ id: usersTable.id, email: usersTable.email, plan: usersTable.plan, role: usersTable.role })
        .from(usersTable)
        .limit(50);

  res.json({ users });
});

router.patch("/admin/users/:id/plan", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const { id } = req.params;
  const { plan } = req.body as { plan?: string };

  if (!plan || !["free", "paid"].includes(plan)) {
    res.status(400).json({ error: "Invalid plan. Must be 'free' or 'paid'." });
    return;
  }

  const [target] = await db
    .select({ id: usersTable.id, email: usersTable.email, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, id));

  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  if (target.email === PERMANENT_ADMIN_EMAIL && plan === "free") {
    res.status(403).json({ error: "Cannot downgrade the permanent admin account." });
    return;
  }

  const [updated] = await db
    .update(usersTable)
    .set({ plan })
    .where(eq(usersTable.id, id))
    .returning({ id: usersTable.id, email: usersTable.email, plan: usersTable.plan, role: usersTable.role });

  res.json({ user: updated });
});

export default router;
