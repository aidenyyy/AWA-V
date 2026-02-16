const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:2078";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const headers: Record<string, string> = { ...options?.headers as Record<string, string> };
  if (options?.body) {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `API error: ${res.status}`
    );
  }

  if (res.status === 204) return undefined as T;
  const json = await res.json();
  return (json as { data: T }).data;
}

export const api = {
  // Projects
  getProjects: () => request<unknown[]>("/api/projects"),
  getProject: (id: string) => request<unknown>(`/api/projects/${id}`),
  createProject: (data: unknown) =>
    request<unknown>("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateProject: (id: string, data: unknown) =>
    request<unknown>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  deleteProject: (id: string) =>
    request<void>(`/api/projects/${id}`, { method: "DELETE" }),

  // Dashboard
  getDashboardStats: () => request<unknown>("/api/dashboard/stats"),

  // Pipelines
  getPipelines: (projectId: string) =>
    request<unknown[]>(`/api/pipelines?projectId=${projectId}`),
  getPipeline: (id: string) => request<unknown>(`/api/pipelines/${id}`),
  createPipeline: (data: { projectId: string; requirements: string }) =>
    request<unknown>("/api/pipelines", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  replanPipeline: (id: string) =>
    request<unknown>(`/api/pipelines/${id}/replan`, { method: "POST" }),
  cancelPipeline: (id: string) =>
    request<unknown>(`/api/pipelines/${id}/cancel`, { method: "POST" }),
  pausePipeline: (id: string) =>
    request<unknown>(`/api/pipelines/${id}/pause`, { method: "POST" }),
  resumePipeline: (id: string) =>
    request<unknown>(`/api/pipelines/${id}/resume`, { method: "POST" }),
  getPendingSelfUpdates: () =>
    request<unknown[]>("/api/pipelines/pending-self-updates"),
  mergeSelfPipeline: (id: string) =>
    request<{ message: string; branch: string }>(`/api/pipelines/${id}/merge-self`, { method: "POST" }),

  // Plans
  getPlans: (pipelineId: string) =>
    request<unknown[]>(`/api/plans?pipelineId=${pipelineId}`),
  getLatestPlan: (pipelineId: string) =>
    request<unknown>(`/api/pipelines/${pipelineId}/plan/latest`),
  reviewPlan: (planId: string, data: { decision: string; feedback?: string }) =>
    request<unknown>(`/api/plans/${planId}/review`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Skills
  getSkills: () => request<unknown[]>("/api/skills"),
  importSkill: (data: unknown) =>
    request<unknown>("/api/skills/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  importSkillFromGithub: (url: string) =>
    request<unknown>("/api/skills/import-github", {
      method: "POST",
      body: JSON.stringify({ githubUrl: url }),
    }),
  importSkillFromFile: (manifest: Record<string, unknown>) =>
    request<unknown>("/api/skills/import-file", {
      method: "POST",
      body: JSON.stringify(manifest),
    }),
  toggleSkill: (id: string) =>
    request<unknown>(`/api/skills/${id}/toggle`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),
  updateSkill: (id: string, data: Record<string, unknown>) =>
    request<unknown>(`/api/skills/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  approveSkill: (skillId: string) =>
    request<unknown>("/api/skills/approve", {
      method: "POST",
      body: JSON.stringify({ skillId }),
    }),
  deleteSkill: (id: string) =>
    request<void>(`/api/skills/${id}`, { method: "DELETE" }),
  toggleSkillStar: (id: string) =>
    request<unknown>(`/api/skills/${id}/star`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),

  // Sessions
  getSessionsForTask: (taskId: string) =>
    request<unknown[]>(`/api/sessions?taskId=${taskId}`),
  getActiveSessions: () => request<unknown[]>("/api/sessions/active"),
  killSession: (id: string) =>
    request<unknown>(`/api/sessions/${id}/kill`, { method: "POST" }),

  // Evolution
  getEvolutionLogs: (projectId: string) =>
    request<unknown[]>(`/api/evolution?projectId=${projectId}`),
  rollbackEvolution: (id: string) =>
    request<unknown>(`/api/evolution/${id}/rollback`, { method: "POST" }),
  getMemoryStats: (projectId: string) =>
    request<unknown>(`/api/memory/stats?projectId=${projectId}`),
  getMemories: (projectId: string, layer?: string) =>
    request<unknown[]>(
      `/api/memory?projectId=${projectId}${layer ? `&layer=${layer}` : ""}`
    ),

  // Filesystem
  browseDirs: (path?: string) =>
    request<{
      current: string;
      parent: string;
      entries: { name: string; path: string; isGitRepo: boolean }[];
    }>(`/api/fs/browse${path ? `?path=${encodeURIComponent(path)}` : ""}`),
  detectRepos: () =>
    request<{ name: string; path: string; isGitRepo: boolean; isSelf?: boolean }[]>(
      "/api/fs/detect-repos"
    ),

  // Interventions
  getInterventions: (pipelineId: string) =>
    request<unknown[]>(`/api/interventions?pipelineId=${pipelineId}`),
  respondToIntervention: (id: string, response: string) =>
    request<unknown>(`/api/interventions/${id}/respond`, {
      method: "POST",
      body: JSON.stringify({ response }),
    }),

  // Plugins
  getInstalledPlugins: () => request<unknown[]>("/api/plugins/installed"),
  getAvailablePlugins: () => request<unknown[]>("/api/plugins/available"),
  installPlugin: (pluginId: string) =>
    request<unknown>("/api/plugins/install", {
      method: "POST",
      body: JSON.stringify({ pluginId }),
    }),
  uninstallPlugin: (pluginId: string) =>
    request<unknown>("/api/plugins/uninstall", {
      method: "POST",
      body: JSON.stringify({ pluginId }),
    }),
  enablePlugin: (pluginId: string) =>
    request<unknown>("/api/plugins/enable", {
      method: "POST",
      body: JSON.stringify({ pluginId }),
    }),
  disablePlugin: (pluginId: string) =>
    request<unknown>("/api/plugins/disable", {
      method: "POST",
      body: JSON.stringify({ pluginId }),
    }),
  starPlugin: (pluginId: string) =>
    request<unknown>("/api/plugins/star", {
      method: "POST",
      body: JSON.stringify({ pluginId }),
    }),
  unstarPlugin: (pluginId: string) =>
    request<unknown>("/api/plugins/unstar", {
      method: "POST",
      body: JSON.stringify({ pluginId }),
    }),
  refreshPlugins: () =>
    request<unknown[]>("/api/plugins/refresh", { method: "POST" }),
  addMarketplace: (source: string) =>
    request<unknown>("/api/plugins/marketplace/add", {
      method: "POST",
      body: JSON.stringify({ source }),
    }),
  getMarketplaces: () => request<unknown[]>("/api/plugins/marketplaces"),
};
