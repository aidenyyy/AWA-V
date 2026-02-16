import { resolve, normalize } from "node:path";
import { realpathSync } from "node:fs";

// packages/agent-server/src/utils/ → 4 levels up = repo root
const AWA_ROOT = resolve(import.meta.dirname, "../../../../");
let cachedRoot: string | null = null;

function getAwaRoot(): string {
  if (!cachedRoot) {
    try {
      cachedRoot = normalize(realpathSync(AWA_ROOT));
    } catch {
      cachedRoot = normalize(AWA_ROOT);
    }
  }
  return cachedRoot;
}

export function isSelfRepo(repoPath: string): boolean {
  try {
    return normalize(realpathSync(resolve(repoPath))) === getAwaRoot();
  } catch {
    return normalize(resolve(repoPath)) === getAwaRoot();
  }
}
