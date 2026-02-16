import { skillManifestSchema } from "@awa-v/shared";
import { skillRepo } from "../db/repositories/skill-repo.js";
import pino from "pino";

const log = pino({ name: "skill-importer" });

// ─── GitHub URL Parsing ─────────────────────────────────────

/**
 * Parse a GitHub URL into owner/repo and optional path.
 * Supports:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/main/path/to/skill
 */
function parseGithubUrl(url: string): { owner: string; repo: string; path: string } {
  const parsed = new URL(url);
  if (parsed.hostname !== "github.com") {
    throw new Error("Only github.com URLs are supported");
  }

  const segments = parsed.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
  if (segments.length < 2) {
    throw new Error("URL must include owner and repo: https://github.com/owner/repo");
  }

  const owner = segments[0];
  const repo = segments[1];

  // If URL has /tree/branch/path or /blob/branch/path, extract the path portion
  let path = "";
  if (segments.length > 3 && (segments[2] === "tree" || segments[2] === "blob")) {
    // segments[3] is the branch, segments[4+] is the path
    path = segments.slice(4).join("/");
  }

  return { owner, repo, path };
}

// ─── Raw GitHub Fetching ────────────────────────────────────

const BRANCH_CANDIDATES = ["main", "master", "HEAD"];

/**
 * Try fetching a file from a GitHub repo across multiple branches.
 * Returns the response body as text, or null if not found on any branch.
 */
async function fetchRawFile(
  owner: string,
  repo: string,
  filePath: string
): Promise<string | null> {
  for (const branch of BRANCH_CANDIDATES) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.text();
      }
    } catch {
      // Try next branch
    }
  }
  return null;
}

/**
 * Fetch and parse a JSON file from a GitHub repo across branches.
 */
async function fetchRawJson<T>(
  owner: string,
  repo: string,
  filePath: string
): Promise<T | null> {
  const text = await fetchRawFile(owner, repo, filePath);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─── Native Claude Plugin Format ────────────────────────────
//
// Claude Code plugins/skills use this structure:
//   .claude-plugin/plugin.json   — plugin metadata, lists skill paths
//   .claude/skills/<name>/SKILL.md  — skill instructions (markdown)

interface ClaudePluginJson {
  name: string;
  description: string;
  version?: string;
  author?: { name: string };
  license?: string;
  keywords?: string[];
  skills?: string[]; // e.g. ["./.claude/skills/my-skill"]
}

/**
 * Try to import a skill using the native Claude plugin format.
 * Looks for .claude-plugin/plugin.json, reads skill paths from it,
 * fetches SKILL.md content as instructions.
 */
async function tryImportNativePlugin(
  owner: string,
  repo: string,
  path: string
): Promise<{
  name: string;
  description: string;
  tags: string[];
  instructions: string;
  version?: string;
  manifestUrl: string;
} | null> {
  const prefix = path ? `${path}/` : "";

  // Try .claude-plugin/plugin.json
  const pluginJson = await fetchRawJson<ClaudePluginJson>(
    owner,
    repo,
    `${prefix}.claude-plugin/plugin.json`
  );

  if (!pluginJson) return null;

  log.info(
    { owner, repo, name: pluginJson.name },
    "Found native Claude plugin.json"
  );

  // Fetch SKILL.md from the skill paths listed in plugin.json
  let instructions = "";
  if (pluginJson.skills && pluginJson.skills.length > 0) {
    for (const skillPath of pluginJson.skills) {
      // Normalize: "./.claude/skills/foo" → ".claude/skills/foo"
      const normalized = skillPath.replace(/^\.\//, "");
      const skillMd = await fetchRawFile(
        owner,
        repo,
        `${prefix}${normalized}/SKILL.md`
      );
      if (skillMd) {
        instructions += (instructions ? "\n\n---\n\n" : "") + skillMd;
      }
    }
  }

  // If no SKILL.md found from paths, try common locations
  if (!instructions) {
    const fallbackPaths = [
      `${prefix}.claude/skills/${pluginJson.name}/SKILL.md`,
      `${prefix}SKILL.md`,
    ];
    for (const p of fallbackPaths) {
      const content = await fetchRawFile(owner, repo, p);
      if (content) {
        instructions = content;
        break;
      }
    }
  }

  // Use description as fallback if still no instructions
  if (!instructions) {
    instructions = pluginJson.description;
  }

  const manifestUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/${prefix}.claude-plugin/plugin.json`;

  return {
    name: pluginJson.name,
    description: pluginJson.description,
    tags: pluginJson.keywords ?? [],
    instructions,
    version: pluginJson.version,
    manifestUrl,
  };
}

// ─── AWA-V Custom Format ────────────────────────────────────

/**
 * Build candidate URLs for awa-v-skill.json (custom AWA-V format).
 */
function buildAwaSkillUrls(owner: string, repo: string, path: string): string[] {
  const urls: string[] = [];
  for (const branch of BRANCH_CANDIDATES) {
    const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}`;
    if (path) {
      urls.push(`${base}/${path}/awa-v-skill.json`);
      if (path.endsWith(".json")) {
        urls.push(`${base}/${path}`);
      }
    }
    urls.push(`${base}/awa-v-skill.json`);
  }
  return urls;
}

/**
 * Try fetching a manifest JSON from a list of candidate URLs.
 */
async function tryFetchFromUrls(
  urls: string[]
): Promise<{ data: unknown; url: string } | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        return { data, url };
      }
    } catch {
      // Try next URL
    }
  }
  return null;
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Import a skill from a GitHub repository.
 *
 * Resolution order:
 * 1. awa-v-skill.json (custom AWA-V format)
 * 2. .claude-plugin/plugin.json (native Claude plugin format)
 */
