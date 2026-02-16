import type { FastifyInstance } from "fastify";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { starredPluginRepo } from "../db/repositories/starred-plugin-repo.js";
import pino from "pino";

const log = pino({ name: "plugins-api" });

/** Raw output from `claude plugin list --json` */
interface CliPluginEntry {
  id: string;
  version?: string;
  scope?: string;
  enabled?: boolean;
  installPath?: string;
  installedAt?: string;
  lastUpdated?: string;
  errors?: string[];
}

/** On-disk .claude-plugin/plugin.json */
interface PluginManifest {
  name?: string;
  description?: string;
  version?: string;
  author?: { name?: string; email?: string };
  homepage?: string;
  repository?: string;
  keywords?: string[];
  skills?: string[];
}

/** Enriched plugin info returned to the frontend */
interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  scope: string;
  status: string;
  keywords: string[];
  skills: string[];
  installPath: string;
  marketplace: string;
  errors: string[];
  starred: boolean;
}

/** Execute a claude CLI command and return parsed output */
function execClaude(args: string[]): string {
  try {
    const result = execFileSync("claude", args, {
      encoding: "utf-8",
      timeout: 30_000,
    });
    return result.trim();
  } catch (err) {
    const error = err as { stderr?: string; message: string };
    log.error({ args, error: error.stderr ?? error.message }, "Claude CLI command failed");
    throw new Error(error.stderr ?? error.message);
  }
}

/** Try to parse JSON output, fall back to null */
function tryParseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Read .claude-plugin/plugin.json from a plugin's installPath to get
 * the display name, description, keywords, etc.
 */
function readPluginManifest(installPath: string): PluginManifest | null {
  const manifestPath = join(installPath, ".claude-plugin", "plugin.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    return JSON.parse(raw) as PluginManifest;
  } catch {
    return null;
  }
}

/**
 * List skill names from a plugin's installPath by reading the skills directory.
 */
