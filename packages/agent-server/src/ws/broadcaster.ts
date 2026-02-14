import type { WebSocket } from "@fastify/websocket";
import type { ServerEvent } from "@awa-v/shared";
import pino from "pino";

const log = pino({ name: "broadcaster" });

interface Subscription {
  ws: WebSocket;
  projectIds: Set<string>;
  pipelineIds: Set<string>;
}

/**
 * Manages WebSocket subscriptions and broadcasts events to clients.
 */
class Broadcaster {
  private clients = new Map<WebSocket, Subscription>();

  addClient(ws: WebSocket): void {
    this.clients.set(ws, {
      ws,
      projectIds: new Set(),
      pipelineIds: new Set(),
    });
    log.info({ clients: this.clients.size }, "Client connected");
  }

  removeClient(ws: WebSocket): void {
    this.clients.delete(ws);
    log.info({ clients: this.clients.size }, "Client disconnected");
  }

  subscribe(ws: WebSocket, type: "project" | "pipeline", id: string): void {
    const sub = this.clients.get(ws);
    if (!sub) return;
    if (type === "project") {
      sub.projectIds.add(id);
    } else {
      sub.pipelineIds.add(id);
    }
  }

  unsubscribe(ws: WebSocket, type: "project" | "pipeline", id: string): void {
    const sub = this.clients.get(ws);
    if (!sub) return;
    if (type === "project") {
      sub.projectIds.delete(id);
    } else {
      sub.pipelineIds.delete(id);
    }
  }

  /** Broadcast to all clients subscribed to a project */
  broadcastToProject(projectId: string, event: ServerEvent): void {
    for (const sub of this.clients.values()) {
      if (sub.projectIds.has(projectId)) {
        this.send(sub.ws, event);
      }
    }
  }

  /** Broadcast to all clients subscribed to a pipeline */
  broadcastToPipeline(pipelineId: string, event: ServerEvent): void {
    for (const sub of this.clients.values()) {
      if (sub.pipelineIds.has(pipelineId)) {
        this.send(sub.ws, event);
      }
    }
  }

  /** Broadcast to all connected clients */
  broadcastToAll(event: ServerEvent): void {
    for (const sub of this.clients.values()) {
      this.send(sub.ws, event);
    }
  }

  private send(ws: WebSocket, event: ServerEvent): void {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(event));
      }
    } catch (err) {
      log.error({ error: (err as Error).message }, "Failed to send WS message");
    }
  }
}

export const broadcaster = new Broadcaster();
