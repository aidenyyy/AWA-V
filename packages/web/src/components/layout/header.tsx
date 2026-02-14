"use client";

import { useNotificationStore } from "@/stores/notification-store";

interface HeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-abyss/80 px-6 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold text-text-primary tracking-wide font-mono">
          {title}
        </h1>
        {subtitle && (
          <span className="text-xs text-text-muted font-mono">
            // {subtitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        {actions}

        {/* Notification indicator */}
        {unreadCount > 0 && (
          <div className="relative flex items-center">
            <span className="indicator indicator-warning" />
            <span className="ml-1.5 text-xs font-mono text-neon-yellow">
              {unreadCount}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
