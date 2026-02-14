import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

export interface Notification {
  id: string;
  level: "info" | "warning" | "error";
  title: string;
  message: string;
  pipelineId?: string;
  timestamp: number;
  read: boolean;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  addNotification: (n: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

let nextId = 0;

export const useNotificationStore = create<NotificationState>()(
  immer((set) => ({
    notifications: [],
    unreadCount: 0,

    addNotification: (n) =>
      set((state) => {
        state.notifications.unshift({
          ...n,
          id: String(++nextId),
          timestamp: Date.now(),
          read: false,
        });
        state.unreadCount++;
        // Keep max 100
        if (state.notifications.length > 100) {
          state.notifications = state.notifications.slice(0, 100);
        }
      }),

    markRead: (id) =>
      set((state) => {
        const n = state.notifications.find((x) => x.id === id);
        if (n && !n.read) {
          n.read = true;
          state.unreadCount = Math.max(0, state.unreadCount - 1);
        }
      }),

    markAllRead: () =>
      set((state) => {
        for (const n of state.notifications) {
          n.read = true;
        }
        state.unreadCount = 0;
      }),

    clearAll: () =>
      set((state) => {
        state.notifications = [];
        state.unreadCount = 0;
      }),
  }))
);
