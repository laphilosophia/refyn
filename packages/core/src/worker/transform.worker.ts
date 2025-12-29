import { transform } from '../transform/schema.js';
import type { TransformTask, WorkerMessage } from '../types.js';

/**
 * Web Worker for off-thread data transformation
 */

// Worker message handler
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const message = event.data;

  if (message.type === 'transform') {
    const task = message.payload as TransformTask;

    try {
      const startTime = performance.now();
      const result = transform(task.chunk, task.schema);
      const duration = performance.now() - startTime;

      const response: WorkerMessage = {
        type: 'result',
        id: task.id,
        payload: {
          data: result,
          duration,
          rowCount: task.chunk.length,
        },
      };

      self.postMessage(response);
    } catch (error) {
      const response: WorkerMessage = {
        type: 'error',
        id: task.id,
        error: error instanceof Error ? error.message : String(error),
      };

      self.postMessage(response);
    }
  }
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
