import { eq } from "drizzle-orm";
import { db, schema } from "../connection.js";
import { nanoid } from "nanoid";

export const projectRepo = {
  getAll() {
    return db.select().from(schema.projects).all();
  },

  getById(id: string) {
    return db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, id))
      .get();
  },

  create(data: {
    name: string;
    repoPath: string;
    model?: string;
    maxBudgetUsd?: number;
    permissionMode?: string;
    isSelfRepo?: boolean;
  }) {
    const now = new Date().toISOString();
    const id = nanoid();

    db.insert(schema.projects)
      .values({
        id,
        name: data.name,
        repoPath: data.repoPath,
        model: data.model ?? "sonnet",
        maxBudgetUsd: data.maxBudgetUsd ?? 10,
        permissionMode: data.permissionMode ?? "default",
        isSelfRepo: data.isSelfRepo ? 1 : 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getById(id)!;
  },

  update(
    id: string,
    data: Partial<{
      name: string;
      repoPath: string;
      model: string;
      maxBudgetUsd: number;
      permissionMode: string;
      modelOverrides: string;
    }>
  ) {
    const now = new Date().toISOString();

    db.update(schema.projects)
      .set({ ...data, updatedAt: now })
      .where(eq(schema.projects.id, id))
      .run();

    return this.getById(id);
  },

  delete(id: string) {
    db.delete(schema.projects)
      .where(eq(schema.projects.id, id))
      .run();
  },
};
