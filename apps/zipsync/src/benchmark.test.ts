// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
/* eslint-disable no-console */

import { execSync } from 'child_process';
import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createHash, randomUUID } from 'crypto';

import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';

import { pack } from './pack';
import { unpack } from './unpack';

// create a tempdir and setup dummy files there for benchmarking
let tempDir: string;
const runId = randomUUID();
async function setupDemoDataAsync(): Promise<void> {
  console.log('Setting up demo data for benchmark...');
  tempDir = path.join(tmpdir(), `zipsync-benchmark-${runId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  const demoSubDir1 = path.join(tempDir, 'demo-data', 'subdir1');
  fs.mkdirSync(demoSubDir1, { recursive: true });
  const demoSubDir2 = path.join(tempDir, 'demo-data', 'subdir2');
  fs.mkdirSync(demoSubDir2, { recursive: true });

  for (let i = 0; i < 1000; i++) {
    const filePath1 = path.join(demoSubDir1, `file${i}.txt`);
    fs.writeFileSync(filePath1, `This is file ${i} in subdir1\n`.repeat(1000), { encoding: 'utf-8' });
    const filePath2 = path.join(demoSubDir2, `file${i}.txt`);
    fs.writeFileSync(filePath2, `This is file ${i} in subdir2\n`.repeat(1000), { encoding: 'utf-8' });
  }

  console.log(`Demo data setup complete in ${tempDir}`);
}

async function cleanupDemoDataAsync(): Promise<void> {
  if (tempDir && fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    console.log(`Cleaned up temp directory: ${tempDir}`);
  }
}

beforeAll(async () => {
  await setupDemoDataAsync();
});

afterAll(async () => {
  await cleanupDemoDataAsync();
});

// Collect timings for table output after all tests
interface IMeasurement {
  name: string;
  kind: string;
  phase: 'pack' | 'unpack';
  ms: number;
  // Only for pack phase: archive size in bytes and compression ratio (archiveSize / uncompressedSourceSize)
  sizeBytes?: number;
}
const measurements: IMeasurement[] = [];
// Allow specifying iterations via env BENCH_ITERATIONS. Defaults to 0 to avoid running the benchmark unless explicitly enabled.
function detectIterations(): number {
  let iter = 0;
  const envParsed: number = parseInt(process.env.BENCH_ITERATIONS || '', 10);
  if (!isNaN(envParsed) && envParsed > 0) {
    iter = envParsed;
  }
  return iter;
}
const ITERATIONS: number = detectIterations();

function measureFn(callback: () => void): number {
  const start: number = performance.now();
  callback();
  return performance.now() - start;
}

interface IBenchContext {
  archive: string;
  demoDir: string; // source demo data directory
  unpackDir: string;
}

interface IBenchCommands {
  // Function that performs the packing. Receives archive path and demoDir.
  pack: (ctx: IBenchContext) => void;
  // Function that performs the unpack. Receives archive and unpackDir.
  unpack: (ctx: IBenchContext) => void;
  archive: string;
  unpackDir: string;
  populateUnpackDir?: 'full' | 'partial';
  cleanBeforeUnpack?: boolean;
}

function bench(kind: string, commands: IBenchCommands): void {
  const demoDataPath = path.join(tempDir, 'demo-data');
  const srcDir = demoDataPath;
  // Compute total uncompressed source size once per bench invocation
  // We intentionally no longer compute total source size for ratio; only archive size is tracked.
  function verifyUnpack(unpackDir: string): void {
    // Compare file listings and hashes
    function buildMap(root: string): Map<string, { size: number; hash: string }> {
      const map = new Map<string, { size: number; hash: string }>();
      function walk(current: string): void {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (entry.isFile()) {
            const rel = path.relative(root, full).replace(/\\/g, '/');
            const buf = fs.readFileSync(full);
            const hash = createHash('sha256').update(buf).digest('hex');
            map.set(rel, { size: buf.length, hash });
          }
        }
      }
      walk(root);
      return map;
    }
    const srcMap = buildMap(srcDir);
    const dstMap = buildMap(unpackDir);
    if (srcMap.size !== dstMap.size) {
      throw new Error(
        `Verification failed (${kind}): file count mismatch src=${srcMap.size} dst=${dstMap.size}`
      );
    }
    for (const [rel, meta] of srcMap) {
      const other = dstMap.get(rel);
      if (!other) throw new Error(`Verification failed (${kind}): missing file ${rel}`);
      if (other.size !== meta.size || other.hash !== meta.hash) {
        throw new Error(`Verification failed (${kind}): content mismatch in ${rel}`);
      }
    }
  }
  for (let i = 0; i < ITERATIONS; i++) {
    // Ensure previous artifacts removed
    if (fs.existsSync(commands.archive)) fs.rmSync(commands.archive, { force: true });
    if (fs.existsSync(commands.unpackDir)) fs.rmSync(commands.unpackDir, { recursive: true, force: true });
    fs.mkdirSync(commands.unpackDir, { recursive: true });
    if (commands.populateUnpackDir === 'full') {
      fs.cpSync(srcDir, commands.unpackDir, { recursive: true });
    } else if (commands.populateUnpackDir === 'partial') {
      // Copy half the files
      for (let j = 0; j < 500; j++) {
        const file1 = path.join(srcDir, 'subdir1', `file${j}.txt`);
        const file2 = path.join(srcDir, 'subdir2', `file${j}.txt`);
        const dest1 = path.join(commands.unpackDir, 'subdir1', `file${j}.txt`);
        const dest2 = path.join(commands.unpackDir, 'subdir2', `file${j}.txt`);
        fs.mkdirSync(path.dirname(dest1), { recursive: true });
        fs.mkdirSync(path.dirname(dest2), { recursive: true });
        fs.copyFileSync(file1, dest1);
        fs.copyFileSync(file2, dest2);
      }
    }

    let archiveSize: number | undefined;
    const packMs: number = measureFn(() => {
      commands.pack({ archive: commands.archive, demoDir: demoDataPath, unpackDir: commands.unpackDir });
      try {
        const stat = fs.statSync(commands.archive);
        archiveSize = stat.size;
      } catch {
        // ignore if archive not found
      }
    });
    measurements.push({
      name: `${kind}#${i + 1}`,
      kind,
      phase: 'pack',
      ms: packMs,
      sizeBytes: archiveSize
    });

    const unpackMs: number = measureFn(() => {
      if (commands.cleanBeforeUnpack) {
        fs.rmSync(commands.unpackDir, { recursive: true, force: true });
        fs.mkdirSync(commands.unpackDir, { recursive: true });
      }
      commands.unpack({ archive: commands.archive, demoDir: demoDataPath, unpackDir: commands.unpackDir });
    });
    measurements.push({ name: `${kind}#${i + 1}`, kind, phase: 'unpack', ms: unpackMs });
    verifyUnpack(commands.unpackDir);
  }
}

