import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";

export const starredPluginRepo = {
  getAll(): string[] {
    return db
      .select()
      .from(schema.starredPlugins)
      .all()
      .map((row) => row.pluginId);
  },

  isStarred(pluginId: string): boolean {
    const row = db
      .select()
      .from(schema.starredPlugins)
      .where(eq(schema.starredPlugins.pluginId, pluginId))
      .get();
    return !!row;
  },

  star(pluginId: string) {
    const existing = this.isStarred(pluginId);
    if (existing) return;

    db.insert(schema.starredPlugins)
      .values({
        pluginId,
        starredAt: new Date().toISOString(),
      })
      .run();
  },

  unstar(pluginId: string) {
    db.delete(schema.starredPlugins)
      .where(eq(schema.starredPlugins.pluginId, pluginId))
      .run();
  },
};
