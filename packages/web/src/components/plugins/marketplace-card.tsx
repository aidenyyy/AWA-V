"use client";

import type { MarketplaceInfo } from "@/stores/plugin-store";

interface MarketplaceCardProps {
  marketplace: MarketplaceInfo;
}

export function MarketplaceCard({ marketplace }: MarketplaceCardProps) {
  return (
    <div className="glass-card p-4">
      <div className="flex items-center gap-2">
        <span className="indicator indicator-active flex-shrink-0" />
        <span className="font-mono text-xs font-semibold text-text-primary">
          {marketplace.name ?? marketplace.source ?? "Unknown"}
        </span>
      </div>
      {(marketplace.url ?? marketplace.source) && (
        <p className="mt-1 ml-4 truncate font-mono text-[10px] text-text-muted">
          {marketplace.url ?? marketplace.source}
        </p>
      )}
    </div>
  );
}
