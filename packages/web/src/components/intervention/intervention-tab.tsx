"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/cn";
import { useInterventionStore } from "@/stores/intervention-store";
import type { Intervention } from "@awa-v/shared";

interface InterventionTabProps {
  intervention: Intervention;
  onRespond: (response: string) => void;
}

function parseContext(context: string): Record<string, unknown> | null {
  try {
    return JSON.parse(context) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function ContextViewer({ context }: { context: string }) {
  const parsed = parseContext(context);

  if (!parsed) {
    return (
      <pre className="whitespace-pre-wrap break-words rounded-lg border border-border bg-abyss/80 p-3 text-xs font-mono text-text-secondary">
        {context}
      </pre>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-abyss/80 p-3">
      {Object.entries(parsed).map(([key, value]) => (
        <div key={key} className="flex flex-col gap-0.5">
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-muted">
            {key}
          </span>
          <span className="text-xs font-mono text-text-secondary break-words">
            {typeof value === "string"
              ? value
              : JSON.stringify(value, null, 2)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function InterventionTab({
  intervention,
  onRespond,
}: InterventionTabProps) {
  const setDraft = useInterventionStore((s) => s.setDraft);
  const getDraft = useInterventionStore((s) => s.getDraft);

  const [response, setResponse] = useState(() => getDraft(intervention.id));
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restore draft on mount or intervention change
  useEffect(() => {
    const draft = getDraft(intervention.id);
    setResponse(draft);
  }, [intervention.id, getDraft]);

  // Auto-save draft to localStorage with debounce
  const handleResponseChange = useCallback(
    (text: string) => {
      setResponse(text);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        setDraft(intervention.id, text);
      }, 300);
    },
    [intervention.id, setDraft]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const isResolved = intervention.status === "resolved";

  const stageLabel = intervention.stageType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Stage type badge */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded px-2 py-0.5",
            "border border-neon-cyan/30 bg-neon-cyan/10",
            "text-[10px] font-mono font-semibold uppercase tracking-wider text-neon-cyan"
          )}
        >
          {stageLabel}
        </span>
        {isResolved && (
          <span
            className={cn(
              "inline-flex items-center rounded px-2 py-0.5",
              "border border-neon-green/30 bg-neon-green/10",
              "text-[10px] font-mono font-semibold uppercase tracking-wider text-neon-green"
            )}
          >
            Resolved
          </span>
        )}
      </div>

      {/* Question */}
      <div>
        <h3 className="mb-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
          Question
        </h3>
        <p className="text-sm text-text-primary leading-relaxed">
          {intervention.question}
        </p>
      </div>

      {/* Context */}
      {intervention.context && intervention.context !== "{}" && (
        <div>
          <h3 className="mb-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Context
          </h3>
          <ContextViewer context={intervention.context} />
        </div>
      )}

      {/* Resolved response display */}
      {isResolved && intervention.response && (
        <div>
          <h3 className="mb-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
            Response
          </h3>
          <div className="rounded-lg border border-neon-green/20 bg-neon-green/5 p-3">
            <p className="text-xs font-mono text-neon-green">
              {intervention.response}
            </p>
          </div>
        </div>
      )}

      {/* Response area (only for pending) */}
      {!isResolved && (
        <>
          <div>
            <h3 className="mb-1 text-[10px] font-mono uppercase tracking-wider text-text-muted">
              Your Response
            </h3>
            <textarea
              ref={textareaRef}
              value={response}
              onChange={(e) => handleResponseChange(e.target.value)}
              placeholder="Type your response..."
              rows={4}
              className={cn(
                "w-full resize-y rounded-lg border border-border bg-abyss/80 p-3",
                "text-sm font-mono text-text-primary placeholder:text-text-muted",
                "focus:border-neon-cyan/50 focus:outline-none focus:ring-1 focus:ring-neon-cyan/30",
                "transition-colors duration-200"
              )}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Proceed button (neon-green) */}
            <button
              type="button"
              onClick={() => onRespond("proceed")}
              className={cn(
                "flex-1 rounded-lg px-4 py-2",
                "border border-neon-green/40 bg-neon-green/10",
                "text-xs font-mono font-semibold uppercase tracking-wider text-neon-green",
                "hover:bg-neon-green/20 hover:border-neon-green/60",
                "hover:shadow-[0_0_12px_rgba(0,255,136,0.2)]",
                "transition-all duration-200"
              )}
            >
              Proceed
            </button>

            {/* Abort button (neon-red) */}
            <button
              type="button"
              onClick={() => onRespond("abort")}
              className={cn(
                "flex-1 rounded-lg px-4 py-2",
                "border border-neon-red/40 bg-neon-red/10",
                "text-xs font-mono font-semibold uppercase tracking-wider text-neon-red",
                "hover:bg-neon-red/20 hover:border-neon-red/60",
                "hover:shadow-[0_0_12px_rgba(255,51,102,0.2)]",
                "transition-all duration-200"
              )}
            >
              Abort
            </button>

            {/* Send custom response (neon-cyan) */}
            <button
              type="button"
              onClick={() => {
                if (response.trim()) {
                  onRespond(response.trim());
                }
              }}
              disabled={!response.trim()}
              className={cn(
                "flex-1 rounded-lg px-4 py-2",
                "border border-neon-cyan/40 bg-neon-cyan/10",
                "text-xs font-mono font-semibold uppercase tracking-wider text-neon-cyan",
                "hover:bg-neon-cyan/20 hover:border-neon-cyan/60",
                "hover:shadow-[0_0_12px_rgba(0,240,255,0.2)]",
                "disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-neon-cyan/10",
                "transition-all duration-200"
              )}
            >
              Send
            </button>
          </div>
        </>
      )}

      {/* Timestamp */}
      <div className="text-[10px] font-mono text-text-muted">
        Requested: {new Date(intervention.createdAt).toLocaleString()}
        {intervention.resolvedAt && (
          <>
            {" | "}
            Resolved: {new Date(intervention.resolvedAt).toLocaleString()}
          </>
        )}
      </div>
    </div>
  );
}
