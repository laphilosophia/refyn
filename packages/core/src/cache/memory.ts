import type { CacheEntry } from '../types.js';

/**
 * LRU Memory Cache for transformed data
 */
export class MemoryCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();

  constructor(
    private maxSize: number = 100,
    private defaultTtl?: number // milliseconds
  ) { }

  /**
   * Get a cached entry
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check TTL
    if (entry.ttl && Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    // Update hit count and move to end (most recently used)
    entry.hits++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  /**
   * Set a cache entry
   */
  set(key: string, data: T, ttl?: number): void {
    // Evict LRU entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const entry: CacheEntry<T> = {
      data,
      createdAt: Date.now(),
      ttl: ttl ?? this.defaultTtl,
      hits: 0,
    };

    this.cache.set(key, entry);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (entry.ttl && Date.now() - entry.createdAt > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a cache entry
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all entries matching a pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  get stats(): { size: number; maxSize: number; keys: string[] } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Preload data into cache
   */
  preload(entries: Array<{ key: string; data: T; ttl?: number }>): void {
    for (const { key, data, ttl } of entries) {
      this.set(key, data, ttl);
    }
  }

  /**
   * Delete a cache entry (alias for invalidate)
   */
  delete(key: string): boolean {
    return this.invalidate(key);
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all cache keys
   */
  keys(): IterableIterator<string> {
    return this.cache.keys();
  }
}
