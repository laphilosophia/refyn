// Core pipeline
export { createPipeline, Pipeline, type ValidatorFn } from './pipeline.js';

// Extract layer
export { extract, extractIterable, extractWithValidation } from './extract/parser.js';
export type { ExtractOptions, ExtractResult } from './extract/parser.js';

// Transform utilities
export { applySchema, castValue, getByPath, transform } from './transform/schema.js';

// Streaming
export {
  collectStream, createStream, processStream, streamFromArray, streamFromFetch, type StreamConfig,
  type StreamResult
} from './stream/reader.js';

// Validation
export {
  createValidator, rule, RuleBuilder, validateObject, validateValue, type ValidationResult, type ValidationRule, type ValidationType
} from './validate/validators.js';

// Cache
export { IndexedDBCache, type IndexedDBCacheConfig } from './cache/indexeddb.js';
export { CacheManager, createCacheManager, type CacheManagerConfig } from './cache/manager.js';
export { MemoryCache } from './cache/memory.js';

// Worker pool (for advanced usage)
export { WorkerPool } from './worker/pool.js';

// Types
export type {
  CacheConfig,
  // Cache
  CacheEntry, PipelineConfig,
  // Config
  RefynConfig,
  // Schema
  Schema,
  SchemaField,
  SchemaRule, TransformError, TransformOptions,
  // Results
  TransformResult, WorkerConfig
} from './types.js';