export async function importFromGithub(githubUrl: string) {
  log.info({ githubUrl }, "Importing skill from GitHub");

  const { owner, repo, path } = parseGithubUrl(githubUrl);

  // 1. Try AWA-V custom format first
  const awaUrls = buildAwaSkillUrls(owner, repo, path);
  const awaResult = await tryFetchFromUrls(awaUrls);

  if (awaResult) {
    const manifest = skillManifestSchema.parse(awaResult.data);

    const existing = skillRepo.getByName(manifest.name);
    if (existing) {
      throw new Error(`Skill "${manifest.name}" already exists (id: ${existing.id})`);
    }

    const skill = skillRepo.create({
      name: manifest.name,
      description: manifest.description,
      tags: manifest.tags,
      instructions: manifest.instructions,
      sourceUrl: githubUrl,
      manifestUrl: awaResult.url,
      sourceKind: "github",
      type: "manual",
      status: "active",
      pluginDir: manifest.pluginDir ?? "",
    });

    log.info({ name: manifest.name, id: skill.id }, "Skill imported from GitHub (awa-v format)");
    return skill;
  }

  // 2. Try native Claude plugin format
  const nativeResult = await tryImportNativePlugin(owner, repo, path);

  if (nativeResult) {
    const existing = skillRepo.getByName(nativeResult.name);
    if (existing) {
      throw new Error(`Skill "${nativeResult.name}" already exists (id: ${existing.id})`);
    }

    const skill = skillRepo.create({
      name: nativeResult.name,
      description: nativeResult.description,
      tags: nativeResult.tags,
      instructions: nativeResult.instructions,
      sourceUrl: githubUrl,
      manifestUrl: nativeResult.manifestUrl,
      sourceKind: "github",
      type: "manual",
      status: "active",
    });

    log.info({ name: nativeResult.name, id: skill.id }, "Skill imported from GitHub (native Claude format)");
    return skill;
  }

  // Nothing found
  throw new Error(
    `Could not find skill manifest in ${owner}/${repo}. ` +
    `Expected awa-v-skill.json or .claude-plugin/plugin.json. ` +
    `Tried branches: ${BRANCH_CANDIDATES.join(", ")}`
  );
}
