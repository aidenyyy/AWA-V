import type { FastifyInstance } from "fastify";
import { clientEventSchema } from "@awa-v/shared";
import { broadcaster } from "./broadcaster.js";

export function registerWebSocketHandler(app: FastifyInstance) {
  app.get("/ws", { websocket: true }, (socket) => {
    broadcaster.addClient(socket);

    socket.on("message", (raw: { toString(): string }) => {
      try {
        const data = JSON.parse(raw.toString());
        const event = clientEventSchema.parse(data);

        switch (event.type) {
          case "subscribe:project":
            broadcaster.subscribe(socket, "project", event.projectId);
            break;
          case "unsubscribe:project":
            broadcaster.unsubscribe(socket, "project", event.projectId);
            break;
          case "subscribe:pipeline":
            broadcaster.subscribe(socket, "pipeline", event.pipelineId);
            break;
          case "unsubscribe:pipeline":
            broadcaster.unsubscribe(socket, "pipeline", event.pipelineId);
            break;
        }
      } catch {
        socket.send(
          JSON.stringify({
            type: "error",
            message: "Invalid message format",
          })
        );
      }
    });

    socket.on("close", () => {
      broadcaster.removeClient(socket);
    });
  });
}
