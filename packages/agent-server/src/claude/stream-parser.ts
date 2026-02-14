import type { StreamChunk } from "@awa-v/shared";

/**
 * Parse a single line of Claude CLI stream-json (NDJSON) output
 * into a typed StreamChunk.
 *
 * Claude CLI `--output-format stream-json` emits one JSON object per line.
 * See: https://docs.anthropic.com/en/docs/claude-code/cli-usage
 */
export function parseStreamLine(line: string): StreamChunk | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const type = parsed.type as string;

  switch (type) {
    case "assistant": {
      const msg = parsed.message as Record<string, unknown> | undefined;
      if (msg?.type === "text") {
        return { type: "assistant:text", text: msg.text as string };
      }
      if (msg?.type === "thinking") {
        return {
          type: "assistant:thinking",
          thinking: msg.thinking as string,
        };
      }
      // Handle content blocks
      if (parsed.subtype === "text") {
        return {
          type: "assistant:text",
          text: (parsed.text ?? "") as string,
        };
      }
      return null;
    }

    case "tool_use": {
      return {
        type: "tool:use",
        toolName: (parsed.name ?? parsed.tool_name ?? "") as string,
        toolInput: (parsed.input ?? {}) as Record<string, unknown>,
      };
    }

    case "tool_result": {
      return {
        type: "tool:result",
        toolName: (parsed.name ?? parsed.tool_name ?? "") as string,
        output: (parsed.output ?? parsed.content ?? "") as string,
        isError: (parsed.is_error ?? false) as boolean,
      };
    }

    case "usage": {
      const usage = parsed as Record<string, unknown>;
      return {
        type: "cost:update",
        inputTokens: (usage.input_tokens ?? 0) as number,
        outputTokens: (usage.output_tokens ?? 0) as number,
        costUsd: (usage.total_cost_usd ?? usage.cost_usd ?? 0) as number,
      };
    }

    case "error": {
      return {
        type: "error",
        message: (parsed.error ?? parsed.message ?? "Unknown error") as string,
      };
    }

    case "result": {
      return {
        type: "done",
        exitCode: (parsed.exit_code ?? 0) as number,
      };
    }

    default:
      return null;
  }
}

/**
 * Creates a line-buffered transform that splits incoming data on newlines,
 * parses each line, and calls the callback with StreamChunks.
 */
export function createStreamProcessor(
  onChunk: (chunk: StreamChunk) => void
): (data: Buffer | string) => void {
  let buffer = "";

  return (data: Buffer | string) => {
    buffer += data.toString();
    const lines = buffer.split("\n");
    // Keep the last incomplete line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const chunk = parseStreamLine(line);
      if (chunk) {
        onChunk(chunk);
      }
    }
  };
}
