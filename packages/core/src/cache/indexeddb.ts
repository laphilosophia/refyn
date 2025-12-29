/**
 * L2 Persistent Cache using IndexedDB
 * - Async operations (unlike L1 sync)
 * - Survives page reload
 * - Larger capacity (limited by disk)
 * - TTL support
 */

interface IndexedDBEntry<T> {
  key: string;
  data: T;
  createdAt: number;
  expiresAt: number | null;
}

export interface IndexedDBCacheConfig {
  /** Database name (default: 'refyn-cache') */
  dbName?: string;
  /** Store name (default: 'transforms') */
  storeName?: string;
  /** Default TTL in ms (default: 24 hours) */
  ttl?: number;
  /** Max entries (triggers cleanup, default: 1000) */
  maxEntries?: number;
}

export class IndexedDBCache {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private readonly storeName: string;
  private readonly defaultTtl: number;
  private readonly maxEntries: number;

  constructor(config: IndexedDBCacheConfig = {}) {
    this.dbName = config.dbName ?? 'refyn-cache';
    this.storeName = config.storeName ?? 'transforms';
    this.defaultTtl = config.ttl ?? 24 * 60 * 60 * 1000; // 24 hours
    this.maxEntries = config.maxEntries ?? 1000;
  }

  /**
   * Initialize (open) the IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store if not exists
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
    });
  }

  /**
   * Ensure database is initialized
   */
  private async ensureDb(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const entry = request.result as IndexedDBEntry<T> | undefined;

        if (!entry) {
          resolve(null);
          return;
        }

        // Check expiration
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
          // Expired - delete async and return null
          this.delete(key).catch(() => { });
          resolve(null);
          return;
        }

        resolve(entry.data);
      };
    });
  }

  /**
   * Set a value in cache
   */
  async set<T>(key: string, data: T, ttl?: number): Promise<void> {
    const db = await this.ensureDb();
    const now = Date.now();
    const ttlMs = ttl ?? this.defaultTtl;

    const entry: IndexedDBEntry<T> = {
      key,
      data,
      createdAt: now,
      expiresAt: ttlMs > 0 ? now + ttlMs : null,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve();
        // Trigger cleanup if needed (async, don't block)
        this.cleanupIfNeeded().catch(() => { });
      };
    });
  }

  /**
   * Delete a value from cache
   */
  async delete(key: string): Promise<boolean> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(true);
    });
  }

  /**
   * Check if key exists (and not expired)
   */
  async has(key: string): Promise<boolean> {
    const value = await this.get(key);
    return value !== null;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Get count of entries
   */
  async count(): Promise<number> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Get all keys
   */
  async keys(): Promise<string[]> {
    const db = await this.ensureDb();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAllKeys();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as string[]);
    });
  }

  /**
   * Remove expired entries
   */
  async cleanupExpired(): Promise<number> {
    const db = await this.ensureDb();
    const now = Date.now();
    let deletedCount = 0;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('expiresAt');

      // Get all expired entries (expiresAt < now and expiresAt !== null)
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

        if (cursor) {
          const entry = cursor.value as IndexedDBEntry<unknown>;
          // Skip entries with no expiration (expiresAt = null)
          if (entry.expiresAt !== null) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
    });
  }

  /**
   * Cleanup if max entries exceeded (remove oldest)
   */
  private async cleanupIfNeeded(): Promise<void> {
    const count = await this.count();

    if (count <= this.maxEntries) return;

    const db = await this.ensureDb();
    const toDelete = count - this.maxEntries + Math.floor(this.maxEntries * 0.1); // Delete 10% extra

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('createdAt');

      const request = index.openCursor();
      let deleted = 0;

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue | null;

        if (cursor && deleted < toDelete) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Delete the entire database
   */
  static async deleteDatabase(dbName: string = 'refyn-cache'): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(dbName);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}
