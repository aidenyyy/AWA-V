"use client";

import { useEffect, useState, useCallback } from "react";
import { buildManifestFromSkillMd } from "@awa-v/shared";
import { useSkillStore } from "@/stores/skill-store";
import { usePluginStore, type PluginInfo } from "@/stores/plugin-store";
import { SkillCard } from "@/components/skills/skill-card";
import { PluginCard } from "@/components/plugins/plugin-card";
import { cn } from "@/lib/cn";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useWebSocket } from "@/hooks/use-websocket";

type Tab = "installed" | "plugins";

export default function SkillsPage() {
  useWebSocket();
  const [tab, setTab] = useState<Tab>("installed");
  const [showGithubImport, setShowGithubImport] = useState(false);
  const [showManualImport, setShowManualImport] = useState(false);
  const [showPluginImport, setShowPluginImport] = useState(false);
  const [githubUrl, setGithubUrl] = useState("");
  const [pluginUrl, setPluginUrl] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualTags, setManualTags] = useState("");
  const [manualInstructions, setManualInstructions] = useState("");
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const {
    skills,
    loading: skillsLoading,
    error: skillsError,
    fetchSkills,
    toggleSkill,
    toggleStar: toggleSkillStar,
    importFromGithub,
    importFromFile,
    deleteSkill,
  } = useSkillStore();

  const {
    installed: plugins,
    loading: pluginsLoading,
    error: pluginsError,
    loadInstalled: loadPlugins,
    installPlugin,
    enablePlugin,
    disablePlugin,
    uninstallPlugin,
    toggleStar: togglePluginStar,
  } = usePluginStore();

  useEffect(() => {
    fetchSkills();
    loadPlugins();
  }, [fetchSkills, loadPlugins]);


  const starSort = (a: { starred: number }, b: { starred: number }) =>
    (b.starred || 0) - (a.starred || 0);
  const builtinSkills = skills.filter((s) => s.sourceKind === "builtin").sort(starSort);
  const githubSkills = skills.filter((s) => s.sourceKind === "github").sort(starSort);
  const manualSkills = skills.filter((s) => s.sourceKind === "manual").sort(starSort);
  const activeCount = skills.filter((s) => s.status === "active").length;

  const sortedPlugins = [...plugins].sort((a, b) =>
    (b.starred ? 1 : 0) - (a.starred ? 1 : 0)
  );

  async function handleGithubImport() {
    if (!githubUrl) return;
    setImporting(true);
    setImportError("");
    try {
      await importFromGithub(githubUrl);
      setShowGithubImport(false);
      setGithubUrl("");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleManualImport() {
    if (!manualName) return;
    setImporting(true);
    setImportError("");
    try {
      const { api } = await import("@/lib/api-client");
      await api.importSkill({
        name: manualName,
        description: manualDescription,
        tags: manualTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        instructions: manualInstructions,
        sourceUrl: "manual://",
      });
      await fetchSkills();
      setShowManualImport(false);
      setManualName("");
      setManualDescription("");
      setManualTags("");
      setManualInstructions("");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handlePluginImport() {
    if (!pluginUrl) return;
    setImporting(true);
    setImportError("");
    try {
      await installPlugin(pluginUrl);
      setShowPluginImport(false);
      setPluginUrl("");
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setImportError("");

    // Try folder drop first (webkitGetAsEntry)
    const items = e.dataTransfer.items;
    if (items?.length) {
      const firstItem = items[0];
      const entry = firstItem.webkitGetAsEntry?.();
      if (entry?.isDirectory) {
        setImporting(true);
        try {
          const manifest = await readSkillFromDirectoryEntry(entry as FileSystemDirectoryEntry);
          await importFromFile(manifest);
        } catch (err) {
          setImportError((err as Error).message);
        } finally {
          setImporting(false);
        }
        return;
      }
    }

    const file = e.dataTransfer.files[0];
    if (!file) return;

    setImporting(true);
    try {
      if (file.name.endsWith(".json")) {
        // JSON manifest file
        const text = await file.text();
        const manifest = JSON.parse(text);
        await importFromFile(manifest);
      } else if (file.name.endsWith(".zip")) {
        // Zip archive containing SKILL.md
        const JSZip = (await import("jszip")).default;
        const zip = await JSZip.loadAsync(file);
        const manifest = await readSkillFromZip(zip);
        await importFromFile(manifest);
      } else {
        setImportError("Unsupported file type. Drop a .json, .zip, or skill folder.");
      }
    } catch (err) {
      setImportError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }, [importFromFile]);

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main
        className="ml-16 flex-1 relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag-and-drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-void/80 backdrop-blur-sm pointer-events-none">
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-neon-cyan/50 bg-surface/80 px-12 py-10">
              <div className="text-3xl text-neon-cyan">&#8615;</div>
              <p className="font-mono text-sm text-neon-cyan">Drop skill file to install</p>
              <p className="font-mono text-[10px] text-text-muted">Supports .json, .zip, or skill folders with SKILL.md</p>
            </div>
          </div>
        )}

        <Header
          title="Skills & Plugins"
          subtitle="Global skill and plugin management"
        />

        <div className="mx-auto max-w-5xl p-6">
          {/* Top bar */}
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 font-mono text-[10px] text-text-muted">
                <span>
                  {skills.length} skills ({activeCount} active)
                </span>
                <span className="text-border">|</span>
                <span>{plugins.length} plugins</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {tab === "installed" && (
                <>
                  <button
                    onClick={() => {
                      setImportError("");
                      setShowGithubImport(true);
                    }}
                    className="rounded-lg border border-neon-magenta/40 bg-neon-magenta/10 px-3 py-1.5 font-mono text-xs text-neon-magenta transition hover:bg-neon-magenta/20"
                  >
                    + Import from GitHub
                  </button>
                  <button
                    onClick={() => {
                      setImportError("");
                      setShowManualImport(true);
                    }}
                    className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
                  >
                    + Manual Skill
                  </button>
                </>
              )}
              {tab === "plugins" && (
                <button
                  onClick={() => {
                    setImportError("");
                    setShowPluginImport(true);
                  }}
                  className="rounded-lg border border-neon-magenta/40 bg-neon-magenta/10 px-3 py-1.5 font-mono text-xs text-neon-magenta transition hover:bg-neon-magenta/20"
                >
                  + Import from GitHub
                </button>
              )}
            </div>
          </div>

          {/* 2-tab switcher */}
          <div className="mb-6 flex gap-1 rounded-lg bg-deep p-1 max-w-md">
            {(
              [
                ["installed", "Skills"],
                ["plugins", "Plugins"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "flex-1 rounded-md px-3 py-2 font-mono text-xs transition",
                  tab === key
                    ? "bg-surface text-neon-cyan"
                    : "text-text-muted hover:text-text-secondary"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Error display */}
          {(skillsError || pluginsError || importError) && (
            <div className="mb-4 rounded-lg border border-neon-red/30 bg-neon-red/5 px-4 py-2 font-mono text-xs text-neon-red">
              {importError || skillsError || pluginsError}
              {importError && (
                <button
                  onClick={() => setImportError("")}
                  className="ml-2 text-neon-red/50 hover:text-neon-red"
                >
                  &times;
                </button>
              )}
            </div>
          )}

          {/* Installed tab */}
          {tab === "installed" && (
            <div>
              {skillsLoading && skills.length === 0 ? (
                <div className="py-12 text-center font-mono text-xs text-text-muted">
                  Loading skills...
                </div>
              ) : (
                <>
                  <SkillGroup
                    label="Built-in"
                    color="text-neon-green"
                    skills={builtinSkills}
                    onToggle={toggleSkill}
                    onDelete={deleteSkill}
                    onToggleStar={toggleSkillStar}
                  />
                  <SkillGroup
                    label="From GitHub"
                    color="text-neon-magenta"
                    skills={githubSkills}
                    onToggle={toggleSkill}
                    onDelete={deleteSkill}
                    onToggleStar={toggleSkillStar}
                  />
                  <SkillGroup
                    label="Manual"
                    color="text-neon-blue"
                    skills={manualSkills}
                    onToggle={toggleSkill}
                    onDelete={deleteSkill}
                    onToggleStar={toggleSkillStar}
                  />

                  {skills.length === 0 && (
                    <div className="glass-card flex flex-col items-center justify-center p-12 text-center">
                      <p className="text-sm text-text-muted font-mono">
                        No skills configured
                      </p>
                      <p className="mt-1 text-[10px] text-text-muted">
                        Built-in skills will appear after the server starts for the
                        first time.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Plugins tab */}
          {tab === "plugins" && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {pluginsLoading && plugins.length === 0 ? (
                <div className="col-span-full py-12 text-center font-mono text-xs text-text-muted">
                  Loading plugins...
                </div>
              ) : plugins.length === 0 ? (
                <div className="col-span-full glass-card flex flex-col items-center justify-center p-12 text-center">
                  <p className="text-sm text-text-muted font-mono">
                    No plugins installed
                  </p>
                </div>
              ) : (
                sortedPlugins.map((plugin: PluginInfo) => (
                  <PluginCard
                    key={plugin.id}
                    plugin={plugin}
                    mode="installed"
                    onEnable={() => enablePlugin(plugin.id)}
                    onDisable={() => disablePlugin(plugin.id)}
                    onUninstall={() => uninstallPlugin(plugin.id)}
                    onToggleStar={() => togglePluginStar(plugin.id)}
                  />
                ))
              )}
            </div>
          )}

          {/* GitHub import dialog (skills) */}
          {showGithubImport && (
            <ImportDialog
              title="Import from GitHub"
              onClose={() => setShowGithubImport(false)}
            >
              {importError && (
                <div className="mb-4 rounded-lg border border-neon-red/30 bg-neon-red/5 px-3 py-2 font-mono text-[10px] text-neon-red">
                  {importError}
                </div>
              )}
              <div className="mb-4">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  GitHub Repository URL
                </label>
                <input
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                  placeholder="https://github.com/owner/repo"
                />
                <p className="mt-1 text-[10px] text-text-muted">
                  Supports awa-v-skill.json or native Claude plugin format (.claude-plugin/plugin.json)
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleGithubImport}
                  disabled={!githubUrl || importing}
                  className="flex-1 rounded-lg border border-neon-magenta/40 bg-neon-magenta/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-magenta transition hover:bg-neon-magenta/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {importing ? "Importing..." : "Import"}
                </button>
                <button
                  onClick={() => setShowGithubImport(false)}
                  className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </ImportDialog>
          )}

          {/* Manual import dialog */}
          {showManualImport && (
            <ImportDialog
              title="Add Manual Skill"
              onClose={() => setShowManualImport(false)}
            >
              {importError && (
                <div className="mb-4 rounded-lg border border-neon-red/30 bg-neon-red/5 px-3 py-2 font-mono text-[10px] text-neon-red">
                  {importError}
                </div>
              )}
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Name
                  </label>
                  <input
                    value={manualName}
                    onChange={(e) => setManualName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                    placeholder="my-custom-skill"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Description
                  </label>
                  <input
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                    placeholder="What this skill does..."
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Tags (comma-separated)
                  </label>
                  <input
                    value={manualTags}
                    onChange={(e) => setManualTags(e.target.value)}
                    className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                    placeholder="testing, react, api"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Instructions
                  </label>
                  <textarea
                    value={manualInstructions}
                    onChange={(e) => setManualInstructions(e.target.value)}
                    rows={5}
                    className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none resize-y"
                    placeholder="Detailed instructions for the agent..."
                  />
                </div>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleManualImport}
                  disabled={!manualName || importing}
                  className="flex-1 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {importing ? "Adding..." : "Add Skill"}
                </button>
                <button
                  onClick={() => setShowManualImport(false)}
                  className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </ImportDialog>
          )}

          {/* Plugin import dialog */}
          {showPluginImport && (
            <ImportDialog
              title="Import Plugin from GitHub"
              onClose={() => setShowPluginImport(false)}
            >
              {importError && (
                <div className="mb-4 rounded-lg border border-neon-red/30 bg-neon-red/5 px-3 py-2 font-mono text-[10px] text-neon-red">
                  {importError}
                </div>
              )}
              <div className="mb-4">
                <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  GitHub URL or Plugin Identifier
                </label>
                <input
                  value={pluginUrl}
                  onChange={(e) => setPluginUrl(e.target.value)}
                  className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                  placeholder="https://github.com/owner/plugin or plugin-name@scope"
                />
                <p className="mt-1 text-[10px] text-text-muted">
                  Enter a GitHub URL or plugin identifier
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handlePluginImport}
                  disabled={!pluginUrl || importing}
                  className="flex-1 rounded-lg border border-neon-magenta/40 bg-neon-magenta/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-magenta transition hover:bg-neon-magenta/20 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {importing ? "Installing..." : "Install"}
                </button>
                <button
                  onClick={() => setShowPluginImport(false)}
                  className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
                >
                  Cancel
                </button>
              </div>
            </ImportDialog>
          )}
        </div>
      </main>
    </div>
  );
}

// ─── Skill file parsing helpers ──────────────────────────────

/** Read SKILL.md from a zip archive (searches root and one level deep) */
async function readSkillFromZip(zip: import("jszip")): Promise<Record<string, unknown>> {
  // Try root SKILL.md first
  let skillFile = zip.file("SKILL.md");

  // Try one directory deep (e.g. senior-qa/SKILL.md)
  if (!skillFile) {
    const allFiles = Object.keys(zip.files);
    const match = allFiles.find((f) => f.match(/^[^/]+\/SKILL\.md$/));
    if (match) skillFile = zip.file(match);
  }

  if (!skillFile) {
    // Fall back to awa-v-skill.json inside the zip
    let jsonFile = zip.file("awa-v-skill.json");
    if (!jsonFile) {
      const allFiles = Object.keys(zip.files);
      const match = allFiles.find((f) => f.match(/^[^/]+\/awa-v-skill\.json$/));
      if (match) jsonFile = zip.file(match);
    }
    if (jsonFile) {
      const text = await jsonFile.async("text");
      return JSON.parse(text);
    }
    throw new Error("No SKILL.md or awa-v-skill.json found in zip archive.");
  }

  const content = await skillFile.async("text");
  return buildManifestFromSkillMd(content);
}

/** Read a file from a FileSystemDirectoryEntry */
function readFileEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

/** Read all entries from a FileSystemDirectoryEntry */
function readDirectoryEntries(dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const allEntries: FileSystemEntry[] = [];
    function readBatch() {
      reader.readEntries((entries) => {
        if (entries.length === 0) {
          resolve(allEntries);
        } else {
          allEntries.push(...entries);
          readBatch();
        }
      }, reject);
    }
    readBatch();
  });
}

/** Read SKILL.md from a dropped directory */
async function readSkillFromDirectoryEntry(dirEntry: FileSystemDirectoryEntry): Promise<Record<string, unknown>> {
  const entries = await readDirectoryEntries(dirEntry);

  // Look for SKILL.md
  const skillEntry = entries.find((e) => e.name === "SKILL.md" && e.isFile);
  if (skillEntry) {
    const file = await readFileEntry(skillEntry as FileSystemFileEntry);
    const content = await file.text();
    return buildManifestFromSkillMd(content);
  }

  // Look for awa-v-skill.json
  const jsonEntry = entries.find((e) => e.name === "awa-v-skill.json" && e.isFile);
  if (jsonEntry) {
    const file = await readFileEntry(jsonEntry as FileSystemFileEntry);
    const text = await file.text();
    return JSON.parse(text);
  }

  throw new Error(`No SKILL.md or awa-v-skill.json found in folder "${dirEntry.name}".`);
}

// ─── Sub-components ─────────────────────────────────────────

function ImportDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="glass-card w-full max-w-md p-6">
        <h3 className="mb-4 font-mono text-sm font-semibold text-text-primary">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}

function SkillGroup({
  label,
  color,
  skills,
  onToggle,
  onDelete,
  onToggleStar,
}: {
  label: string;
  color: string;
  skills: Array<import("@awa-v/shared").Skill>;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
}) {
  if (skills.length === 0) return null;

  return (
    <div className="mb-6">
      <h3
        className={cn(
          "mb-3 font-mono text-xs uppercase tracking-wider",
          color
        )}
      >
        {label} ({skills.length})
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            onToggle={() => onToggle(skill.id)}
            onDelete={() => onDelete(skill.id)}
            onToggleStar={() => onToggleStar(skill.id)}
          />
        ))}
      </div>
    </div>
  );
}
