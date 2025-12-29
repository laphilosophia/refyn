import * as esbuild from 'esbuild';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isWatch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const sharedConfig = {
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  format: 'esm',
  sourcemap: true,
  minify: false,
  external: Object.keys(pkg.dependencies ?? {}),
};

// Main entry
const mainBuild = esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
});

// Worker entry (separate bundle, no externals)
const workerBuild = esbuild.build({
  ...sharedConfig,
  entryPoints: ['src/worker/transform.worker.ts'],
  outfile: 'dist/worker/transform.worker.js',
  external: [], // Workers need to be self-contained
});

if (isWatch) {
  const ctx1 = await esbuild.context({
    ...sharedConfig,
    entryPoints: ['src/index.ts'],
    outfile: 'dist/index.js',
  });
  const ctx2 = await esbuild.context({
    ...sharedConfig,
    entryPoints: ['src/worker/transform.worker.ts'],
    outfile: 'dist/worker/transform.worker.js',
    external: [],
  });
  await Promise.all([ctx1.watch(), ctx2.watch()]);
  console.log('Watching for changes...');
} else {
  await Promise.all([mainBuild, workerBuild]);
  console.log('Build complete');
}