function benchZipSyncScenario(
  kind: string,
  compression: 'store' | 'deflate' | 'auto',
  existingFiles: 'all' | 'none' | 'partial'
): void {
  if (!tempDir) throw new Error('Temp directory is not set up.');
  const terminal = new Terminal(new NoOpTerminalProvider());
  bench(kind, {
    pack: ({ archive, demoDir }) => {
      const { filesPacked } = pack({
        archivePath: archive,
        targetDirectories: ['subdir1', 'subdir2'],
        baseDir: demoDir,
        compression,
        terminal
      });
      console.log(`Files packed: ${filesPacked}`);
    },
    unpack: ({ archive, unpackDir }) => {
      const { filesDeleted, filesExtracted, filesSkipped, foldersDeleted, otherEntriesDeleted } = unpack({
        archivePath: archive,
        targetDirectories: ['subdir1', 'subdir2'],
        baseDir: unpackDir,
        terminal
      });
      console.log(
        `Files extracted: ${filesExtracted}, files skipped: ${filesSkipped}, files deleted: ${filesDeleted}, folders deleted: ${foldersDeleted}, other entries deleted: ${otherEntriesDeleted}`
      );
    },
    archive: path.join(tempDir, `archive-zipsync-${compression}.zip`),
    unpackDir: path.join(tempDir, `unpacked-zipsync-${compression}-${existingFiles}`),
    populateUnpackDir: existingFiles === 'all' ? 'full' : existingFiles === 'partial' ? 'partial' : undefined,
    cleanBeforeUnpack: false
  });
}

