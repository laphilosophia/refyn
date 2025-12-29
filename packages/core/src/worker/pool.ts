import type { Schema, TransformOptions, TransformTask, WorkerConfig, WorkerMessage } from '../types.js';

interface PendingTask {
  resolve: (result: { data: unknown[]; duration: number; rowCount: number }) => void;
  reject: (error: Error) => void;
  timeoutId?: ReturnType<typeof setTimeout>;
}

interface WorkerState {
  worker: Worker;
  index: number;
  healthy: boolean;
}

/**
 * Worker pool for parallel transform execution with auto-respawn
 */
export class WorkerPool {
  private workerStates: WorkerState[] = [];
  private pendingTasks = new Map<string, PendingTask>();
  private nextWorkerIndex = 0;
  private readyCount = 0;
  private readyResolvers: Array<() => void> = [];
  private workerUrl: string | URL;

  // Configuration
  private readonly config: Required<WorkerConfig>;

  constructor(
    workerCount: number = navigator.hardwareConcurrency || 4,
    workerUrl?: string | URL,
    config?: WorkerConfig
  ) {
    this.workerUrl = workerUrl ?? new URL('./transform.worker.js', import.meta.url);

    // Apply defaults
    this.config = {
      count: config?.count ?? workerCount,
      minCount: config?.minCount ?? 1,
      maxCount: config?.maxCount ?? 8,
      idleTimeout: config?.idleTimeout ?? 30000,
      autoRespawn: config?.autoRespawn ?? true,
    };
  }

  /**
   * Initialize the worker pool
   */
  async init(): Promise<void> {
    const count = this.config.count === 'auto'
      ? navigator.hardwareConcurrency || 4
      : this.config.count;

    // Clamp to min/max
    const workerCount = Math.max(
      this.config.minCount,
      Math.min(count, this.config.maxCount)
    );

    const promises = Array.from({ length: workerCount }, (_, i) =>
      this.spawnWorker(i)
    );

    await Promise.all(promises);
  }

  /**
   * Spawn a single worker
   */
  private spawnWorker(index: number): Promise<WorkerState> {
    return new Promise((resolve) => {
      const worker = new Worker(this.workerUrl, { type: 'module' });

      const state: WorkerState = {
        worker,
        index,
        healthy: false,
      };

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type === 'ready') {
          state.healthy = true;
          this.readyCount++;
          this.workerStates[index] = state;
          resolve(state);

          // Signal all ready
          if (this.readyCount === this.workerStates.filter(Boolean).length) {
            for (const resolver of this.readyResolvers) {
              resolver();
            }
            this.readyResolvers = [];
          }
          return;
        }

        this.handleWorkerMessage(event.data);
      };

      worker.onerror = (error) => {
        console.error(`[WorkerPool] Worker ${index} error:`, error);
        state.healthy = false;

        // Auto-respawn if enabled
        if (this.config.autoRespawn) {
          console.log(`[WorkerPool] Respawning worker ${index}...`);
          this.respawnWorker(index);
        }
      };
    });
  }

  /**
   * Respawn a crashed worker
   */
  private async respawnWorker(index: number): Promise<void> {
    const oldState = this.workerStates[index];
    if (oldState) {
      try {
        oldState.worker.terminate();
      } catch {
        // Already dead
      }
      if (oldState.healthy) {
        this.readyCount--;
      }
    }

    await this.spawnWorker(index);
  }

  /**
   * Wait for all workers to be ready
   */
  private waitForReady(): Promise<void> {
    const activeStates = this.workerStates.filter(Boolean);
    if (this.readyCount >= activeStates.length && activeStates.length > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.readyResolvers.push(resolve);
    });
  }

  /**
   * Handle message from worker
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    if (!message.id) {
      console.warn('[WorkerPool] Received message without task id');
      return;
    }

    const pending = this.pendingTasks.get(message.id);
    if (!pending) {
      console.warn('[WorkerPool] Message for unknown task:', message.id);
      return;
    }

    // Clear timeout
    if (pending.timeoutId) {
      clearTimeout(pending.timeoutId);
    }

    this.pendingTasks.delete(message.id);

    if (message.type === 'error') {
      pending.reject(new Error(message.error ?? 'Unknown worker error'));
    } else if (message.type === 'result') {
      pending.resolve(message.payload as { data: unknown[]; duration: number; rowCount: number });
    }
  }

  /**
   * Get a healthy worker (round-robin)
   */
  private getNextWorker(): Worker | null {
    const startIndex = this.nextWorkerIndex;

    do {
      const state = this.workerStates[this.nextWorkerIndex];
      this.nextWorkerIndex = (this.nextWorkerIndex + 1) % this.workerStates.length;

      if (state?.healthy) {
        return state.worker;
      }
    } while (this.nextWorkerIndex !== startIndex);

    return null;
  }

  /**
   * Execute a transform task with optional timeout
   */
  async execute(
    chunk: unknown[],
    schema: Schema,
    options: TransformOptions
  ): Promise<{ data: unknown[]; duration: number; rowCount: number }> {
    await this.waitForReady();

    const worker = this.getNextWorker();
    if (!worker) {
      throw new Error('No healthy workers available');
    }

    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const task: TransformTask = { id: taskId, chunk, schema, options };
    const timeout = options.chunkTimeout ?? 30000;

    return new Promise((resolve, reject) => {
      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingTasks.delete(taskId);
        reject(new Error(`Chunk timeout after ${timeout}ms`));
      }, timeout);

      this.pendingTasks.set(taskId, { resolve, reject, timeoutId });

      const message: WorkerMessage = {
        type: 'transform',
        id: taskId,
        payload: task,
      };

      worker.postMessage(message);
    });
  }

  /**
   * Execute with retry on failure
   */
  async executeWithRetry(
    chunk: unknown[],
    schema: Schema,
    options: TransformOptions,
    retries: number = 1
  ): Promise<{ data: unknown[]; duration: number; rowCount: number; retried: boolean }> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await this.execute(chunk, schema, options);
        return { ...result, retried: attempt > 0 };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retries) {
          console.warn(`[WorkerPool] Retry ${attempt + 1}/${retries} for chunk`);
        }
      }
    }

    throw lastError;
  }

  /**
   * Terminate all workers
   */
  terminate(): void {
    for (const state of this.workerStates) {
      if (state?.worker) {
        state.worker.terminate();
      }
    }
    this.workerStates = [];
    this.pendingTasks.clear();
    this.readyCount = 0;
  }

  /**
   * Get pool status
   */
  get status() {
    const healthy = this.workerStates.filter(s => s?.healthy).length;
    return {
      total: this.workerStates.length,
      healthy,
      unhealthy: this.workerStates.length - healthy,
      pending: this.pendingTasks.size,
    };
  }

  get size(): number {
    return this.workerStates.filter(s => s?.healthy).length;
  }
}
