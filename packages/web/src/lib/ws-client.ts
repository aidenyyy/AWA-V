import type { ClientEvent, ServerEvent } from "@awa-v/shared";

type EventHandler = (event: ServerEvent) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private url: string;

  constructor(url?: string) {
    this.url = url ?? "ws://localhost:2078/ws";
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] Connected");
    };

    this.ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as ServerEvent;
        for (const handler of this.handlers) {
          handler(event);
        }
      } catch {
        console.warn("[WS] Failed to parse message");
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected, reconnecting in 3s...");
      this.reconnectTimer = setTimeout(() => this.connect(), 3000);
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close();
    this.ws = null;
  }

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeToProject(projectId: string): void {
    this.send({ type: "subscribe:project", projectId });
  }

  unsubscribeFromProject(projectId: string): void {
    this.send({ type: "unsubscribe:project", projectId });
  }

  subscribeToPipeline(pipelineId: string): void {
    this.send({ type: "subscribe:pipeline", pipelineId });
  }

  unsubscribeFromPipeline(pipelineId: string): void {
    this.send({ type: "unsubscribe:pipeline", pipelineId });
  }
}

export const wsClient = new WebSocketClient();