function readPluginSkills(installPath: string): string[] {
  const skillsDir = join(installPath, "skills");
  if (!existsSync(skillsDir)) return [];
  try {
    const { readdirSync } = require("node:fs");
    const entries = readdirSync(skillsDir, { withFileTypes: true }) as Array<{
      name: string;
      isDirectory: () => boolean;
    }>;
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}

/**
 * Enrich raw CLI plugin entries with metadata from their on-disk plugin.json.
 */
function enrichPlugins(cliEntries: CliPluginEntry[]): PluginInfo[] {
  const starredIds = new Set(starredPluginRepo.getAll());

  return cliEntries.map((entry) => {
    // Parse id: "superpowers@claude-plugins-official" → name="superpowers", marketplace="claude-plugins-official"
    const [shortName, marketplace] = entry.id.includes("@")
      ? entry.id.split("@", 2)
      : [entry.id, ""];

    let manifest: PluginManifest | null = null;
    let skills: string[] = [];

    if (entry.installPath && existsSync(entry.installPath)) {
      manifest = readPluginManifest(entry.installPath);
      skills = readPluginSkills(entry.installPath);
    }

    return {
      id: entry.id,
      name: manifest?.name ?? shortName,
      description: manifest?.description ?? "",
      version: entry.version ?? manifest?.version ?? "",
      scope: entry.scope ?? "",
      status: entry.enabled === false ? "disabled" : "enabled",
      keywords: manifest?.keywords ?? [],
      skills,
      installPath: entry.installPath ?? "",
      marketplace,
      errors: entry.errors ?? [],
      starred: starredIds.has(entry.id),
    };
  });
}

export function registerPluginRoutes(app: FastifyInstance) {
  // List installed plugins (enriched with on-disk metadata)
  app.get("/api/plugins/installed", async () => {
    try {
      const raw = execClaude(["plugin", "list", "--json"]);
      const parsed = tryParseJson<CliPluginEntry[]>(raw);
      return { data: parsed ? enrichPlugins(parsed) : [] };
    } catch (err) {
      return { data: [], error: (err as Error).message };
    }
  });

  // List available plugins from marketplaces
  app.get("/api/plugins/available", async () => {
    try {
      const raw = execClaude(["plugin", "list", "--json", "--available"]);
      const parsed = tryParseJson<CliPluginEntry[]>(raw);
      return { data: parsed ? enrichPlugins(parsed) : [] };
    } catch (err) {
      return { data: [], error: (err as Error).message };
    }
  });

  // Install a plugin
  app.post<{ Body: { pluginId: string } }>(
    "/api/plugins/install",
    async (request) => {
      const { pluginId } = request.body;
      if (!pluginId) {
        return { error: "pluginId is required" };
      }

      try {
        const raw = execClaude(["plugin", "install", pluginId]);
        log.info({ pluginId }, "Plugin installed");
        return { data: { success: true, output: raw } };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  );

  // Uninstall a plugin
  app.post<{ Body: { pluginId: string } }>(
    "/api/plugins/uninstall",
    async (request) => {
      const { pluginId } = request.body;
      if (!pluginId) {
        return { error: "pluginId is required" };
      }

      try {
        const raw = execClaude(["plugin", "uninstall", pluginId]);
        log.info({ pluginId }, "Plugin uninstalled");
        return { data: { success: true, output: raw } };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  );

  // Enable a plugin
  app.post<{ Body: { pluginId: string } }>(
    "/api/plugins/enable",
    async (request) => {
      const { pluginId } = request.body;
      if (!pluginId) {
        return { error: "pluginId is required" };
      }

      try {
        const raw = execClaude(["plugin", "enable", pluginId]);
        log.info({ pluginId }, "Plugin enabled");
        return { data: { success: true, output: raw } };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  );

  // Disable a plugin
  app.post<{ Body: { pluginId: string } }>(
    "/api/plugins/disable",
    async (request) => {
      const { pluginId } = request.body;
      if (!pluginId) {
        return { error: "pluginId is required" };
      }

      try {
        const raw = execClaude(["plugin", "disable", pluginId]);
        log.info({ pluginId }, "Plugin disabled");
        return { data: { success: true, output: raw } };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  );

  // Refresh plugin list
  app.post("/api/plugins/refresh", async () => {
    try {
      const raw = execClaude(["plugin", "list", "--json"]);
      const parsed = tryParseJson<CliPluginEntry[]>(raw);
      return { data: parsed ? enrichPlugins(parsed) : [] };
    } catch (err) {
      return { data: [], error: (err as Error).message };
    }
  });

  // Add a marketplace source
  app.post<{ Body: { source: string } }>(
    "/api/plugins/marketplace/add",
    async (request) => {
      const { source } = request.body;
      if (!source) {
        return { error: "source is required" };
      }

      try {
        const raw = execClaude(["plugin", "marketplace", "add", source]);
        log.info({ source }, "Marketplace added");
        return { data: { success: true, output: raw } };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }
  );

  // Star a plugin
  app.post<{ Body: { pluginId: string } }>(
    "/api/plugins/star",
    async (request) => {
      const { pluginId } = request.body;
      if (!pluginId) {
        return { error: "pluginId is required" };
      }
      starredPluginRepo.star(pluginId);
      return { data: { success: true, starred: true } };
    }
  );

  // Unstar a plugin
  app.post<{ Body: { pluginId: string } }>(
    "/api/plugins/unstar",
    async (request) => {
      const { pluginId } = request.body;
      if (!pluginId) {
        return { error: "pluginId is required" };
      }
      starredPluginRepo.unstar(pluginId);
      return { data: { success: true, starred: false } };
    }
  );

  // List marketplaces
  app.get("/api/plugins/marketplaces", async () => {
    try {
      const raw = execClaude(["plugin", "marketplace", "list", "--json"]);
      const parsed = tryParseJson<unknown[]>(raw);
      return { data: parsed ?? [] };
    } catch (err) {
      return { data: [], error: (err as Error).message };
    }
  });
}
