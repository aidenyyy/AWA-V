"use client";

import { useEffect, useRef } from "react";
import { wsClient } from "@/lib/ws-client";
import { usePipelineStore } from "@/stores/pipeline-store";
import { useStreamStore } from "@/stores/stream-store";
import { useNotificationStore } from "@/stores/notification-store";
import { useInterventionStore } from "@/stores/intervention-store";
import type { ServerEvent } from "@awa-v/shared";

export function useWebSocket() {
  const connected = useRef(false);
  const updatePipeline = usePipelineStore((s) => s.updatePipeline);
  const updateStage = usePipelineStore((s) => s.updateStage);
  const updateTask = usePipelineStore((s) => s.updateTask);
  const addPlan = usePipelineStore((s) => s.addPlan);
  const updatePlan = usePipelineStore((s) => s.updatePlan);
  const addChunk = useStreamStore((s) => s.addChunk);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const addIntervention = useInterventionStore((s) => s.addIntervention);
  const resolveIntervention = useInterventionStore((s) => s.resolveIntervention);

  useEffect(() => {
    if (connected.current) return;
    connected.current = true;

    wsClient.connect();

    const unsub = wsClient.subscribe((event: ServerEvent) => {
      switch (event.type) {
        case "pipeline:created":
        case "pipeline:updated":
          updatePipeline(event.pipeline);
          break;
        case "stage:updated":
          updateStage(event.stage);
          break;
        case "task:updated":
          updateTask(event.task);
          break;
        case "plan:created":
          addPlan(event.plan);
          break;
        case "plan:updated":
          updatePlan(event.plan);
          break;
        case "stream:chunk":
          addChunk(event.taskId, event.chunk);
          break;
        case "intervention:requested":
          addIntervention(event.intervention);
          break;
        case "intervention:resolved":
          resolveIntervention(event.intervention.id, event.intervention);
          break;
        case "notification":
          addNotification({
            level: event.level,
            title: event.title,
            message: event.message,
            pipelineId: event.pipelineId,
          });
          break;
      }
    });

    return () => {
      unsub();
      wsClient.disconnect();
      connected.current = false;
    };
  }, [updatePipeline, updateStage, updateTask, addPlan, updatePlan, addChunk, addNotification, addIntervention, resolveIntervention]);
}

export function useSubscribeToProject(projectId: string | null) {
  useEffect(() => {
    if (!projectId) return;
    wsClient.subscribeToProject(projectId);
    return () => wsClient.unsubscribeFromProject(projectId);
  }, [projectId]);
}

export function useSubscribeToPipeline(pipelineId: string | null) {
  useEffect(() => {
    if (!pipelineId) return;
    wsClient.subscribeToPipeline(pipelineId);
    return () => wsClient.unsubscribeFromPipeline(pipelineId);
  }, [pipelineId]);
}