// the benchmarks are skipped by default because they require external tools (tar, zip) to be installed
describe(`archive benchmarks (iterations=${ITERATIONS})`, () => {
  it('gtar', () => {
    if (!isTarAvailable()) {
      console.log('Skipping tar test because tar is not available');
      return;
    }
    if (!tempDir) throw new Error('Temp directory is not set up.');
    bench('gtar', {
      pack: ({ archive, demoDir }) => execSync(`gtar -cf "${archive}" -C "${demoDir}" .`),
      unpack: ({ archive, unpackDir }) => execSync(`gtar -xf "${archive}" -C "${unpackDir}"`),
      archive: path.join(tempDir, 'archive.tar'),
      unpackDir: path.join(tempDir, 'unpacked-tar'),
      populateUnpackDir: 'full',
      cleanBeforeUnpack: true
    });
  });
  it('tar.gz', () => {
    if (!isTarAvailable()) {
      console.log('Skipping tar test because tar is not available');
      return;
    }
    if (!tempDir) throw new Error('Temp directory is not set up.');
    bench('tar.gz', {
      pack: ({ archive, demoDir }) => execSync(`tar -czf "${archive}" -C "${demoDir}" .`),
      unpack: ({ archive, unpackDir }) => execSync(`tar -xzf "${archive}" -C "${unpackDir}"`),
      archive: path.join(tempDir, 'archive.tar.gz'),
      unpackDir: path.join(tempDir, 'unpacked-tar-gz'),
      populateUnpackDir: 'full',
      cleanBeforeUnpack: true
    });
  });
  it('zip-store', () => {
    if (!isZipAvailable()) {
      console.log('Skipping zip test because zip is not available');
      return;
    }
    if (!tempDir) throw new Error('Temp directory is not set up.');
    bench('zip-store', {
      pack: ({ archive, demoDir }) => execSync(`zip -r -Z store "${archive}" .`, { cwd: demoDir }),
      unpack: ({ archive, unpackDir }) => execSync(`unzip "${archive}" -d "${unpackDir}"`),
      archive: path.join(tempDir, 'archive.zip'),
      unpackDir: path.join(tempDir, 'unpacked-zip'),
      populateUnpackDir: 'full',
      cleanBeforeUnpack: true
    });
  });
  it('zip-deflate', () => {
    if (!isZipAvailable()) {
      console.log('Skipping zip test because zip is not available');
      return;
    }
    if (!tempDir) throw new Error('Temp directory is not set up.');
    bench('zip-deflate', {
      pack: ({ archive, demoDir }) => execSync(`zip -r -Z deflate -9 "${archive}" .`, { cwd: demoDir }),
      unpack: ({ archive, unpackDir }) => execSync(`unzip "${archive}" -d "${unpackDir}"`),
      archive: path.join(tempDir, 'archive-deflate.zip'),
      unpackDir: path.join(tempDir, 'unpacked-zip-deflate'),
      populateUnpackDir: 'full',
      cleanBeforeUnpack: true
    });
  });
  it('zipsync-store-all-existing', () => {
    benchZipSyncScenario('zipsync-store-all-existing', 'store', 'all');
  });
  it('zipsync-store-none-existing', () => {
    benchZipSyncScenario('zipsync-store-none-existing', 'store', 'none');
  });
  it('zipsync-store-partial-existing', () => {
    benchZipSyncScenario('zipsync-store-partial-existing', 'store', 'partial');
  });
  it('zipsync-deflate-all-existing', () => {
    benchZipSyncScenario('zipsync-deflate-all-existing', 'deflate', 'all');
  });
  it('zipsync-deflate-none-existing', () => {
    benchZipSyncScenario('zipsync-deflate-none-existing', 'deflate', 'none');
  });
  it('zipsync-deflate-partial-existing', () => {
    benchZipSyncScenario('zipsync-deflate-partial-existing', 'deflate', 'partial');
  });
  it('zipsync-auto-all-existing', () => {
    benchZipSyncScenario('zipsync-auto-all-existing', 'auto', 'all');
  });
  it('zipsync-auto-none-existing', () => {
    benchZipSyncScenario('zipsync-auto-none-existing', 'auto', 'none');
  });
  it('zipsync-auto-partial-existing', () => {
    benchZipSyncScenario('zipsync-auto-partial-existing', 'auto', 'partial');
  });
});

