import { createServer } from "./server.js";
import { initDatabase } from "./db/connection.js";
import { DEFAULTS } from "@awa-v/shared";

async function main() {
  // Initialize database
  initDatabase();

  // Create and start server
  const app = await createServer();

  try {
    await app.listen({
      port: DEFAULTS.AGENT_SERVER_PORT,
      host: "0.0.0.0",
    });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
