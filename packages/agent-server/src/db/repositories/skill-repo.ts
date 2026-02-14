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

  create(data: {
    name: string;
    description?: string;
    sourceUrl?: string;
    tags?: string[];
    type?: string;
    status?: string;
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
    }>
  ) {
    const setValues: Record<string, unknown> = {};
    if (data.name !== undefined) setValues.name = data.name;
    if (data.description !== undefined) setValues.description = data.description;
    if (data.sourceUrl !== undefined) setValues.sourceUrl = data.sourceUrl;
    if (data.type !== undefined) setValues.type = data.type;
    if (data.status !== undefined) setValues.status = data.status;
    if (data.tags !== undefined) setValues.tags = JSON.stringify(data.tags);

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
