# Refyn

> **In-browser ETL runtime for zero-freeze data transformation**

[![npm version](https://badge.fury.io/js/@refyn/core.svg)](https://www.npmjs.com/package/@refyn/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Transform large JSON datasets in the browser without blocking the UI thread. Refyn uses Web Workers for parallel processing and provides a declarative schema DSL for data mapping.

## Features

- 🚀 **Zero UI Freeze** - Web Worker-based parallel processing
- 📦 **Chunk-based Processing** - Handle datasets of any size
- 🔄 **Schema DSL** - Declarative data transformation
- 💾 **Tiered Caching** - L1 Memory + L2 IndexedDB
- ⚛️ **React Integration** - Hooks for React applications
- 🛡️ **Built-in Validation** - Strong DSL validators
- 📊 **Streaming Support** - Process data without loading all into memory

## Installation

```bash
# Core package
npm install @refyn/core

# React integration (optional)
npm install @refyn/react
```

## Quick Start

```typescript
import { createPipeline } from '@refyn/core';

// Define your schema
const schema = {
  id: 'meta.id',
  name: 'payload.name',
  email: { path: 'payload.contact.email', default: 'N/A' },
  createdAt: { path: 'meta.createdAt', cast: 'date' },
  displayName: {
    compute: {
      paths: ['payload.name', 'payload.title'],
      fn: 'template',
      template: '{0} ({1})',
    },
  },
};

// Create pipeline
const pipeline = createPipeline({ schema });

// Transform data
const result = await pipeline.execute(largeDataset);

console.log(result.data);           // Transformed rows
console.log(result.metrics);        // { totalTime, workerTime, rowCount }
console.log(result.hasErrors);      // false
```

## Schema DSL

### Path Resolution

```typescript
const schema = {
  // Simple path
  id: 'meta.id',

  // Nested path
  email: 'payload.contact.email',

  // Array index
  firstItem: 'payload.items[0].name',
};
```

### Type Casting

```typescript
const schema = {
  createdAt: { path: 'created_at', cast: 'date' },
  count: { path: 'count', cast: 'number' },
  isActive: { path: 'active', cast: 'boolean' },
  bigId: { path: 'id', cast: 'bigint' },
};
```

### Computed Fields

```typescript
const schema = {
  // Concatenate strings
  fullName: {
    compute: {
      paths: ['firstName', 'lastName'],
      fn: 'concat',
      separator: ' ',
    },
  },

  // Sum numbers
  total: {
    compute: {
      paths: ['price', 'tax'],
      fn: 'sum',
    },
  },

  // Template string
  displayName: {
    compute: {
      paths: ['name', 'title'],
      fn: 'template',
      template: '{0} - {1}',
    },
  },

  // First non-null value
  email: {
    compute: {
      paths: ['email', 'alternateEmail', 'contactEmail'],
      fn: 'coalesce',
    },
  },
};
```

## Dynamic Schema

```typescript
// Pipeline without default schema
const pipeline = createPipeline({
  config: { worker: { count: 4 } }
});

// Pass schema per execution
const users = await pipeline.execute(userData, userSchema);
const products = await pipeline.execute(productData, productSchema);
```

## Validation

### Built-in Validators

```typescript
import { rule, createValidator } from '@refyn/core';

const validator = createValidator({
  email: rule().required().email().build(),
  age: rule().required().number().min(0).max(120).build(),
  status: rule().enum(['active', 'inactive']).build(),
});

pipeline.setValidator(validator);
```

### Zod Integration

```typescript
import { z } from 'zod';

const zodSchema = z.object({
  email: z.string().email(),
  age: z.number().min(0),
});

pipeline.setValidator((row) => {
  const result = zodSchema.safeParse(row);
  return {
    valid: result.success,
    errors: !result.success
      ? result.error.errors.map(e => e.message)
      : undefined,
  };
});
```

## Caching

### Memory Cache (L1)

```typescript
import { MemoryCache } from '@refyn/core';

const cache = new MemoryCache(100, 5 * 60 * 1000); // 100 entries, 5 min TTL
cache.set('users', transformedData);
const data = cache.get('users');
```

### IndexedDB Cache (L2)

```typescript
import { IndexedDBCache } from '@refyn/core';

const cache = new IndexedDBCache({
  dbName: 'my-app-cache',
  ttl: 24 * 60 * 60 * 1000, // 24 hours
});

await cache.init();
await cache.set('users', transformedData);
const data = await cache.get('users');
```

### Tiered Cache Manager

```typescript
import { createCacheManager } from '@refyn/core';

const cache = createCacheManager({
  l1: { maxSize: 100, ttl: 300000 },
  l2: { dbName: 'refyn-cache', ttl: 86400000 },
});

await cache.initL2();

// Automatically uses L1 first, falls back to L2
const data = await cache.get('users');
```

## Streaming

```typescript
import { streamFromFetch, createStream, processStream } from '@refyn/core';

// Stream from NDJSON endpoint
const source = streamFromFetch('/api/users/stream');
const stream = createStream(source, schema, { chunkSize: 500 });

// Process chunks as they arrive
await processStream(stream, (chunk, index) => {
  console.log(`Processed chunk ${index}: ${chunk.length} rows`);
  updateUI(chunk);
});
```

## React Integration

```tsx
import { RefynProvider, useTransform, useCachedTransform } from '@refyn/react';

// Wrap your app
function App() {
  return (
    <RefynProvider config={{ schema, workerUrl }}>
      <UserList />
    </RefynProvider>
  );
}

// Use in components
function UserList() {
  const { data, isLoading, execute, metrics } = useTransform({
    pipeline: useRefyn().pipeline,
    schema: userSchema,
  });

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => execute(data));
  }, []);

  if (isLoading) return <Spinner />;

  return (
    <div>
      <p>Processed {metrics?.rowCount} rows in {metrics?.totalTime}ms</p>
      {data?.map(user => <UserCard key={user.id} user={user} />)}
    </div>
  );
}
```

## Configuration

```typescript
const pipeline = createPipeline({
  schema,
  workerUrl: new URL('./worker.js', import.meta.url),
  config: {
    worker: {
      count: 'auto',        // 'auto' | number
      maxCount: 8,
      autoRespawn: true,
    },
    transform: {
      chunkSize: 4000,
      errorMode: 'soft',    // 'soft' | 'strict'
      retryCount: 1,
      chunkTimeout: 30000,
    },
    cache: {
      enabled: true,
      maxSize: 100,
      ttl: 300000,
    },
  },
});
```

## Performance

Tested with 10,000 rows (5.25MB JSON):

| Metric | Value |
|--------|-------|
| Total Time | ~70ms |
| Main Thread Block | **0ms** |
| Worker Time | ~100ms |
| Chunks | 3 |
| Memory Delta | ~8MB |

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 15+
- Edge 90+

## Contributing

We welcome contributions! Please read `CONTRIBUTING.md` and follow `CODE_OF_CONDUCT.md` before opening issues or pull requests. Use the issue and PR templates in `.github/ISSUE_TEMPLATE` and `.github/PULL_REQUEST_TEMPLATE` to speed up review.

To run the test and lint suite locally: `pnpm install && pnpm test && pnpm lint`.

## License

MIT © Erdem Arslan — see `LICENSE` for details.
