/**
 * Schema rule definition for data transformation
 */
export interface SchemaRule {
  /** JSON path to extract value from, e.g. "meta.id" or "payload.items[0].name" */
  path?: string;
  /** Type cast to apply */
  cast?: 'date' | 'number' | 'bigint' | 'string' | 'boolean';
  /** Default value if source is null/undefined */
  default?: unknown;
  /** Allow null values */
  nullable?: boolean;
  /** For array mapping - path to source array */
  mapArray?: string;
  /** Schema for each item in mapped array */
  item?: Schema;
  /** Computed field - combine multiple paths */
  compute?: {
    /** Paths to extract for computation */
    paths: string[];
    /** Expression type */
    fn: 'concat' | 'sum' | 'first' | 'coalesce' | 'template';
    /** Template string for 'template' fn, e.g. "{0} - {1}" */
    template?: string;
    /** Separator for 'concat' fn */
    separator?: string;
  };
  /** Validation rule */
  validate?: {
    /** Validation type */
    type: 'required' | 'minLength' | 'maxLength' | 'pattern' | 'range' | 'enum';
    /** Value for the validation (length, pattern, min/max, or enum values) */
    value?: unknown;
    /** Error message if validation fails */
    message?: string;
  };
  /** Custom transform function name (for pre-registered transforms) */
  transform?: string;
}

/**
 * Schema definition - either a path string or a full rule object
 */
export type SchemaField = string | SchemaRule;

/**
 * Complete schema object - can contain nested schemas
 */
export interface Schema {
  [key: string]: SchemaField | Schema;
}

/**
 * Transform options
 */
export interface TransformOptions {
  /** Number of rows per chunk (default: 4000) */
  chunkSize?: number;
  /** Number of workers to use (default: navigator.hardwareConcurrency || 4) */
  workerCount?: number;
  /** Error handling mode */
  errorMode?: 'soft' | 'strict';
  /** Number of retries per chunk on failure (default: 1) */
  retryCount?: number;
  /** Timeout per chunk in ms (default: 30000) */
  chunkTimeout?: number;
}

/**
 * Worker pool configuration
 */
export interface WorkerConfig {
  /** Number of workers ('auto' uses hardwareConcurrency) */
  count?: number | 'auto';
  /** Minimum number of workers (default: 1) */
  minCount?: number;
  /** Maximum number of workers (default: 8) */
  maxCount?: number;
  /** Idle timeout before terminating unused workers (ms, default: 30000) */
  idleTimeout?: number;
  /** Auto-respawn crashed workers (default: true) */
  autoRespawn?: boolean;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Enable caching (default: true) */
  enabled?: boolean;
  /** Maximum cache entries (default: 100) */
  maxSize?: number;
  /** Default TTL in ms (default: 5 minutes) */
  ttl?: number;
  /** Eviction policy (default: 'lru') */
  eviction?: 'lru' | 'fifo';
}

/**
 * Complete Refyn configuration
 */
export interface RefynConfig {
  worker?: WorkerConfig;
  transform?: Omit<TransformOptions, 'workerCount'>;
  cache?: CacheConfig;
}

/**
 * Pipeline configuration
 */
export interface PipelineConfig {
  /** Schema definition (optional if passed to execute()) */
  schema?: Schema;
  /** Custom worker URL (for bundlers like Vite) */
  workerUrl?: string | URL;
  /** Complete configuration (preferred) */
  config?: RefynConfig;
  // Legacy options (deprecated, use config instead)
  /** @deprecated Use config.transform.chunkSize */
  chunkSize?: number;
  /** @deprecated Use config.worker.count */
  workerCount?: number;
  /** @deprecated Use config.transform.errorMode */
  errorMode?: 'soft' | 'strict';
}

/**
 * Transform error details
 */
export interface TransformError {
  /** Chunk index that failed */
  chunkIndex: number;
  /** Row range in original data [start, end] */
  rowRange: [number, number];
  /** Error message */
  message: string;
  /** Whether recovery was attempted */
  retried: boolean;
  /** Is this a recoverable error */
  recoverable: boolean;
}

/**
 * Transform result with metadata
 */
export interface TransformResult<T = unknown[]> {
  /** Transformed data */
  data: T;
  /** Execution metrics */
  metrics: {
    /** Total transform time in ms */
    totalTime: number;
    /** Worker processing time in ms */
    workerTime: number;
    /** Number of rows processed */
    rowCount: number;
    /** Number of chunks processed */
    chunkCount: number;
    /** Number of successful chunks */
    successCount: number;
    /** Number of failed chunks */
    failedCount: number;
  };
  /** Errors encountered during transform */
  errors: TransformError[];
  /** Whether any errors occurred */
  hasErrors: boolean;
  /** Whether transform partially succeeded (some data returned despite errors) */
  partialSuccess: boolean;
}

/**
 * Worker message types
 */
export interface WorkerMessage {
  type: 'transform' | 'result' | 'error' | 'ready';
  id?: string;
  payload?: unknown;
  error?: string;
}

/**
 * Transform task for worker
 */
export interface TransformTask {
  id: string;
  chunk: unknown[];
  schema: Schema;
  options: TransformOptions;
}

/**
 * Cache entry
 */
export interface CacheEntry<T = unknown> {
  data: T;
  createdAt: number;
  ttl?: number;
  hits: number;
}
