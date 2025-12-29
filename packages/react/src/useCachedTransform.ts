/**
 * useCachedTransform - Transform with automatic caching
 */

import type { CacheManager, Pipeline, Schema } from '@refyn/core';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseCachedTransformOptions {
  /** Pipeline instance */
  pipeline: Pipeline;
  /** Cache manager instance */
  cache: CacheManager;
  /** Schema for transformation */
  schema?: Schema;
  /** Cache key generator */
  getCacheKey: (data: unknown[]) => string;
  /** TTL for cache entries (ms) */
  ttl?: number;
  /** Skip cache and always transform */
  skipCache?: boolean;
}

export interface UseCachedTransformReturn<T = unknown[]> {
  /** Transformed data */
  data: T | null;
  /** Loading state */
  isLoading: boolean;
  /** Error if any */
  error: Error | null;
  /** Whether result came from cache */
  fromCache: boolean;
  /** Execute transformation (checks cache first) */
  execute: (data: unknown[], schema?: Schema) => Promise<T>;
  /** Invalidate cache for specific key */
  invalidate: (key: string) => Promise<void>;
  /** Clear all cache */
  clearCache: () => Promise<void>;
}

export function useCachedTransform<T = unknown[]>(
  options: UseCachedTransformOptions
): UseCachedTransformReturn<T> {
  const { pipeline, cache, schema, getCacheKey, ttl, skipCache = false } = options;

  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fromCache, setFromCache] = useState(false);

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
  ): Promise<T> => {
    setIsLoading(true);
    setError(null);
    setFromCache(false);

    const cacheKey = getCacheKey(inputData);

    try {
      // Check cache first (unless skipCache)
      if (!skipCache) {
        const cached = await cache.get<T>(cacheKey);
        if (cached !== null) {
          if (mountedRef.current) {
            setData(cached);
            setFromCache(true);
            setIsLoading(false);
          }
          return cached;
        }
      }

      // Transform
      const result = await pipeline.execute<T>(inputData, overrideSchema ?? schema);

      // Cache the result
      await cache.set(cacheKey, result.data, ttl);

      if (mountedRef.current) {
        setData(result.data);
      }

      return result.data;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (mountedRef.current) {
        setError(error);
      }

      throw error;
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [pipeline, cache, schema, getCacheKey, ttl, skipCache]);

  const invalidate = useCallback(async (key: string) => {
    await cache.delete(key);
  }, [cache]);

  const clearCache = useCallback(async () => {
    await cache.clear();
  }, [cache]);

  return {
    data,
    isLoading,
    error,
    fromCache,
    execute,
    invalidate,
    clearCache,
  };
}
