/**
 * Streaming Reader - Process large datasets in chunks without loading all into memory
 */

import { applySchema } from '../transform/schema.js';
import type { Schema } from '../types.js';

export interface StreamConfig {
  /** Chunk size for processing (default: 1000) */
  chunkSize?: number;
  /** High water mark for backpressure (default: 3) */
  highWaterMark?: number;
}

export interface StreamResult<T> {
  /** Async iterator for transformed chunks */
  [Symbol.asyncIterator](): AsyncIterator<T[]>;
  /** Cancel the stream */
  cancel(): void;
  /** Stream is complete */
  readonly done: boolean;
  /** Total rows processed so far */
  readonly processedCount: number;
}

/**
 * Create a streaming transformer from an async iterable source
 */
export function createStream<T = unknown>(
  source: AsyncIterable<unknown> | Iterable<unknown>,
  schema: Schema,
  config: StreamConfig = {}
): StreamResult<T> {
  const chunkSize = config.chunkSize ?? 1000;
  let cancelled = false;
  let done = false;
  let processedCount = 0;

  async function* streamGenerator(): AsyncGenerator<T[]> {
    let buffer: unknown[] = [];

    for await (const item of source) {
      if (cancelled) break;

      buffer.push(item);

      if (buffer.length >= chunkSize) {
        const transformed = buffer.map(row => applySchema(row, schema)) as T[];
        processedCount += transformed.length;
        yield transformed;
        buffer = [];
      }
    }

    // Flush remaining items
    if (buffer.length > 0 && !cancelled) {
      const transformed = buffer.map(row => applySchema(row, schema)) as T[];
      processedCount += transformed.length;
      yield transformed;
    }

    done = true;
  }

  const iterator = streamGenerator();

  return {
    [Symbol.asyncIterator]() {
      return iterator;
    },
    cancel() {
      cancelled = true;
    },
    get done() {
      return done;
    },
    get processedCount() {
      return processedCount;
    },
  };
}

/**
 * Create a stream from a fetch response (NDJSON or JSON array)
 */
export async function* streamFromFetch(
  url: string,
  options?: RequestInit
): AsyncGenerator<unknown> {
  const response = await fetch(url, options);

  if (!response.ok) {
    throw new Error(`Fetch failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error('Response has no body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Try to parse NDJSON (newline-delimited JSON)
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            yield JSON.parse(trimmed);
          } catch {
            // Not valid JSON, skip
          }
        }
      }
    }

    // Parse remaining buffer
    if (buffer.trim()) {
      try {
        yield JSON.parse(buffer.trim());
      } catch {
        // Not valid JSON
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Create a stream from a JSON array (processes items one by one)
 */
export function* streamFromArray<T>(array: T[]): Generator<T> {
  for (const item of array) {
    yield item;
  }
}

/**
 * Collect all chunks from a stream into a single array
 */
export async function collectStream<T>(stream: StreamResult<T>): Promise<T[]> {
  const results: T[] = [];

  for await (const chunk of stream) {
    results.push(...chunk);
  }

  return results;
}

/**
 * Process a stream with a callback for each chunk
 */
export async function processStream<T>(
  stream: StreamResult<T>,
  onChunk: (chunk: T[], index: number) => void | Promise<void>,
  onComplete?: (totalCount: number) => void
): Promise<number> {
  let chunkIndex = 0;

  for await (const chunk of stream) {
    await onChunk(chunk, chunkIndex++);
  }

  onComplete?.(stream.processedCount);
  return stream.processedCount;
}
