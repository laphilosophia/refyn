import { createPipeline, type Schema } from '@refyn/core';

// Import worker URL for Vite (using relative path)
import TransformWorkerUrl from '../../packages/core/src/worker/transform.worker.ts?worker&url';

// Define schema for transforming the test data
const schema: Schema = {
  id: 'ConceptId',
  name: 'SystemName',
  title: 'Title',
  description: { path: 'Description', nullable: true, default: '' },
  primaryField: 'PrimaryTextField',
  // Computed field example - combines SystemName and Title
  displayName: {
    compute: {
      paths: ['SystemName', 'Title'],
      fn: 'template',
      template: '{0} ({1})',
    },
  },
  flags: {
    isActivity: 'IsActivity',
    isParty: 'IsParty',
    needsOwnership: 'NeedOwnership',
    needsBusinessProcess: 'NeedBusinessProcess',
    isApprovalEnabled: 'IsApprovalEnabled',
    isQuickCreate: 'IsQuickCreate',
    bySystem: 'BySystem',
    queueOption: 'QueueOption',
  },
  meta: {
    relatedWithActivity: 'RelatedWithActivity',
    isExcludedFromDocumentTemplate: 'IsExcludedFromDocumentTemplate',
    isExcludedFromLabel: 'IsExcludedFromLabel',
    isExcludedFromBulkEdit: 'IsExcludedFromBulkEdit',
    isNoteDocEnabled: 'IsNoteDocEnabled',
    isMultiLookupReference: 'IsMultiLookupReference',
  },
};

// Display schema in UI
const schemaPreview = document.getElementById('schemaPreview')!;
schemaPreview.textContent = JSON.stringify(schema, null, 2);

// Get UI elements
const runBtn = document.getElementById('runBtn') as HTMLButtonElement;
const statusEl = document.getElementById('status')!;
const totalTimeEl = document.getElementById('totalTime')!;
const workerTimeEl = document.getElementById('workerTime')!;
const mainBlockEl = document.getElementById('mainBlock')!;
const rowCountEl = document.getElementById('rowCount')!;
const chunkCountEl = document.getElementById('chunkCount')!;
const memoryDeltaEl = document.getElementById('memoryDelta')!;
const previewEl = document.getElementById('preview')!;

// Create pipeline with worker URL
const pipeline = createPipeline({
  schema,
  chunkSize: 4000,
  workerCount: navigator.hardwareConcurrency || 4,
  errorMode: 'soft',
  workerUrl: TransformWorkerUrl,
});

async function runTransform() {
  runBtn.disabled = true;
  statusEl.style.display = 'block';
  statusEl.className = 'status running';
  statusEl.textContent = '⏳ Loading data...';

  try {
    // Measure memory before
    const memBefore = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;

    // Check URL param for data source (default: large)
    const params = new URLSearchParams(window.location.search);
    const dataSource = params.get('data') || 'large';
    const dataUrl = dataSource === 'small' ? '/examples/poc/data.json' : '/examples/poc/large-data.json';

    statusEl.textContent = `⏳ Loading ${dataSource} dataset...`;

    // Load test data
    const response = await fetch(dataUrl);
    const rawData = await response.json();

    // Extract the array (handle both direct array and wrapped object)
    const dataArray = Array.isArray(rawData)
      ? rawData
      : rawData.ConceptList ?? Object.values(rawData)[0] ?? [];

    statusEl.textContent = `⏳ Transforming ${dataArray.length} rows...`;

    // Measure main thread blocking
    const longTaskEntries: PerformanceEntry[] = [];
    const observer = new PerformanceObserver((list) => {
      longTaskEntries.push(...list.getEntries());
    });

    try {
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // longtask not supported in all browsers
    }

    // Execute transform
    const result = await pipeline.execute<Record<string, unknown>[]>(dataArray);

    observer.disconnect();

    // Measure memory after
    const memAfter = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;

    // Calculate main thread block time
    const mainBlockTime = longTaskEntries.reduce((sum, entry) => sum + entry.duration, 0);

    // Update metrics
    totalTimeEl.textContent = `${result.metrics.totalTime.toFixed(2)}ms`;
    workerTimeEl.textContent = `${result.metrics.workerTime.toFixed(2)}ms`;

    mainBlockEl.textContent = `${mainBlockTime.toFixed(0)}ms`;
    mainBlockEl.className = mainBlockTime === 0 ? 'metric-value success' : 'metric-value warning';

    rowCountEl.textContent = result.metrics.rowCount.toLocaleString();
    chunkCountEl.textContent = result.metrics.chunkCount.toString();

    const memDelta = (memAfter - memBefore) / 1024 / 1024;
    memoryDeltaEl.textContent = `${memDelta.toFixed(2)}MB`;
    memoryDeltaEl.className = memDelta < 10 ? 'metric-value success' : 'metric-value warning';

    // Render preview table
    const previewData = result.data.slice(0, 10);
    renderPreviewTable(previewData);

    statusEl.className = 'status complete';
    statusEl.textContent = `✅ Transform complete! Processed ${result.metrics.rowCount} rows in ${result.metrics.totalTime.toFixed(2)}ms`;

  } catch (error) {
    statusEl.className = 'status';
    statusEl.style.background = 'rgba(239, 68, 68, 0.1)';
    statusEl.style.color = '#ef4444';
    statusEl.textContent = `❌ Error: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    runBtn.disabled = false;
  }
}

function renderPreviewTable(data: Record<string, unknown>[]) {
  if (data.length === 0) {
    previewEl.innerHTML = '<p style="color: var(--text-dim);">No data</p>';
    return;
  }

  // Include displayName (computed field) in headers
  const headers = ['id', 'name', 'displayName', 'isActivity', 'isParty'];

  let html = '<table><thead><tr>';
  for (const h of headers) {
    html += `<th>${h}</th>`;
  }
  html += '</tr></thead><tbody>';

  for (const row of data) {
    html += '<tr>';
    for (const h of headers) {
      let value: unknown;
      if (h === 'isActivity' || h === 'isParty') {
        value = (row.flags as Record<string, unknown>)?.[h];
      } else {
        value = row[h];
      }
      html += `<td>${value ?? '—'}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  previewEl.innerHTML = html;
}

// Wire up button
runBtn.addEventListener('click', runTransform);

// Init pipeline on load
pipeline.init().catch(console.error);
