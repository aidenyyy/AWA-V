import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const marketplaceRepo = {
  getAll() {
    return db
      .select()
      .from(schema.skillMarketplaces)
      .all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.skillMarketplaces)
      .where(eq(schema.skillMarketplaces.id, id))
      .get();
  },

  getByUrl(url: string) {
    return db
      .select()
      .from(schema.skillMarketplaces)
      .where(eq(schema.skillMarketplaces.url, url))
      .get();
  },

  create(data: { name: string; url: string; skillCount?: number }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.skillMarketplaces)
      .values({
        id,
        name: data.name,
        url: data.url,
        skillCount: data.skillCount ?? 0,
        addedAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  update(id: string, data: Partial<{ name: string; url: string; lastFetched: string; skillCount: number }>) {
    const setValues: Record<string, unknown> = {};
    if (data.name !== undefined) setValues.name = data.name;
    if (data.url !== undefined) setValues.url = data.url;
    if (data.lastFetched !== undefined) setValues.lastFetched = data.lastFetched;
    if (data.skillCount !== undefined) setValues.skillCount = data.skillCount;

    db.update(schema.skillMarketplaces)
      .set(setValues)
      .where(eq(schema.skillMarketplaces.id, id))
      .run();

    return this.getById(id);
  },

  delete(id: string) {
    db.delete(schema.skillMarketplaces)
      .where(eq(schema.skillMarketplaces.id, id))
      .run();
  },
};
