import type { StreamChunk } from "@awa-v/shared";

/**
 * Parse a single line of Claude CLI stream-json (NDJSON) output
 * into typed StreamChunks.
 *
 * Claude CLI `--output-format stream-json` emits one JSON object per line.
 * See: https://docs.anthropic.com/en/docs/claude-code/cli-usage
 *
 * Actual CLI event formats (verified empirically):
 * - assistant: { type:"assistant", message:{ type:"message", content:[{type:"text",text:"..."}] } }
 * - result:    { type:"result", subtype:"success"|"error", is_error:boolean, total_cost_usd, usage:{input_tokens,output_tokens,cache_read_input_tokens,...} }
 * - error:     { type:"error", error:{ message:"...", code:"..." } }
 */
export function parseStreamLine(line: string): StreamChunk[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const type = parsed.type as string;

  switch (type) {
    case "assistant": {
      const msg = parsed.message as Record<string, unknown> | undefined;
      if (msg) {
        // CLI emits message.type === "message" with content array
        const content = msg.content as Array<Record<string, unknown>> | undefined;
        if (Array.isArray(content)) {
          const textBlocks = content
            .filter((b) => b.type === "text")
            .map((b) => b.text as string);
          if (textBlocks.length > 0) {
            return [{ type: "assistant:text", text: textBlocks.join("") }];
          }
        }
        // Fallback: direct text on message (future-proofing)
        if (msg.type === "text") {
          return [{ type: "assistant:text", text: msg.text as string }];
        }
        if (msg.type === "thinking") {
          return [{ type: "assistant:thinking", thinking: msg.thinking as string }];
        }
      }
      return [];
    }

    case "tool_use": {
      return [{
        type: "tool:use",
        toolName: (parsed.name ?? parsed.tool_name ?? "") as string,
        toolInput: (parsed.input ?? {}) as Record<string, unknown>,
      }];
    }

    case "tool_result": {
      return [{
        type: "tool:result",
        toolName: (parsed.name ?? parsed.tool_name ?? "") as string,
        output: (parsed.output ?? parsed.content ?? "") as string,
        isError: (parsed.is_error ?? false) as boolean,
      }];
    }

    case "error": {
      // CLI emits { type:"error", error:{ message:"...", code:"..." } }
      const errObj = parsed.error as Record<string, unknown> | string | undefined;
      let message: string;
      if (typeof errObj === "object" && errObj !== null) {
        message = (errObj.message ?? "Unknown error") as string;
      } else {
        message = (errObj ?? parsed.message ?? "Unknown error") as string;
      }
      return [{ type: "error", message }];
    }

    case "result": {
      // The result event carries both completion signal AND usage/cost data.
      // Emit cost:update before done so consumers see token data.
      const chunks: StreamChunk[] = [];
      const usage = parsed.usage as Record<string, unknown> | undefined;
      if (usage || parsed.total_cost_usd) {
        chunks.push({
          type: "cost:update",
          inputTokens: ((usage?.input_tokens ?? 0) as number) +
                       ((usage?.cache_read_input_tokens ?? 0) as number),
          outputTokens: (usage?.output_tokens ?? 0) as number,
          costUsd: (parsed.total_cost_usd ?? 0) as number,
        });
      }
      chunks.push({
        type: "done",
        exitCode: parsed.is_error ? 1 : 0,
      });
      return chunks;
    }

    default:
      return [];
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
      const chunks = parseStreamLine(line);
      for (const chunk of chunks) {
        onChunk(chunk);
      }
    }
  };
}
