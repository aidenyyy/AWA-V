"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useConnectionStatus } from "@/hooks/use-connection-status";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/skills", label: "Skills", icon: "✦" },
];

export function Sidebar() {
  const pathname = usePathname();
  const connected = useConnectionStatus();
  const [starting, setStarting] = useState(false);

  async function handleStartServer() {
    setStarting(true);
    try {
      await fetch("/api/start-server", { method: "POST" });
    } catch {
      // WebSocket reconnect will pick up the connection
    } finally {
      // Keep spinner for a bit even after request returns,
      // WS reconnect will flip `connected` to true
      setTimeout(() => setStarting(false), 3000);
    }
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-16 flex-col items-center border-r border-border bg-abyss py-4">
      {/* Logo */}
      <div className="mb-8 flex h-10 w-10 items-center justify-center">
        <span className="text-lg font-bold neon-text-cyan tracking-tighter font-mono">
          AV
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex h-10 w-10 items-center justify-center rounded-lg transition-all",
                isActive
                  ? "bg-surface-light text-neon-cyan shadow-[0_0_12px_rgba(0,240,255,0.15)]"
                  : "text-text-muted hover:bg-surface hover:text-text-secondary"
              )}
              title={item.label}
            >
              <span className="text-base">{item.icon}</span>
              {/* Tooltip */}
              <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-surface-light px-2 py-1 text-xs text-text-primary opacity-0 transition-opacity group-hover:opacity-100">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Bottom section — status + start button */}
      <div className="flex flex-col items-center gap-2 pb-2">
        {!connected && !starting && (
          <button
            onClick={handleStartServer}
            className="group relative flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-all hover:bg-surface hover:text-neon-cyan"
            title="Start Server"
          >
            <span className="text-sm">▶</span>
            <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-surface-light px-2 py-1 text-xs text-text-primary opacity-0 transition-opacity group-hover:opacity-100">
              Start Server
            </span>
          </button>
        )}
        {starting && !connected && (
          <div
            className="h-3 w-3 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin"
            title="Starting Server..."
          />
        )}
        <div
          className={cn(
            "indicator",
            connected ? "indicator-active" : "indicator-error"
          )}
          title={connected ? "System Online" : "System Offline"}
        />
      </div>
    </aside>
  );
}
