"use client";

import { cn } from "@/lib/cn";

interface TokenBreakdown {
  haiku: { input: number; output: number };
  sonnet: { input: number; output: number };
  opus: { input: number; output: number };
}

interface TokenBarProps {
  breakdown: TokenBreakdown | string | null | undefined;
  className?: string;
}

function parseBreakdown(raw: TokenBreakdown | string | null | undefined): TokenBreakdown {
  const empty = {
    haiku: { input: 0, output: 0 },
    sonnet: { input: 0, output: 0 },
    opus: { input: 0, output: 0 },
  };

  if (!raw) return empty;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as TokenBreakdown;
    } catch {
      return empty;
    }
  }
  return raw;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function TokenBar({ breakdown, className }: TokenBarProps) {
  const bd = parseBreakdown(breakdown);

  const haikuTotal = bd.haiku.input + bd.haiku.output;
  const sonnetTotal = bd.sonnet.input + bd.sonnet.output;
  const opusTotal = bd.opus.input + bd.opus.output;
  const total = haikuTotal + sonnetTotal + opusTotal;

  if (total === 0) return null;

  const haikuPct = (haikuTotal / total) * 100;
  const sonnetPct = (sonnetTotal / total) * 100;
  const opusPct = (opusTotal / total) * 100;

  return (
    <div className={cn("space-y-1", className)}>
      {/* Total tokens */}
      <div className="flex items-center justify-between text-[10px] font-mono text-text-muted">
        <span>{formatTokens(total)} tokens</span>
        <span className="flex gap-2">
          {haikuTotal > 0 && <span className="text-neon-green">{formatTokens(haikuTotal)}</span>}
          {sonnetTotal > 0 && <span className="text-neon-cyan">{formatTokens(sonnetTotal)}</span>}
          {opusTotal > 0 && <span className="text-neon-magenta">{formatTokens(opusTotal)}</span>}
        </span>
      </div>

      {/* Proportion bar */}
      <div className="flex h-1 w-full overflow-hidden rounded-full bg-deep">
        {haikuPct > 0 && (
          <div
            className="h-full bg-neon-green transition-all duration-500"
            style={{ width: `${haikuPct}%` }}
          />
        )}
        {sonnetPct > 0 && (
          <div
            className="h-full bg-neon-cyan transition-all duration-500"
            style={{ width: `${sonnetPct}%` }}
          />
        )}
        {opusPct > 0 && (
          <div
            className="h-full bg-neon-magenta transition-all duration-500"
            style={{ width: `${opusPct}%` }}
          />
        )}
      </div>
    </div>
  );
}
