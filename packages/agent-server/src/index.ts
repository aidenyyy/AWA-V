import { createServer } from "./server.js";
import { initDatabase } from "./db/connection.js";
import { seedBuiltinSkills } from "./db/seed-skills.js";
import { recoverFromCrash } from "./services/crash-recovery.js";
import { pipelineEngine } from "./pipeline/engine.js";
import { processManager } from "./claude/process-manager.js";
import { DEFAULTS } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "main" });

async function main() {
  // Initialize database
  initDatabase();

  // Seed built-in skills (idempotent)
  seedBuiltinSkills();

  // Create and start server
  const app = await createServer();

  // Register graceful shutdown handlers before listening
  async function gracefulShutdown(signal: string) {
    log.info({ signal }, "Received shutdown signal");

    // 1. Stop accepting requests
    await app.close();

    // 2. Kill all Claude processes and wait
    await processManager.killAll();

    // 3. Exit
    process.exit(0);
  }

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  try {
    await app.listen({
      port: DEFAULTS.AGENT_SERVER_PORT,
      host: "0.0.0.0",
    });

    // Run crash recovery after server is listening
    const toResume = recoverFromCrash();

    if (toResume.length > 0) {
      log.info(
        { count: toResume.length },
        "Pipelines to resume after crash recovery"
      );

      // Resume each pipeline with a staggered delay to avoid thundering herd
      for (let i = 0; i < toResume.length; i++) {
        const pipelineId = toResume[i];
        setTimeout(() => {
          pipelineEngine.resume(pipelineId).catch((err) => {
            log.error(
              { pipelineId, error: (err as Error).message },
              "Failed to resume pipeline"
            );
          });
        }, 500 * i);
      }
    }
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
