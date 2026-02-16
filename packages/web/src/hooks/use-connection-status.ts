"use client";

import { useState, useEffect } from "react";
import { wsClient } from "@/lib/ws-client";

/** Returns true when the WebSocket connection to the agent-server is open.
 *  Includes a 5-second grace period on initial load to suppress false "System Offline" flash. */
export function useConnectionStatus(): boolean {
  const [connected, setConnected] = useState(wsClient.connected);
  const [initialized, setInitialized] = useState(wsClient.connected);

  useEffect(() => {
    setConnected(wsClient.connected);
    const unsub = wsClient.onStatusChange((c) => {
      setConnected(c);
      if (c) setInitialized(true);
    });

    // After 5s grace period, show true connection state
    const timer = setTimeout(() => setInitialized(true), 5000);
    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  // During initialization, report as connected to avoid flash
  if (!initialized) return true;
  return connected;
}
