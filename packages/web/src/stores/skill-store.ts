import { create } from "zustand";
import { api } from "@/lib/api-client";
import type { Skill } from "@awa-v/shared";

interface SkillStore {
  skills: Skill[];
  loading: boolean;
  error: string | null;

  fetchSkills: () => Promise<void>;
  toggleSkill: (id: string) => Promise<void>;
  toggleStar: (id: string) => Promise<void>;
  importFromGithub: (url: string) => Promise<void>;
  importFromFile: (manifest: Record<string, unknown>) => Promise<void>;
  deleteSkill: (id: string) => Promise<void>;
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  loading: false,
  error: null,

  fetchSkills: async () => {
    set({ loading: true, error: null });
    try {
      const data = (await api.getSkills()) as Skill[];
      set({ skills: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  toggleSkill: async (id: string) => {
    set({ error: null });
    try {
      const updated = (await api.toggleSkill(id)) as Skill;
      set({
        skills: get().skills.map((s) => (s.id === id ? updated : s)),
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  toggleStar: async (id: string) => {
    set({ error: null });
    try {
      const updated = (await api.toggleSkillStar(id)) as Skill;
      set({
        skills: get().skills.map((s) => (s.id === id ? updated : s)),
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  importFromGithub: async (url: string) => {
    set({ error: null });
    try {
      const skill = (await api.importSkillFromGithub(url)) as Skill;
      set({ skills: [...get().skills, skill] });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  importFromFile: async (manifest: Record<string, unknown>) => {
    set({ error: null });
    try {
      const skill = (await api.importSkillFromFile(manifest)) as Skill;
      set({ skills: [...get().skills, skill] });
    } catch (err) {
      set({ error: (err as Error).message });
      throw err;
    }
  },

  deleteSkill: async (id: string) => {
    set({ error: null });
    try {
      await api.deleteSkill(id);
      set({
        skills: get().skills.filter((s) => s.id !== id),
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