afterAll(() => {
  if (!measurements.length) return;
  interface IStats {
    kind: string;
    phase: string;
    n: number;
    min: number;
    max: number;
    mean: number;
    p95: number;
    std: number;
    sizeMean?: number; // only for pack
  }
  const groups: Map<string, { times: number[]; sizes: number[] }> = new Map();
  for (const m of measurements) {
    const key: string = `${m.kind}|${m.phase}`;
    let bucket = groups.get(key);
    if (!bucket) {
      bucket = { times: [], sizes: [] };
      groups.set(key, bucket);
    }
    bucket.times.push(m.ms);
    if (typeof m.sizeBytes === 'number') bucket.sizes.push(m.sizeBytes);
  }
  const stats: IStats[] = [];
  function percentile(sorted: number[], p: number): number {
    if (!sorted.length) return 0;
    const idx: number = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[idx];
  }
  for (const [key, bucket] of groups) {
    const [kind, phase] = key.split('|');
    bucket.times.sort((a, b) => a - b);
    const arr = bucket.times;
    const n = arr.length;
    const min = arr[0];
    const max = arr[n - 1];
    const sum = arr.reduce((a, b) => a + b, 0);
    const mean = sum / n;
    const variance = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
    const std = Math.sqrt(variance);
    const p95 = percentile(arr, 95);
    const sizeMean = bucket.sizes.length
      ? bucket.sizes.reduce((a, b) => a + b, 0) / bucket.sizes.length
      : undefined;
    stats.push({ kind, phase, n, min, max, mean, std, p95, sizeMean });
  }
  // Organize into groups
  const groupsDef: Array<{ title: string; baseline: string; members: string[] }> = [
    {
      title: 'Uncompressed (baseline: tar)',
      baseline: 'tar',
      members: [
        'tar',
        'zip-store',
        'zipsync-store-all-existing',
        'zipsync-store-none-existing',
        'zipsync-store-partial-existing'
      ]
    },
    {
      title: 'Compressed (baseline: tar.gz)',
      baseline: 'tar.gz',
      members: [
        'tar.gz',
        'zip-deflate',
        'zipsync-deflate-all-existing',
        'zipsync-deflate-none-existing',
        'zipsync-deflate-partial-existing',
        'zipsync-auto-all-existing',
        'zipsync-auto-none-existing',
        'zipsync-auto-partial-existing'
      ]
    }
  ];
  // Build per-group markdown tables (no Group column) for each phase
  function buildGroupTable(
    group: { title: string; baseline: string; members: string[] },
    phase: 'pack' | 'unpack'
  ): string[] {
    // Human readable bytes formatter
    function formatBytes(bytes: number): string {
      const units = ['B', 'KB', 'MB', 'GB'];
      let value = bytes;
      let i = 0;
      while (value >= 1024 && i < units.length - 1) {
        value /= 1024;
        i++;
      }
      const formatted = value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2);
      return `${formatted} ${units[i]}`;
    }
    const headers =
      phase === 'pack'
        ? ['Archive', 'min (ms)', 'mean (ms)', 'p95 (ms)', 'max (ms)', 'std (ms)', 'speed×', 'size']
        : ['Archive', 'min (ms)', 'mean (ms)', 'p95 (ms)', 'max (ms)', 'std (ms)', 'speed×'];
    const lines: string[] = [];
    lines.push('| ' + headers.join(' | ') + ' |');
    const align: string[] = headers.map((header, idx) => (idx === 0 ? '---' : '---:'));
    lines.push('| ' + align.join(' | ') + ' |');
    const baselineStats: IStats | undefined = stats.find(
      (s) => s.kind === group.baseline && s.phase === phase
    );
    for (const member of group.members) {
      const s: IStats | undefined = stats.find((st) => st.kind === member && st.phase === phase);
      if (!s) continue;
      const isBaseline: boolean = member === group.baseline;
      const speedFactor: number = baselineStats ? baselineStats.mean / s.mean : 1;
      const cols: string[] = [
        (isBaseline ? '**' : '') + s.kind + (isBaseline ? '**' : ''),
        s.min.toFixed(2),
        s.mean.toFixed(2),
        s.p95.toFixed(2),
        s.max.toFixed(2),
        s.std.toFixed(2),
        speedFactor.toFixed(2) + 'x'
      ];
      if (phase === 'pack') {
        cols.push(s.sizeMean !== undefined ? formatBytes(Math.round(s.sizeMean)) : '');
      }
      lines.push('| ' + cols.join(' | ') + ' |');
    }
    return lines;
  }
  const outputLines: string[] = [];
  outputLines.push('# Benchmark Results');
  outputLines.push('');
  outputLines.push(
    'This document contains performance measurements for packing and unpacking a synthetic dataset using traditional archive tools (tar, zip) and various zipsync modes. The dataset consists of two directory trees (subdir1, subdir2) populated with text files. Each scenario was executed multiple iterations; metrics shown are aggregated timing statistics. The speed× column shows how many times faster a scenario is compared to the baseline in that group (values >1 = faster, <1 = slower). Baseline rows are shown in bold.'
  );
  outputLines.push('');
  outputLines.push(`Iterations: ${ITERATIONS}`);
  outputLines.push('');
  for (const g of groupsDef) {
    outputLines.push(`## ${g.title}`);
    outputLines.push('');
    outputLines.push('### Pack Phase');
    outputLines.push('');
    outputLines.push(...buildGroupTable(g, 'pack'));
    outputLines.push('');
    outputLines.push('### Unpack Phase');
    outputLines.push('');
    outputLines.push(...buildGroupTable(g, 'unpack'));
    outputLines.push('');
  }
  const resultText = outputLines.join('\n');
  console.log(resultText);
  try {
    const resultFile = path.join(__dirname, '..', 'temp', `benchmark-results.md`);
    fs.writeFileSync(resultFile, resultText, { encoding: 'utf-8' });
    console.log(`Benchmark results written to: ${resultFile}`);
  } catch (e) {
    console.warn('Failed to write benchmark results file:', (e as Error).message);
  }
});
function isZipAvailable(): boolean {
  try {
    const checkZip = process.platform === 'win32' ? 'where zip' : 'command -v zip';
    const checkUnzip = process.platform === 'win32' ? 'where unzip' : 'command -v unzip';
    execSync(checkZip, { stdio: 'ignore' });
    execSync(checkUnzip, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
function isTarAvailable(): boolean {
  try {
    const checkTar = process.platform === 'win32' ? 'where gtar' : 'command -v gtar';
    execSync(checkTar, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
