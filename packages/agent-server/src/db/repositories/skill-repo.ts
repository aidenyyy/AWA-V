import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const skillRepo = {
  getAll() {
    return db
      .select()
      .from(schema.skills)
      .all()
      .map(parseSkillJsonFields);
  },

  getById(id: string) {
    const row = db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.id, id))
      .get();
    return row ? parseSkillJsonFields(row) : undefined;
  },

  getByType(type: string) {
    return db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.type, type))
      .all()
      .map(parseSkillJsonFields);
  },

  getByTags(tags: string[]) {
    // SQLite has no native array overlap operator, so we filter in JS
    const all = this.getAll();
    return all.filter((skill) =>
      tags.some((tag) => skill.tags.includes(tag))
    );
  },

  getByName(name: string) {
    const row = db
      .select()
      .from(schema.skills)
      .where(eq(schema.skills.name, name))
      .get();
    return row ? parseSkillJsonFields(row) : undefined;
  },

  create(data: {
    name: string;
    description?: string;
    sourceUrl?: string;
    tags?: string[];
    type?: string;
    status?: string;
    instructions?: string;
    manifestUrl?: string;
    sourceKind?: string;
    pluginDir?: string;
    starred?: number;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.skills)
      .values({
        id,
        name: data.name,
        description: data.description ?? "",
        sourceUrl: data.sourceUrl,
        tags: JSON.stringify(data.tags ?? []),
        type: data.type ?? "builtin",
        status: data.status ?? "active",
        instructions: data.instructions ?? "",
        manifestUrl: data.manifestUrl ?? "",
        sourceKind: data.sourceKind ?? "manual",
        pluginDir: data.pluginDir ?? "",
        starred: data.starred ?? 0,
        installedAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  update(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      sourceUrl: string;
      tags: string[];
      type: string;
      status: string;
      instructions: string;
      manifestUrl: string;
      sourceKind: string;
      pluginDir: string;
      starred: number;
    }>
  ) {
    const setValues: Record<string, unknown> = {};
    if (data.name !== undefined) setValues.name = data.name;
    if (data.description !== undefined) setValues.description = data.description;
    if (data.sourceUrl !== undefined) setValues.sourceUrl = data.sourceUrl;
    if (data.type !== undefined) setValues.type = data.type;
    if (data.status !== undefined) setValues.status = data.status;
    if (data.tags !== undefined) setValues.tags = JSON.stringify(data.tags);
    if (data.instructions !== undefined) setValues.instructions = data.instructions;
    if (data.manifestUrl !== undefined) setValues.manifestUrl = data.manifestUrl;
    if (data.sourceKind !== undefined) setValues.sourceKind = data.sourceKind;
    if (data.pluginDir !== undefined) setValues.pluginDir = data.pluginDir;
    if (data.starred !== undefined) setValues.starred = data.starred;

    db.update(schema.skills)
      .set(setValues)
      .where(eq(schema.skills.id, id))
      .run();

    return this.getById(id);
  },

  delete(id: string) {
    db.delete(schema.skills)
      .where(eq(schema.skills.id, id))
      .run();
  },
};

function parseSkillJsonFields<T extends { tags: string }>(
  row: T
): Omit<T, "tags"> & { tags: string[] } {
  return {
    ...row,
    tags: JSON.parse(row.tags) as string[],
  };
}
