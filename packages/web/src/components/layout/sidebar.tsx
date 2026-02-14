"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const navItems = [
  { href: "/", label: "Dashboard", icon: "◆" },
  { href: "/projects", label: "Projects", icon: "▣" },
];

export function Sidebar() {
  const pathname = usePathname();

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

      {/* Bottom section */}
      <div className="flex flex-col items-center gap-2 pb-2">
        <div className="indicator indicator-active" title="System Online" />
      </div>
    </aside>
  );
}
