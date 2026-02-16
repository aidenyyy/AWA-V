"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

import { useWebSocket } from "@/hooks/use-websocket";
import { useConnectionStatus } from "@/hooks/use-connection-status";
import { api } from "@/lib/api-client";
import type { Project } from "@awa-v/shared";

interface DirEntry {
  name: string;
  path: string;
  isGitRepo: boolean;
  isSelf?: boolean;
}

type CreateMode = "detect" | "browse" | "manual";

interface DashboardStats {
  totalProjects: number;
  activePipelines: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  tokensByModel: {
    haiku: { input: number; output: number };
    sonnet: { input: number; output: number };
    opus: { input: number; output: number };
  };
  totalEvolutions: number;
  totalMemories: number;
  activeSessions: number;
  pendingSelfUpdates: number;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default function DashboardPage() {
  useWebSocket();
  const connected = useConnectionStatus();
  const [projects, setProjects] = useState<Project[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [mode, setMode] = useState<CreateMode>("detect");

  // Detect repos
  const [detectedRepos, setDetectedRepos] = useState<DirEntry[]>([]);
  const [detectLoading, setDetectLoading] = useState(false);

  // Browse
  const [browseCurrent, setBrowseCurrent] = useState("");
  const [browseParent, setBrowseParent] = useState("");
  const [browseEntries, setBrowseEntries] = useState<DirEntry[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);

  useEffect(() => {
    api.getProjects().then((p) => setProjects(p as Project[]));
    api.getDashboardStats().then((s) => setStats(s as DashboardStats)).catch(() => {});
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      api.getDashboardStats().then((s) => setStats(s as DashboardStats)).catch(() => {});
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  function openCreate() {
    setShowCreate(true);
    setMode("detect");
    setNewName("");
    setNewPath("");
    loadDetectedRepos();
  }

  async function loadDetectedRepos() {
    setDetectLoading(true);
    try {
      const repos = (await api.detectRepos()) as DirEntry[];
      setDetectedRepos(repos);
    } catch {
      setDetectedRepos([]);
    }
    setDetectLoading(false);
  }

  async function browseTo(path?: string) {
    setBrowseLoading(true);
    try {
      const result = (await api.browseDirs(path)) as {
        current: string;
        parent: string;
        entries: DirEntry[];
      };
      setBrowseCurrent(result.current);
      setBrowseParent(result.parent);
      setBrowseEntries(result.entries);
    } catch {
      setBrowseEntries([]);
    }
    setBrowseLoading(false);
  }

  function selectRepo(entry: DirEntry) {
    setNewPath(entry.path);
    if (!newName) setNewName(entry.name);
  }

  async function handleCreate() {
    if (!newName || !newPath) return;
    const project = await api.createProject({
      name: newName,
      repoPath: newPath,
    });
    setProjects((prev) => [...prev, project as Project]);
    setShowCreate(false);
    setNewName("");
    setNewPath("");
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <main className="ml-16 flex-1">
        <Header
          title="AWA-V"
          subtitle="AI Workflow Automation"
          actions={
            <button
              onClick={openCreate}
              className="rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-3 py-1.5 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
            >
              + New Project
            </button>
          }
        />

        <div className="p-6">
          {/* Stats overview */}
          <div className="mb-4 grid grid-cols-4 gap-4">
            {[
              { label: "Projects", value: projects.length, color: "text-neon-cyan" },
              { label: "Active Pipelines", value: stats?.activePipelines ?? 0, color: "text-neon-green" },
              { label: "Active Sessions", value: stats?.activeSessions ?? 0, color: "text-neon-magenta" },
              { label: "System", value: connected ? "Online" : "Offline", color: connected ? "text-neon-green" : "text-neon-red" },
            ].map((stat) => (
              <div key={stat.label} className="glass-card p-4">
                <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted">
                  {stat.label}
                </div>
                <div className={`mt-1 text-xl font-mono font-semibold ${stat.color}`}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>

          {/* Token Usage + System Activity */}
          <div className="mb-8 grid grid-cols-4 gap-4">
            {/* Token Usage by Model */}
            <div className="glass-card col-span-2 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-3">
                Token Usage by Model
              </div>
              {stats && (() => {
                const models = [
                  { key: "haiku" as const, label: "Haiku", color: "text-neon-green", barColor: "bg-neon-green" },
                  { key: "sonnet" as const, label: "Sonnet", color: "text-neon-cyan", barColor: "bg-neon-cyan" },
                  { key: "opus" as const, label: "Opus", color: "text-neon-magenta", barColor: "bg-neon-magenta" },
                ]
                  .map((m) => ({
                    ...m,
                    input: stats.tokensByModel[m.key]?.input ?? 0,
                    output: stats.tokensByModel[m.key]?.output ?? 0,
                    total: (stats.tokensByModel[m.key]?.input ?? 0) + (stats.tokensByModel[m.key]?.output ?? 0),
                  }))
                  .sort((a, b) => b.total - a.total);

                const maxTotal = Math.max(...models.map((m) => m.total), 1);

                return (
                  <div className="space-y-2.5">
                    {models.map((m) => (
                      <div key={m.key}>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`font-mono text-xs font-semibold ${m.color}`}>
                            {m.label}
                          </span>
                          <span className="flex gap-3 font-mono text-[10px] text-text-muted">
                            <span>&#8595; {formatTokens(m.input)}</span>
                            <span>&#8593; {formatTokens(m.output)}</span>
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-deep">
                          <div
                            className={`h-full ${m.barColor} rounded-full transition-all duration-500`}
                            style={{ width: `${(m.total / maxTotal) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {models.every((m) => m.total === 0) && (
                      <div className="py-2 text-center font-mono text-[10px] text-text-muted">
                        No token usage yet
                      </div>
                    )}
                  </div>
                );
              })()}
              {!stats && (
                <div className="py-2 text-center font-mono text-[10px] text-text-muted">
                  Loading...
                </div>
              )}
            </div>

            {/* System Activity */}
            <div className="glass-card col-span-2 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-3">
                System Activity
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-secondary">Evolutions</span>
                  <span className="font-mono text-sm font-semibold text-neon-cyan">
                    {stats?.totalEvolutions ?? 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-text-secondary">Memories</span>
                  <span className="font-mono text-sm font-semibold text-neon-cyan">
                    {stats?.totalMemories ?? 0}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Projects grid */}
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-mono text-sm font-semibold text-text-primary">
              Projects
            </h2>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="glass-card block p-5 transition hover:border-neon-cyan/30"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-mono text-sm font-semibold text-text-primary">
                        {project.name}
                      </h3>
                      {project.isSelfRepo === 1 && (
                        <span className="rounded border border-neon-magenta/30 px-1 py-0.5 text-[9px] font-mono text-neon-magenta">
                          SELF
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-mono text-text-muted truncate max-w-[250px]">
                      {project.repoPath}
                    </p>
                  </div>
                  <span className="indicator indicator-active" />
                </div>

              </Link>
            ))}

            {projects.length === 0 && !showCreate && (
              <div className="glass-card col-span-3 flex flex-col items-center justify-center p-12 text-center">
                <div className="text-4xl mb-4 opacity-20">&#9670;</div>
                <p className="text-sm text-text-muted font-mono">No projects yet</p>
                <button
                  onClick={openCreate}
                  className="mt-4 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2 font-mono text-xs text-neon-cyan transition hover:bg-neon-cyan/20"
                >
                  Create First Project
                </button>
              </div>
            )}
          </div>

          {/* Create project dialog */}
          {showCreate && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm">
              <div className="glass-card w-full max-w-lg p-6">
                <h3 className="mb-4 font-mono text-sm font-semibold text-text-primary">
                  New Project
                </h3>

                {/* Mode tabs */}
                <div className="mb-4 flex gap-1 rounded-lg bg-deep p-1">
                  {(
                    [
                      ["detect", "Existing Repos"],
                      ["browse", "Browse"],
                      ["manual", "Manual Path"],
                    ] as const
                  ).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => {
                        setMode(m);
                        if (m === "detect") loadDetectedRepos();
                        if (m === "browse" && !browseCurrent) browseTo();
                      }}
                      className={`flex-1 rounded-md px-3 py-1.5 font-mono text-[11px] transition ${
                        mode === m
                          ? "bg-surface text-neon-cyan"
                          : "text-text-muted hover:text-text-secondary"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* Detected repos */}
                {mode === "detect" && (
                  <div className="mb-4 max-h-64 overflow-y-auto custom-scrollbar">
                    {detectLoading ? (
                      <div className="py-8 text-center font-mono text-xs text-text-muted">
                        Scanning...
                      </div>
                    ) : detectedRepos.length === 0 ? (
                      <div className="py-8 text-center font-mono text-xs text-text-muted">
                        No git repos found in common locations.
                        <br />
                        Try Browse or Manual Path.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {detectedRepos.map((repo) => (
                          <button
                            key={repo.path}
                            onClick={() => selectRepo(repo)}
                            className={`w-full rounded-lg border px-3 py-2.5 text-left font-mono transition ${
                              newPath === repo.path
                                ? "border-neon-cyan/50 bg-neon-cyan/10"
                                : "border-border hover:border-neon-cyan/20 hover:bg-surface"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-neon-green text-xs">&#9679;</span>
                              <span className="text-xs text-text-primary">{repo.name}</span>
                              {repo.isSelf && (
                                <span className="rounded border border-neon-magenta/30 px-1 py-0.5 text-[9px] text-neon-magenta">
                                  SELF
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 text-[10px] text-text-muted ml-4 truncate">
                              {repo.path}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Browse mode */}
                {mode === "browse" && (
                  <div className="mb-4">
                    {/* Current path */}
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        onClick={() => browseTo(browseParent)}
                        disabled={browseCurrent === browseParent}
                        className="rounded border border-border px-2 py-1 font-mono text-[10px] text-text-muted transition hover:bg-surface disabled:opacity-30"
                      >
                        &#8593; Up
                      </button>
                      <span className="truncate font-mono text-[10px] text-text-secondary">
                        {browseCurrent}
                      </span>
                    </div>

                    <div className="max-h-56 overflow-y-auto custom-scrollbar rounded-lg border border-border">
                      {browseLoading ? (
                        <div className="py-6 text-center font-mono text-xs text-text-muted">
                          Loading...
                        </div>
                      ) : browseEntries.length === 0 ? (
                        <div className="py-6 text-center font-mono text-xs text-text-muted">
                          Empty directory
                        </div>
                      ) : (
                        browseEntries.map((entry) => (
                          <div
                            key={entry.path}
                            className="flex items-center border-b border-border/50 last:border-0"
                          >
                            <button
                              onClick={() => browseTo(entry.path)}
                              className="flex-1 px-3 py-2 text-left font-mono text-xs text-text-primary transition hover:bg-surface"
                            >
                              <span className="mr-2 text-text-muted">
                                {entry.isGitRepo ? (
                                  <span className="text-neon-green">&#9679;</span>
                                ) : (
                                  <span className="text-text-muted">&#9675;</span>
                                )}
                              </span>
                              {entry.name}
                            </button>
                            <button
                              onClick={() => selectRepo(entry)}
                              className={`mr-2 rounded border px-2 py-0.5 font-mono text-[10px] transition ${
                                entry.isGitRepo
                                  ? "border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/10"
                                  : "border-border text-text-muted hover:bg-surface"
                              }`}
                            >
                              Select
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {/* Manual mode */}
                {mode === "manual" && (
                  <div className="mb-4">
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      Repository Path
                    </label>
                    <input
                      value={newPath}
                      onChange={(e) => setNewPath(e.target.value)}
                      className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                      placeholder="/path/to/repo"
                    />
                  </div>
                )}

                {/* Selected path display */}
                {newPath && (
                  <div className="mb-4 rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 px-3 py-2">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      Selected
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-neon-cyan truncate">
                      {newPath}
                    </div>
                  </div>
                )}

                {/* Name input */}
                <div className="mb-4">
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Project Name
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full rounded-lg border border-border bg-deep px-3 py-2 font-mono text-xs text-text-primary focus:border-neon-cyan/50 focus:outline-none"
                    placeholder="My Project"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={handleCreate}
                    disabled={!newName || !newPath}
                    className="flex-1 rounded-lg border border-neon-cyan/40 bg-neon-cyan/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-cyan transition hover:bg-neon-cyan/20 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Create Project
                  </button>
                  <button
                    onClick={() => setShowCreate(false)}
                    className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

    </div>
  );
}
