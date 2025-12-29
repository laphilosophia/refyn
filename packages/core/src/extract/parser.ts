import type { Schema } from '../types.js';

/**
 * Extract layer - handles JSON input and prepares data for transformation
 */

export interface ExtractOptions {
  /** Path to the array within the JSON (e.g., "data.items" or "ConceptList") */
  arrayPath?: string;
  /** Whether to validate JSON structure */
  validate?: boolean;
}

export interface ExtractResult {
  data: unknown[];
  metadata: {
    totalSize: number;
    rowCount: number;
    extractTime: number;
  };
}

/**
 * Get a value from an object by dot-notation path
 */
function getByPath(obj: unknown, path: string): unknown {
  if (!path) return obj;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

/**
 * Auto-detect array path in JSON object
 */
function detectArrayPath(obj: unknown): string | null {
  if (Array.isArray(obj)) return '';

  if (typeof obj === 'object' && obj !== null) {
    // Check top-level properties for arrays
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        return key;
      }
    }

    // Check one level deeper
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'object' && value !== null) {
        for (const [subKey, subValue] of Object.entries(value)) {
          if (Array.isArray(subValue)) {
            return `${key}.${subKey}`;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Extract data from JSON input
 */
export function extract(
  input: unknown,
  options: ExtractOptions = {}
): ExtractResult {
  const startTime = performance.now();

  let data: unknown[];

  if (Array.isArray(input)) {
    data = input;
  } else if (options.arrayPath) {
    const extracted = getByPath(input, options.arrayPath);
    if (!Array.isArray(extracted)) {
      throw new Error(`Path "${options.arrayPath}" does not point to an array`);
    }
    data = extracted;
  } else {
    // Auto-detect array path
    const detectedPath = detectArrayPath(input);
    if (detectedPath === null) {
      throw new Error('Could not find array in input. Specify arrayPath option.');
    }

    const extracted = detectedPath === '' ? input : getByPath(input, detectedPath);
    if (!Array.isArray(extracted)) {
      throw new Error('Detected path does not contain an array');
    }
    data = extracted;
  }

  const extractTime = performance.now() - startTime;

  // Estimate size (rough approximation)
  const totalSize = JSON.stringify(data).length;

  return {
    data,
    metadata: {
      totalSize,
      rowCount: data.length,
      extractTime,
    },
  };
}

/**
 * Create an iterable extractor for streaming-ready processing
 */
export function* extractIterable(
  input: unknown,
  options: ExtractOptions = {}
): Generator<unknown, void, unknown> {
  const result = extract(input, options);

  for (const item of result.data) {
    yield item;
  }
}

/**
 * Extract with validation
 */
export function extractWithValidation(
  input: unknown,
  schema: Schema,
  options: ExtractOptions = {}
): ExtractResult & { warnings: string[] } {
  const result = extract(input, options);
  const warnings: string[] = [];

  // Basic validation - check if required fields exist in first item
  if (result.data.length > 0) {
    const sample = result.data[0] as Record<string, unknown>;

    for (const [key, field] of Object.entries(schema)) {
      const path = typeof field === 'string' ? field : (field as { path?: string }).path;

      if (path && !getByPath(sample, path)) {
        warnings.push(`Field "${key}" (path: "${path}") not found in sample data`);
      }
    }
  }

  return { ...result, warnings };
}
