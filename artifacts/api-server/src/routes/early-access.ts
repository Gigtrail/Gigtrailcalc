import { Router, type IRouter } from "express";
import { db, earlyAccessSignupsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

router.post("/early-access", async (req, res): Promise<void> => {
  const { name, email, bandName } = req.body ?? {};

  if (typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Name is required" });
    return;
  }
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  const cleanName  = name.trim().slice(0, 100);
  const cleanEmail = email.trim().toLowerCase().slice(0, 255);
  const cleanBand  = typeof bandName === "string" && bandName.trim().length > 0
    ? bandName.trim().slice(0, 100)
    : null;

  const [existing] = await db
    .select()
    .from(earlyAccessSignupsTable)
    .where(eq(earlyAccessSignupsTable.email, cleanEmail));

  if (existing) {
    res.json({ ok: true, alreadyRegistered: true });
    return;
  }

  await db.insert(earlyAccessSignupsTable).values({
    name: cleanName,
    email: cleanEmail,
    bandName: cleanBand,
  });

  res.json({ ok: true, alreadyRegistered: false });
});

export default router;
