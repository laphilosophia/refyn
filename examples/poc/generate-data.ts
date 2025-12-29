/**
 * Generate large test datasets for benchmarking
 * Usage: node --experimental-strip-types generate-data.ts [rowCount]
 */

import { readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourceFile = resolve(__dirname, 'data.json');
const targetFile = resolve(__dirname, 'large-data.json');

// Target row count from CLI or default
const targetRows = parseInt(process.argv[2] || '10000', 10);

console.log(`Generating ${targetRows.toLocaleString()} rows...`);

// Read source data
const sourceData = JSON.parse(readFileSync(sourceFile, 'utf-8'));
const sourceList = sourceData.ConceptList as Record<string, unknown>[];

console.log(`Source has ${sourceList.length} rows`);

// Generate large dataset by multiplying and adding variations
const largeList: Record<string, unknown>[] = [];
let index = 0;

while (largeList.length < targetRows) {
  for (const item of sourceList) {
    if (largeList.length >= targetRows) break;

    // Clone and add variation
    const clone = { ...item };
    clone.ConceptId = `gen-${index.toString(16).padStart(8, '0')}-${Date.now().toString(36)}`;
    clone.Title = `${item.Title} #${index + 1}`;
    clone.Description = item.Description
      ? `${item.Description} (Copy ${index + 1})`
      : `Generated row ${index + 1}`;

    // Randomize some boolean flags
    if (Math.random() > 0.7) clone.IsActivity = !clone.IsActivity;
    if (Math.random() > 0.8) clone.IsParty = !clone.IsParty;
    if (Math.random() > 0.6) clone.NeedOwnership = !clone.NeedOwnership;

    largeList.push(clone);
    index++;
  }
}

// Write output
const output = { ConceptList: largeList };
const jsonString = JSON.stringify(output);

writeFileSync(targetFile, jsonString);

const sizeKB = (Buffer.byteLength(jsonString) / 1024).toFixed(1);
const sizeMB = (Buffer.byteLength(jsonString) / 1024 / 1024).toFixed(2);

console.log(`✅ Generated ${largeList.length.toLocaleString()} rows`);
console.log(`📁 Output: ${targetFile}`);
console.log(`📊 Size: ${sizeKB}KB (${sizeMB}MB)`);
