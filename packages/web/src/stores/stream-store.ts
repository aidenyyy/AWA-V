import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { StreamChunk } from "@awa-v/shared";

interface StreamEntry {
  taskId: string;
  chunks: StreamChunk[];
  isActive: boolean;
}

interface StreamState {
  streams: Record<string, StreamEntry>;
  activeStreamTaskId: string | null;

  addChunk: (taskId: string, chunk: StreamChunk) => void;
  setActiveStream: (taskId: string | null) => void;
  markStreamDone: (taskId: string) => void;
  clearStream: (taskId: string) => void;
}

const MAX_CHUNKS = 500;

export const useStreamStore = create<StreamState>()(
  immer((set) => ({
    streams: {},
    activeStreamTaskId: null,

    addChunk: (taskId, chunk) =>
      set((state) => {
        if (!state.streams[taskId]) {
          state.streams[taskId] = { taskId, chunks: [], isActive: true };
        }
        const stream = state.streams[taskId];
        stream.chunks.push(chunk);
        // Prevent unbounded growth
        if (stream.chunks.length > MAX_CHUNKS) {
          stream.chunks = stream.chunks.slice(-MAX_CHUNKS);
        }
      }),

    setActiveStream: (taskId) =>
      set((state) => {
        state.activeStreamTaskId = taskId;
      }),

    markStreamDone: (taskId) =>
      set((state) => {
        if (state.streams[taskId]) {
          state.streams[taskId].isActive = false;
        }
      }),

    clearStream: (taskId) =>
      set((state) => {
        delete state.streams[taskId];
      }),
  }))
);
