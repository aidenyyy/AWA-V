import { create } from "zustand";
import { api } from "@/lib/api-client";

export interface PluginInfo {
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

export interface MarketplaceInfo {
  name?: string;
  url?: string;
  source?: string;
}

interface PluginStore {
  installed: PluginInfo[];
  available: PluginInfo[];
  marketplaces: MarketplaceInfo[];
  loading: boolean;
  installing: Set<string>;
  error: string | null;

  loadInstalled: () => Promise<void>;
  loadAvailable: () => Promise<void>;
  loadMarketplaces: () => Promise<void>;
  refresh: () => Promise<void>;
  installPlugin: (pluginId: string) => Promise<void>;
  uninstallPlugin: (pluginId: string) => Promise<void>;
  enablePlugin: (pluginId: string) => Promise<void>;
  disablePlugin: (pluginId: string) => Promise<void>;
  toggleStar: (pluginId: string) => Promise<void>;
  addMarketplace: (source: string) => Promise<void>;
}

export const usePluginStore = create<PluginStore>((set, get) => ({
  installed: [],
  available: [],
  marketplaces: [],
  loading: false,
  installing: new Set(),
  error: null,

  loadInstalled: async () => {
    set({ loading: true, error: null });
    try {
      const data = (await api.getInstalledPlugins()) as PluginInfo[];
      set({ installed: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  loadAvailable: async () => {
    set({ loading: true, error: null });
    try {
      const data = (await api.getAvailablePlugins()) as PluginInfo[];
      set({ available: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  loadMarketplaces: async () => {
    set({ loading: true, error: null });
    try {
      const data = (await api.getMarketplaces()) as MarketplaceInfo[];
      set({ marketplaces: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const data = (await api.refreshPlugins()) as PluginInfo[];
      set({ installed: data, loading: false });
    } catch (err) {
      set({ error: (err as Error).message, loading: false });
    }
  },

  installPlugin: async (pluginId: string) => {
    set({ installing: new Set([...get().installing, pluginId]), error: null });

    try {
      await api.installPlugin(pluginId);
      const next = new Set(get().installing);
      next.delete(pluginId);
      set({ installing: next });
      await get().loadInstalled();
      await get().loadAvailable();
    } catch (err) {
      const next = new Set(get().installing);
      next.delete(pluginId);
      set({ installing: next, error: (err as Error).message });
    }
  },

  uninstallPlugin: async (pluginId: string) => {
    set({ error: null });
    try {
      await api.uninstallPlugin(pluginId);
      await get().loadInstalled();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  enablePlugin: async (pluginId: string) => {
    set({ error: null });
    try {
      await api.enablePlugin(pluginId);
      await get().loadInstalled();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  disablePlugin: async (pluginId: string) => {
    set({ error: null });
    try {
      await api.disablePlugin(pluginId);
      await get().loadInstalled();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  toggleStar: async (pluginId: string) => {
    set({ error: null });
    try {
      const plugin = get().installed.find((p) => p.id === pluginId);
      if (!plugin) return;

      if (plugin.starred) {
        await api.unstarPlugin(pluginId);
      } else {
        await api.starPlugin(pluginId);
      }

      set({
        installed: get().installed.map((p) =>
          p.id === pluginId ? { ...p, starred: !p.starred } : p
        ),
      });
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },

  addMarketplace: async (source: string) => {
    set({ error: null });
    try {
      await api.addMarketplace(source);
      await get().loadMarketplaces();
    } catch (err) {
      set({ error: (err as Error).message });
    }
  },
}));
