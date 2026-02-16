"use client";

import { useEffect } from "react";
import { cn } from "@/lib/cn";
import { useNotificationStore } from "@/stores/notification-store";

export function NotificationToasts() {
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);

  const unread = notifications.filter((n) => !n.read).slice(0, 3);

  useEffect(() => {
    if (unread.length === 0) return;
    const timer = setTimeout(() => {
      for (const n of unread) markRead(n.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [markRead, unread]);

  if (unread.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[360px] max-w-[90vw] flex-col gap-2">
      {unread.map((n) => (
        <div
          key={n.id}
          className={cn(
            "glass-card border px-3 py-2",
            n.level === "error" && "border-neon-red/40",
            n.level === "warning" && "border-neon-yellow/40",
            n.level === "info" && "border-neon-cyan/40"
          )}
        >
          <div className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
            {n.title}
          </div>
          <div className="mt-1 text-xs text-text-secondary">{n.message}</div>
        </div>
      ))}
    </div>
  );
}
