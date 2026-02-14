"use client";

import { useEffect, useRef } from "react";
import { useStreamStore } from "@/stores/stream-store";
import { cn } from "@/lib/cn";
import type { StreamChunk } from "@awa-v/shared";

interface ClaudeStreamViewerProps {
  taskId: string;
}

export function ClaudeStreamViewer({ taskId }: ClaudeStreamViewerProps) {
  const stream = useStreamStore((s) => s.streams[taskId]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [stream?.chunks.length]);

  if (!stream) {
    return (
      <div className="flex h-64 items-center justify-center text-text-muted font-mono text-sm">
        No stream data available
      </div>
    );
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "indicator",
              stream.isActive ? "indicator-running" : "indicator-idle"
            )}
          />
          <span className="font-mono text-xs text-text-secondary">
            Claude Output Stream
          </span>
        </div>
        <span className="font-mono text-[10px] text-text-muted">
          {stream.chunks.length} events
        </span>
      </div>

      {/* Stream content */}
      <div
        ref={scrollRef}
        className="h-96 overflow-y-auto p-4 font-mono text-xs leading-relaxed"
      >
        {stream.chunks.map((chunk, i) => (
          <StreamChunkLine key={i} chunk={chunk} />
        ))}

        {stream.isActive && (
          <span className="inline-block h-4 w-1.5 animate-pulse bg-neon-cyan" />
        )}
      </div>
    </div>
  );
}

function StreamChunkLine({ chunk }: { chunk: StreamChunk }) {
  switch (chunk.type) {
    case "assistant:text":
      return (
        <span className="text-text-primary whitespace-pre-wrap">
          {chunk.text}
        </span>
      );

    case "assistant:thinking":
      return (
        <div className="my-1 border-l-2 border-neon-cyan/30 pl-3 text-text-muted italic">
          {chunk.thinking}
        </div>
      );

    case "tool:use":
      return (
        <div className="my-1 rounded border border-neon-blue/30 bg-neon-blue/5 px-2 py-1">
          <span className="text-neon-blue">▶ {chunk.toolName}</span>
        </div>
      );

    case "tool:result":
      return (
        <div
          className={cn(
            "my-1 rounded border px-2 py-1",
            chunk.isError
              ? "border-neon-red/30 bg-neon-red/5"
              : "border-neon-green/30 bg-neon-green/5"
          )}
        >
          <span className={chunk.isError ? "text-neon-red" : "text-neon-green"}>
            {chunk.isError ? "✗" : "✓"} {chunk.toolName}
          </span>
          {chunk.output && (
            <pre className="mt-1 max-h-32 overflow-auto text-text-muted text-[10px]">
              {chunk.output.slice(0, 500)}
              {chunk.output.length > 500 && "..."}
            </pre>
          )}
        </div>
      );

    case "cost:update":
      return (
        <div className="my-1 text-text-muted">
          <span className="text-neon-yellow">
            ${chunk.costUsd.toFixed(4)}
          </span>{" "}
          ({chunk.inputTokens}↓ {chunk.outputTokens}↑)
        </div>
      );

    case "error":
      return (
        <div className="my-1 text-neon-red">
          Error: {chunk.message}
        </div>
      );

    case "done":
      return (
        <div className="my-2 text-center text-text-muted">
          ── Process exited with code {chunk.exitCode} ──
        </div>
      );

    default:
      return null;
  }
}
