/**
 * Unified Cache Manager - L1 (Memory) + L2 (IndexedDB) tiered caching
 */

import { IndexedDBCache, type IndexedDBCacheConfig } from './indexeddb.js';
import { MemoryCache } from './memory.js';

export interface CacheManagerConfig {
  /** L1 Memory cache config */
  l1?: {
    enabled?: boolean;
    maxSize?: number;
    ttl?: number;
  };
  /** L2 IndexedDB cache config */
  l2?: IndexedDBCacheConfig & {
    enabled?: boolean;
  };
}

/**
 * Tiered cache manager with L1 (fast, memory) and L2 (persistent, IndexedDB)
 */
export class CacheManager {
  private l1: MemoryCache | null = null;
  private l2: IndexedDBCache | null = null;
  private readonly config: CacheManagerConfig;

  constructor(config: CacheManagerConfig = {}) {
    this.config = config;

    // Initialize L1 if enabled (default: true)
    if (config.l1?.enabled !== false) {
      this.l1 = new MemoryCache(
        config.l1?.maxSize ?? 100,
        config.l1?.ttl
      );
    }

    // L2 is lazy-initialized (IndexedDB is async)
  }

  /**
   * Initialize L2 cache (call before using L2)
   */
  async initL2(): Promise<void> {
    if (this.config.l2?.enabled === false) return;
    if (this.l2) return;

    this.l2 = new IndexedDBCache(this.config.l2);
    await this.l2.init();
  }

  /**
   * Get value - checks L1 first, then L2
   */
  async get<T>(key: string): Promise<T | null> {
    // Try L1 first (sync, fast)
    if (this.l1) {
      const l1Value = this.l1.get(key);
      if (l1Value !== undefined) {
        return l1Value as T;
      }
    }

    // Try L2 (async, persistent)
    if (this.l2) {
      const l2Value = await this.l2.get<T>(key);
      if (l2Value !== null) {
        // Promote to L1
        if (this.l1) {
          this.l1.set(key, l2Value, this.config.l1?.ttl);
        }
        return l2Value;
      }
    }

    return null;
  }

  /**
   * Set value - writes to both L1 and L2
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Write to L1 (sync)
    if (this.l1) {
      this.l1.set(key, value, ttl ?? this.config.l1?.ttl);
    }

    // Write to L2 (async)
    if (this.l2) {
      await this.l2.set(key, value, ttl ?? this.config.l2?.ttl);
    }
  }

  /**
   * Delete from both caches
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false;

    if (this.l1) {
      deleted = this.l1.delete(key) || deleted;
    }

    if (this.l2) {
      deleted = await this.l2.delete(key) || deleted;
    }

    return deleted;
  }

  /**
   * Check if key exists in either cache
   */
  async has(key: string): Promise<boolean> {
    if (this.l1?.has(key)) return true;
    if (this.l2) return await this.l2.has(key);
    return false;
  }

  /**
   * Clear both caches
   */
  async clear(): Promise<void> {
    if (this.l1) this.l1.clear();
    if (this.l2) await this.l2.clear();
  }

  /**
   * Get cache stats
   */
  async stats(): Promise<{
    l1: { size: number; enabled: boolean } | null;
    l2: { count: number; enabled: boolean } | null;
  }> {
    return {
      l1: this.l1 ? { size: this.l1.size, enabled: true } : null,
      l2: this.l2 ? { count: await this.l2.count(), enabled: true } : null,
    };
  }

  /**
   * Invalidate by pattern (simple prefix match)
   */
  async invalidateByPrefix(prefix: string): Promise<number> {
    let count = 0;

    // L1 - iterate and delete matching
    if (this.l1) {
      for (const key of this.l1.keys()) {
        if (key.startsWith(prefix)) {
          this.l1.delete(key);
          count++;
        }
      }
    }

    // L2 - get all keys and delete matching
    if (this.l2) {
      const keys = await this.l2.keys();
      for (const key of keys) {
        if (key.startsWith(prefix)) {
          await this.l2.delete(key);
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Preload data into cache
   */
  async preload<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }

  /**
   * Get L1 cache instance (for direct access)
   */
  getL1(): MemoryCache | null {
    return this.l1;
  }

  /**
   * Get L2 cache instance (for direct access)
   */
  getL2(): IndexedDBCache | null {
    return this.l2;
  }

  /**
   * Close L2 connection
   */
  close(): void {
    if (this.l2) {
      this.l2.close();
      this.l2 = null;
    }
  }
}

/**
 * Create a pre-configured cache manager
 */
export function createCacheManager(config?: CacheManagerConfig): CacheManager {
  return new CacheManager(config);
}
