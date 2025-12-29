import type {
  PipelineConfig,
  RefynConfig,
  Schema,
  TransformError,
  TransformOptions,
  TransformResult
} from './types.js';
import { WorkerPool } from './worker/pool.js';

/**
 * Split an array into chunks of specified size
 */
function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Merge legacy config with new RefynConfig
 */
function resolveConfig(config: PipelineConfig): {
  chunkSize: number;
  workerCount: number | 'auto';
  errorMode: 'soft' | 'strict';
  retryCount: number;
  chunkTimeout: number;
} {
  const refynConfig = config.config;

  return {
    chunkSize: refynConfig?.transform?.chunkSize ?? config.chunkSize ?? 4000,
    workerCount: refynConfig?.worker?.count ?? config.workerCount ?? 'auto',
    errorMode: refynConfig?.transform?.errorMode ?? config.errorMode ?? 'soft',
    retryCount: refynConfig?.transform?.retryCount ?? 1,
    chunkTimeout: refynConfig?.transform?.chunkTimeout ?? 30000,
  };
}

/**
 * ETL Pipeline for browser-side data transformation
 */
/**
 * Validator function type - can integrate with zod, ajv, etc.
 */
export type ValidatorFn = (row: unknown, index: number) => {
  valid: boolean;
  errors?: string[];
};

export class Pipeline {
  private pool: WorkerPool | null = null;
  private readonly defaultSchema: Schema | null;
  private readonly workerUrl?: string | URL;
  private readonly refynConfig?: RefynConfig;
  private validator?: ValidatorFn;

  // Resolved config values
  private readonly chunkSize: number;
  private readonly workerCount: number | 'auto';
  private readonly errorMode: 'soft' | 'strict';
  private readonly retryCount: number;
  private readonly chunkTimeout: number;

  constructor(config: PipelineConfig) {
    this.defaultSchema = config.schema ?? null;
    this.workerUrl = config.workerUrl;
    this.refynConfig = config.config;

    // Resolve config with defaults
    const resolved = resolveConfig(config);
    this.chunkSize = resolved.chunkSize;
    this.workerCount = resolved.workerCount;
    this.errorMode = resolved.errorMode;
    this.retryCount = resolved.retryCount;
    this.chunkTimeout = resolved.chunkTimeout;
  }

  /**
   * Initialize the worker pool
   */
  async init(): Promise<void> {
    if (this.pool) return;

    const count = this.workerCount === 'auto'
      ? (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) ?? 4
      : this.workerCount;

    this.pool = new WorkerPool(count, this.workerUrl, this.refynConfig?.worker);
    await this.pool.init();
  }

  /**
   * Set a validator function (integrates with zod, ajv, etc.)
   */
  setValidator(fn: ValidatorFn): this {
    this.validator = fn;
    return this;
  }

  /**
   * Execute the transform pipeline with optional dynamic schema
   * @param data - Input data array
   * @param schema - Optional schema (overrides default)
   */
  async execute<T = unknown[]>(
    data: unknown[],
    schema?: Schema
  ): Promise<TransformResult<T>> {
    const startTime = performance.now();

    // Use provided schema or fall back to default
    const activeSchema = schema ?? this.defaultSchema;
    if (!activeSchema) {
      throw new Error('No schema provided. Pass schema to execute() or set in createPipeline().');
    }

    // Ensure pool is initialized
    await this.init();

    // Split data into chunks
    const chunks = chunk(data, this.chunkSize);

    const options: TransformOptions = {
      chunkSize: this.chunkSize,
      errorMode: this.errorMode,
      retryCount: this.retryCount,
      chunkTimeout: this.chunkTimeout,
    };

    // Track results and errors
    let totalWorkerTime = 0;
    const results: Array<{ index: number; data: unknown[] }> = [];
    const errors: TransformError[] = [];
    const validationErrors: Array<{ rowIndex: number; errors: string[] }> = [];
    let successCount = 0;
    let failedCount = 0;

    // Run validation if validator is set
    if (this.validator) {
      for (let i = 0; i < data.length; i++) {
        const result = this.validator(data[i], i);
        if (!result.valid && result.errors) {
          validationErrors.push({ rowIndex: i, errors: result.errors });
        }
      }

      // In strict mode, fail if any validation errors
      if (validationErrors.length > 0 && this.errorMode === 'strict') {
        throw new Error(`Validation failed for ${validationErrors.length} rows`);
      }
    }

    // Process all chunks in parallel with retry
    const chunkPromises = chunks.map(async (chunkData, index) => {
      const rowStart = index * this.chunkSize;
      const rowEnd = Math.min(rowStart + chunkData.length, data.length);

      try {
        const result = await this.pool!.executeWithRetry(
          chunkData,
          activeSchema,
          options,
          this.retryCount
        );

        totalWorkerTime += result.duration;
        successCount++;

        return {
          index,
          data: result.data,
          retried: result.retried,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        errors.push({
          chunkIndex: index,
          rowRange: [rowStart, rowEnd],
          message: errorMessage,
          retried: true,
          recoverable: this.errorMode === 'soft',
        });

        failedCount++;

        if (this.errorMode === 'strict') {
          throw error;
        }

        console.warn(`[Pipeline] Chunk ${index} failed after retries:`, errorMessage);
        return { index, data: [], retried: true };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);

    // Sort by index to maintain order
    chunkResults.sort((a, b) => a.index - b.index);
    for (const result of chunkResults) {
      results.push({ index: result.index, data: result.data as unknown[] });
    }

    // Flatten results
    const flatResults = results.flatMap(r => r.data);

    const totalTime = performance.now() - startTime;

    return {
      data: flatResults as T,
      metrics: {
        totalTime,
        workerTime: totalWorkerTime,
        rowCount: data.length,
        chunkCount: chunks.length,
        successCount,
        failedCount,
      },
      errors,
      hasErrors: errors.length > 0,
      partialSuccess: errors.length > 0 && successCount > 0,
    };
  }

  /**
   * Get worker pool status
   */
  get poolStatus() {
    return this.pool?.status ?? { total: 0, healthy: 0, unhealthy: 0, pending: 0 };
  }

  /**
   * Terminate the worker pool
   */
  destroy(): void {
    if (this.pool) {
      this.pool.terminate();
      this.pool = null;
    }
  }
}

/**
 * Create a new pipeline instance
 */
export function createPipeline(config: PipelineConfig): Pipeline {
  return new Pipeline(config);
}
