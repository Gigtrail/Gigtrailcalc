import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

export class Storage {
  async getUser(id: string) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    return user ?? null;
  }

  async updateUserStripeInfo(
    userId: string,
    stripeInfo: { stripeCustomerId?: string; stripeSubscriptionId?: string; plan?: string }
  ) {
    const [user] = await db
      .update(usersTable)
      .set(stripeInfo)
      .where(eq(usersTable.id, userId))
      .returning();
    return user;
  }

  async getSubscription(subscriptionId: string) {
    const result = await db.execute(
      sql`SELECT * FROM stripe.subscriptions WHERE id = ${subscriptionId}`
    );
    return result.rows[0] ?? null;
  }

  async getProductBySubscriptionId(subscriptionId: string) {
    const result = await db.execute(sql`
      SELECT p.id, p.name, p.metadata
      FROM stripe.subscriptions s
      JOIN stripe.prices pr ON pr.id = (s.items->0->>'price')
      JOIN stripe.products p ON p.id = pr.product
      WHERE s.id = ${subscriptionId}
    `);
    return result.rows[0] ?? null;
  }

  async listActiveProducts() {
    const result = await db.execute(sql`
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.metadata as product_metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring,
        pr.active as price_active
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      ORDER BY pr.unit_amount ASC
    `);
    return result.rows;
  }
}

export const storage = new Storage();
