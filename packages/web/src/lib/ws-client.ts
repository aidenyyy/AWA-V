import type { ClientEvent, ServerEvent } from "@awa-v/shared";

type EventHandler = (event: ServerEvent) => void;
type StatusHandler = (connected: boolean) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<EventHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private subscribedProjectIds = new Set<string>();
  private subscribedPipelineIds = new Set<string>();
  private url: string;
  private _connected = false;

  constructor(url?: string) {
    this.url = url ?? "ws://localhost:2078/ws";
  }

  get connected(): boolean {
    return this._connected;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    this.shouldReconnect = true;

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log("[WS] Connected");
      this._connected = true;
      this.notifyStatus(true);
      for (const projectId of this.subscribedProjectIds) {
        this.send({ type: "subscribe:project", projectId });
      }
      for (const pipelineId of this.subscribedPipelineIds) {
        this.send({ type: "subscribe:pipeline", pipelineId });
      }
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
      this._connected = false;
      this.notifyStatus(false);
      if (this.shouldReconnect) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };

    this.ws.onerror = () => {
      console.warn("[WS] Connection error, will reconnect...");
    };
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this.notifyStatus(false);
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

  onStatusChange(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  subscribeToProject(projectId: string): void {
    this.subscribedProjectIds.add(projectId);
    this.send({ type: "subscribe:project", projectId });
  }

  unsubscribeFromProject(projectId: string): void {
    this.subscribedProjectIds.delete(projectId);
    this.send({ type: "unsubscribe:project", projectId });
  }

  subscribeToPipeline(pipelineId: string): void {
    this.subscribedPipelineIds.add(pipelineId);
    this.send({ type: "subscribe:pipeline", pipelineId });
  }

  unsubscribeFromPipeline(pipelineId: string): void {
    this.subscribedPipelineIds.delete(pipelineId);
    this.send({ type: "unsubscribe:pipeline", pipelineId });
  }

  private notifyStatus(connected: boolean): void {
    for (const handler of this.statusHandlers) {
      handler(connected);
    }
  }
}

export const wsClient = new WebSocketClient();
