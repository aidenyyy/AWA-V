import type { FastifyInstance } from "fastify";
import { readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";

interface DirEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
}

export function registerFilesystemRoutes(app: FastifyInstance) {
  // Browse directories for repo selection
  app.get<{ Querystring: { path?: string } }>(
    "/api/fs/browse",
    async (request) => {
      const targetPath = request.query.path || homedir();
      const resolved = resolve(targetPath);

      try {
        const entries = readdirSync(resolved, { withFileTypes: true });

        const dirs: DirEntry[] = entries
          .filter((e) => {
            if (!e.isDirectory()) return false;
            // Skip hidden dirs except .git (which we detect, not list)
            if (e.name.startsWith(".")) return false;
            // Skip common non-project dirs
            if (e.name === "node_modules" || e.name === "Library") return false;
            return true;
          })
          .map((e) => {
            const fullPath = resolve(resolved, e.name);
            let isGitRepo = false;
            try {
              statSync(resolve(fullPath, ".git"));
              isGitRepo = true;
            } catch {
              // not a git repo
            }
            return { name: e.name, path: fullPath, isGitRepo };
          })
          // Git repos first, then alphabetical
          .sort((a, b) => {
            if (a.isGitRepo !== b.isGitRepo) return a.isGitRepo ? -1 : 1;
            return a.name.localeCompare(b.name);
          });

        return {
          data: {
            current: resolved,
            parent: dirname(resolved),
            entries: dirs,
          },
        };
      } catch {
        return {
          data: {
            current: resolved,
            parent: dirname(resolved),
            entries: [],
          },
        };
      }
    }
  );

  // Detect git repos in common locations
  app.get("/api/fs/detect-repos", async () => {
    const home = homedir();
    const searchDirs = [
      resolve(home, "Documents/Github"),
      resolve(home, "Documents/GitHub"),
      resolve(home, "Projects"),
      resolve(home, "Developer"),
      resolve(home, "dev"),
      resolve(home, "repos"),
      resolve(home, "src"),
      resolve(home, "code"),
      resolve(home, "workspace"),
    ];

    const repos: DirEntry[] = [];

    for (const dir of searchDirs) {
      try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory() || e.name.startsWith(".")) continue;
          const fullPath = resolve(dir, e.name);
          try {
            statSync(resolve(fullPath, ".git"));
            repos.push({ name: e.name, path: fullPath, isGitRepo: true });
          } catch {
            // not a git repo
          }
        }
      } catch {
        // dir doesn't exist
      }
    }

    return { data: repos };
  });
}
