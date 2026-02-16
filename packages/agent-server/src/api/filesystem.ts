import type { FastifyInstance } from "fastify";
import { readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, dirname } from "node:path";
import { isSelfRepo } from "../utils/self-detect.js";

interface DirEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
  isSelf?: boolean;
}

/** Check if a path is a git repo — supports both .git directory and .git file (worktrees) */
function isGitRepo(dirPath: string): boolean {
  const gitPath = resolve(dirPath, ".git");
  try {
    // statSync works for both files and directories
    statSync(gitPath);
    return true;
  } catch {
    // Fallback: check with existsSync (handles edge cases)
    return existsSync(gitPath);
  }
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
            return { name: e.name, path: fullPath, isGitRepo: isGitRepo(fullPath) };
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
          if (isGitRepo(fullPath)) {
            repos.push({ name: e.name, path: fullPath, isGitRepo: true, isSelf: isSelfRepo(fullPath) });
          }
        }
      } catch {
        // dir doesn't exist
      }
    }

    // Deduplicate by lowercase path (macOS has case-insensitive FS)
    const seen = new Set<string>();
    const deduped = repos.filter((r) => {
      const key = r.path.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return { data: deduped };
  });
}
