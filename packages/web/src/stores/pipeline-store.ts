import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Pipeline, Stage, Task, Plan } from "@awa-v/shared";

interface PipelineState {
  pipelines: Record<string, Pipeline>;
  stages: Record<string, Stage>;
  tasks: Record<string, Task>;
  plans: Record<string, Plan>;
  activePipelineId: string | null;

  setPipelines: (pipelines: Pipeline[]) => void;
  updatePipeline: (pipeline: Pipeline) => void;
  updateStage: (stage: Stage) => void;
  updateTask: (task: Task) => void;
  addPlan: (plan: Plan) => void;
  updatePlan: (plan: Plan) => void;
  setActivePipeline: (id: string | null) => void;
}

export const usePipelineStore = create<PipelineState>()(
  immer((set) => ({
    pipelines: {},
    stages: {},
    tasks: {},
    plans: {},
    activePipelineId: null,

    setPipelines: (pipelines) =>
      set((state) => {
        for (const p of pipelines) {
          state.pipelines[p.id] = p;
        }
      }),

    updatePipeline: (pipeline) =>
      set((state) => {
        state.pipelines[pipeline.id] = pipeline;
      }),

    updateStage: (stage) =>
      set((state) => {
        state.stages[stage.id] = stage;
      }),

    updateTask: (task) =>
      set((state) => {
        state.tasks[task.id] = task;
      }),

    addPlan: (plan) =>
      set((state) => {
        state.plans[plan.id] = plan;
      }),

    updatePlan: (plan) =>
      set((state) => {
        state.plans[plan.id] = plan;
      }),

    setActivePipeline: (id) =>
      set((state) => {
        state.activePipelineId = id;
      }),
  }))
);
