"use client";

interface ClaudeMdDiffProps {
  diff: string;
}

export function ClaudeMdDiff({ diff }: ClaudeMdDiffProps) {
  // Parse diff lines for syntax highlighting
  const lines = diff.split("\n");

  return (
    <div className="rounded-lg border border-border bg-deep overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="indicator indicator-active" />
        <span className="font-mono text-[10px] text-text-secondary">CLAUDE.md</span>
      </div>

      {/* Diff content */}
      <div className="overflow-auto max-h-[400px] p-0">
        <pre className="text-[11px] font-mono leading-relaxed">
          {lines.map((line, i) => {
            const isAdd = line.startsWith("+") && !line.startsWith("+++");
            const isRemove = line.startsWith("-") && !line.startsWith("---");
            const isHeader = line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++");
            const isMeta = line.startsWith("<!-- AWA-V");

            return (
              <div
                key={i}
                className={
                  isAdd
                    ? "bg-neon-green/8 text-neon-green px-4 py-0.5"
                    : isRemove
                      ? "bg-neon-red/8 text-neon-red px-4 py-0.5"
                      : isHeader
                        ? "bg-surface/50 text-neon-cyan/60 px-4 py-0.5"
                        : isMeta
                          ? "text-text-muted/40 px-4 py-0.5 italic"
                          : "text-text-muted px-4 py-0.5"
                }
              >
                {line || " "}
              </div>
            );
          })}
        </pre>
      </div>
    </div>
  );
}
