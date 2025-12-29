/**
 * useTransform - React hook for ETL transformation
 */

import type { Pipeline, Schema, TransformError, TransformResult } from '@refyn/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseTransformOptions {
  /** Pipeline instance to use */
  pipeline: Pipeline;
  /** Schema for transformation (optional if pipeline has default) */
  schema?: Schema;
  /** Auto-execute on mount with initial data */
  initialData?: unknown[];
  /** Callback on success */
  onSuccess?: (result: TransformResult) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface UseTransformReturn<T = unknown[]> {
  /** Transformed data */
  data: T | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Transform errors (from soft mode) */
  transformErrors: TransformError[];
  /** Whether transform completed with some errors */
  hasErrors: boolean;
  /** Execute the transformation */
  execute: (data: unknown[], schema?: Schema) => Promise<TransformResult<T>>;
  /** Reset state */
  reset: () => void;
  /** Metrics from last transform */
  metrics: TransformResult['metrics'] | null;
}

export function useTransform<T = unknown[]>(
  options: UseTransformOptions
): UseTransformReturn<T> {
  const { pipeline, schema, initialData, onSuccess, onError } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [transformErrors, setTransformErrors] = useState<TransformError[]>([]);
  const [metrics, setMetrics] = useState<TransformResult['metrics'] | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const execute = useCallback(async (
    inputData: unknown[],
    overrideSchema?: Schema
  ): Promise<TransformResult<T>> => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await pipeline.execute<T>(inputData, overrideSchema ?? schema);

      if (mountedRef.current) {
        setData(result.data);
        setTransformErrors(result.errors);
        setMetrics(result.metrics);
        onSuccess?.(result as TransformResult);
      }

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (mountedRef.current) {
        setError(error);
        onError?.(error);
      }

      throw error;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [pipeline, schema, onSuccess, onError]);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setTransformErrors([]);
    setMetrics(null);
    setIsLoading(false);
  }, []);

  // Auto-execute with initial data
  useEffect(() => {
    if (initialData && initialData.length > 0) {
      execute(initialData).catch(() => { });
    }
  }, []); // Only on mount

  return {
    data,
    isLoading,
    error,
    transformErrors,
    hasErrors: transformErrors.length > 0,
    execute,
    reset,
    metrics,
  };
}
