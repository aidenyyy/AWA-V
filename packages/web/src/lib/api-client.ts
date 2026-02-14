const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:2078";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
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
  approveSkill: (skillId: string) =>
    request<unknown>("/api/skills/approve", {
      method: "POST",
      body: JSON.stringify({ skillId }),
    }),
  deleteSkill: (id: string) =>
    request<void>(`/api/skills/${id}`, { method: "DELETE" }),

  // Sessions
  getActiveSessions: () => request<unknown[]>("/api/sessions/active"),
  killSession: (id: string) =>
    request<unknown>(`/api/sessions/${id}/kill`, { method: "POST" }),

  // Evolution
  getEvolutionLogs: (projectId: string) =>
    request<unknown[]>(`/api/evolution?projectId=${projectId}`),
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
    request<{ name: string; path: string; isGitRepo: boolean }[]>(
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
};
