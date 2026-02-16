import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

const AGENT_SERVER_PORT = 2078;

async function isServerRunning(): Promise<boolean> {
  try {
    const res = await fetch(`http://localhost:${AGENT_SERVER_PORT}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function POST() {
  // Check if already running
  if (await isServerRunning()) {
    return NextResponse.json({ status: "already_running" });
  }

  // Resolve the monorepo root (web is at packages/web)
  const monorepoRoot = resolve(process.cwd(), "../..");

  try {
    // Spawn the agent-server as a detached process
    const child = spawn("pnpm", ["--filter", "@awa-v/agent-server", "dev"], {
      cwd: monorepoRoot,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });

    child.unref();

    // Wait for the server to come up (poll health endpoint)
    const maxWait = 10_000;
    const pollInterval = 500;
    const start = Date.now();

    while (Date.now() - start < maxWait) {
      await new Promise((r) => setTimeout(r, pollInterval));
      if (await isServerRunning()) {
        return NextResponse.json({ status: "started" });
      }
    }

    return NextResponse.json(
      { status: "timeout", message: "Server process spawned but not yet responding" },
      { status: 202 }
    );
  } catch (err) {
    return NextResponse.json(
      { status: "error", message: (err as Error).message },
      { status: 500 }
    );
  }
}
