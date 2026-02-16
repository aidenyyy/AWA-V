"use client";

import { cn } from "@/lib/cn";
import type { PluginInfo } from "@/stores/plugin-store";

interface PluginCardProps {
  plugin: PluginInfo;
  onEnable?: () => void;
  onDisable?: () => void;
  onUninstall?: () => void;
  onInstall?: () => void;
  onToggleStar?: () => void;
  isInstalling?: boolean;
  mode: "installed" | "available";
}

export function PluginCard({
  plugin,
  onEnable,
  onDisable,
  onUninstall,
  onInstall,
  onToggleStar,
  isInstalling = false,
  mode,
}: PluginCardProps) {
  const isEnabled = plugin.status === "enabled" || plugin.status === "active";
  const isDisabled = plugin.status === "disabled";
  const hasErrors = plugin.errors && plugin.errors.length > 0;
  const isStarred = plugin.starred;

  return (
    <div
      className={cn(
        "glass-card p-4 transition-all",
        isInstalling && "animate-pulse",
        mode === "installed" && isEnabled && "border-border",
        mode === "installed" && isDisabled && "border-border opacity-60",
        mode === "available" && "border-border",
        hasErrors && "border-neon-yellow/20",
        isStarred && "border-neon-yellow/20"
      )}
    >
      {/* Header: star + indicator + name + version */}
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {mode === "installed" && onToggleStar && (
            <button
              onClick={onToggleStar}
              className={cn(
                "flex-shrink-0 transition hover:scale-110",
                isStarred ? "text-neon-yellow" : "text-text-muted hover:text-neon-yellow/60"
              )}
              title={isStarred ? "Unstar" : "Star"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isStarred ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
          )}
          <span
            className={cn(
              "indicator flex-shrink-0",
              mode === "installed" && isEnabled && "indicator-active",
              mode === "installed" && isDisabled && "indicator-idle",
              mode === "available" && "indicator-muted",
              hasErrors && "indicator-warning"
            )}
          />
          <div className="min-w-0">
            <span className="block truncate font-mono text-xs font-semibold text-text-primary">
              {plugin.name}
            </span>
            {plugin.marketplace && (
              <span className="font-mono text-[9px] text-text-muted">
                {plugin.marketplace}
              </span>
            )}
          </div>
        </div>
        {plugin.version && (
          <span className="flex-shrink-0 rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-text-muted">
            v{plugin.version}
          </span>
        )}
      </div>

      {/* Description */}
      {plugin.description && (
        <p className="mb-2 text-[11px] text-text-muted line-clamp-2">
          {plugin.description}
        </p>
      )}

      {/* Keywords */}
      {plugin.keywords && plugin.keywords.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {plugin.keywords.slice(0, 5).map((kw) => (
            <span
              key={kw}
              className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[9px] text-text-secondary"
            >
              {kw}
            </span>
          ))}
          {plugin.keywords.length > 5 && (
            <span className="rounded-md bg-surface px-1.5 py-0.5 font-mono text-[9px] text-text-muted">
              +{plugin.keywords.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Skills list */}
      {plugin.skills && plugin.skills.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {plugin.skills.map((skill) => (
            <span
              key={skill}
              className="rounded-md border border-neon-cyan/20 bg-neon-cyan/5 px-1.5 py-0.5 font-mono text-[9px] text-neon-cyan"
            >
              {skill}
            </span>
          ))}
        </div>
      )}

      {/* Errors */}
      {hasErrors && (
        <div className="mb-2 rounded border border-neon-yellow/20 bg-neon-yellow/5 px-2 py-1">
          {plugin.errors.map((err, i) => (
            <p key={i} className="font-mono text-[9px] text-neon-yellow line-clamp-1">
              {err}
            </p>
          ))}
        </div>
      )}

      {/* Status + actions */}
      <div className="flex items-center justify-between pt-1">
        {mode === "installed" && (
          <>
            <span
              className={cn(
                "font-mono text-[10px] uppercase tracking-widest",
                isEnabled ? "text-neon-green" : "text-text-muted"
              )}
            >
              {isEnabled ? "enabled" : "disabled"}
            </span>
            <div className="flex gap-1.5">
              {isEnabled && onDisable && (
                <button
                  onClick={onDisable}
                  className="rounded border border-neon-yellow/30 px-2 py-0.5 font-mono text-[10px] text-neon-yellow transition hover:bg-neon-yellow/10"
                >
                  Disable
                </button>
              )}
              {isDisabled && onEnable && (
                <button
                  onClick={onEnable}
                  className="rounded border border-neon-green/30 px-2 py-0.5 font-mono text-[10px] text-neon-green transition hover:bg-neon-green/10"
                >
                  Enable
                </button>
              )}
              {onUninstall && (
                <button
                  onClick={onUninstall}
                  className="rounded border border-neon-red/30 px-2 py-0.5 font-mono text-[10px] text-neon-red transition hover:bg-neon-red/10"
                >
                  Uninstall
                </button>
              )}
            </div>
          </>
        )}

        {mode === "available" && (
          <>
            <span className="font-mono text-[10px] uppercase tracking-widest text-text-muted">
              {isInstalling ? "installing..." : "available"}
            </span>
            <button
              onClick={onInstall}
              disabled={isInstalling}
              className="rounded border border-neon-cyan/30 px-2 py-0.5 font-mono text-[10px] text-neon-cyan transition hover:bg-neon-cyan/10 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Install
            </button>
          </>
        )}
      </div>
    </div>
  );
}
