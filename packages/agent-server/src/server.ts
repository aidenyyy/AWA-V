import Fastify from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import fastifyCors from "@fastify/cors";
import { registerProjectRoutes } from "./api/projects.js";
import { registerPipelineRoutes } from "./api/pipelines.js";
import { registerPlanRoutes } from "./api/plans.js";
import { registerSkillRoutes } from "./api/skills.js";
import { registerSessionRoutes } from "./api/sessions.js";
import { registerEvolutionRoutes } from "./api/evolution.js";
import { registerInterventionRoutes } from "./api/interventions.js";
import { registerFilesystemRoutes } from "./api/filesystem.js";
import { registerWebSocketHandler } from "./ws/handler.js";
import { DEFAULTS } from "@awa-v/shared";

export async function createServer() {
  const app = Fastify({
    logger: {
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    },
  });

  // Register plugins
  await app.register(fastifyCors, {
    origin: [`http://localhost:${DEFAULTS.WEB_PORT}`],
  });
  await app.register(fastifyWebsocket);

  // Register routes
  registerProjectRoutes(app);
  registerPipelineRoutes(app);
  registerPlanRoutes(app);
  registerSkillRoutes(app);
  registerSessionRoutes(app);
  registerEvolutionRoutes(app);
  registerInterventionRoutes(app);
  registerFilesystemRoutes(app);
  registerWebSocketHandler(app);

  // Health check
  app.get("/api/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
  }));

  return app;
}
