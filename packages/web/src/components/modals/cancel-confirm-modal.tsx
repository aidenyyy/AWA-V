"use client";

import { useState } from "react";

interface CancelConfirmModalProps {
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelConfirmModal({ onConfirm, onClose }: CancelConfirmModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md p-6">
        <h3 className="mb-4 font-mono text-sm font-semibold text-neon-red">
          Cancel Pipeline
        </h3>

        <p className="mb-4 font-mono text-xs text-text-secondary leading-relaxed">
          This pipeline will be permanently cancelled and cannot be recovered. All
          running tasks will be terminated and worktrees cleaned up. You will need
          to create a new pipeline to start over.
        </p>

        <label className="mb-6 flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5 accent-neon-red"
          />
          <span className="font-mono text-xs text-text-muted">
            I understand this action is irreversible
          </span>
        </label>

        <div className="flex gap-3">
          <button
            onClick={onConfirm}
            disabled={!confirmed}
            className="flex-1 rounded-lg border border-neon-red/40 bg-neon-red/10 px-4 py-2.5 font-mono text-xs font-medium text-neon-red transition hover:bg-neon-red/20 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Cancel Pipeline
          </button>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2.5 font-mono text-xs text-text-muted transition hover:bg-surface"
          >
            Go Back
          </button>
        </div>
      </div>
    </div>
  );
}
