// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
/* eslint-disable no-console */

import { execSync } from 'child_process';
import { tmpdir } from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { createHash, randomUUID } from 'crypto';
import { zipSync } from './zipSync';
import { NoOpTerminalProvider, Terminal } from '@rushstack/terminal';

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
// Allow specifying iterations via env BENCH_ITERATIONS or command arg --iterations N (jest passes args; we scan process.argv)
function detectIterations(): number {
  let iter = 1;
  const envParsed: number = parseInt(process.env.BENCH_ITERATIONS || '', 10);
  if (!isNaN(envParsed) && envParsed > 0) {
    iter = envParsed;
  }
  return iter || 5;
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
      const { filesPacked } = zipSync({
        mode: 'pack',
        archivePath: archive,
        targetDirectories: ['subdir1', 'subdir2'],
        baseDir: demoDir,
        compression,
        terminal
      });
      console.log(`Files packed: ${filesPacked}`);
    },
    unpack: ({ archive, unpackDir }) => {
      const { filesDeleted, filesExtracted, filesSkipped, foldersDeleted, otherEntriesDeleted } = zipSync({
        mode: 'unpack',
        archivePath: archive,
        targetDirectories: ['subdir1', 'subdir2'],
        baseDir: unpackDir,
        compression,
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
describe.skip(`archive benchmarks (iterations=${ITERATIONS})`, () => {
  it('tar', () => {
    if (!isTarAvailable()) {
      console.log('Skipping tar test because tar is not available');
      return;
    }
    if (!tempDir) throw new Error('Temp directory is not set up.');
    bench('tar', {
      pack: ({ archive, demoDir }) => execSync(`tar -cf "${archive}" -C "${demoDir}" .`),
      unpack: ({ archive, unpackDir }) => execSync(`tar -xf "${archive}" -C "${unpackDir}"`),
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
  interface ITableRow {
    group: string;
    isBaseline: boolean;
    s: IStats;
    deltaMeanPct: number;
  }
  const tableRows: ITableRow[] = [];
  for (const g of groupsDef) {
    const baselinePack: IStats | undefined = stats.find((s) => s.kind === g.baseline && s.phase === 'pack');
    const baselineUnpack: IStats | undefined = stats.find(
      (s) => s.kind === g.baseline && s.phase === 'unpack'
    );
    for (const member of g.members) {
      for (const phase of ['pack', 'unpack'] as const) {
        const s = stats.find((st) => st.kind === member && st.phase === phase);
        if (!s) continue;
        const baseline = phase === 'pack' ? baselinePack : baselineUnpack;
        const deltaMeanPct = baseline ? ((s.mean - baseline.mean) / baseline.mean) * 100 : 0;
        tableRows.push({ group: g.title, isBaseline: member === g.baseline, s, deltaMeanPct });
      }
    }
  }

  function buildTable(rowsData: ITableRow[], phaseFilter: 'pack' | 'unpack'): string[] {
    const headers =
      phaseFilter === 'pack'
        ? [
            'Group',
            'Archive',
            'iter',
            'min(ms)',
            'mean(ms)',
            'Δmean%',
            'p95(ms)',
            'max(ms)',
            'std(ms)',
            'size(bytes)'
          ]
        : ['Group', 'Archive', 'iter', 'min(ms)', 'mean(ms)', 'Δmean%', 'p95(ms)', 'max(ms)', 'std(ms)'];
    const rows: string[][] = [headers];
    for (const row of rowsData.filter((r) => r.s.phase === phaseFilter)) {
      const baseCols = [
        row.isBaseline ? row.group : '',
        row.s.kind + (row.isBaseline ? '*' : ''),
        String(row.s.n),
        row.s.min.toFixed(2),
        row.s.mean.toFixed(2),
        (row.deltaMeanPct >= 0 ? '+' : '') + row.deltaMeanPct.toFixed(1),
        row.s.p95.toFixed(2),
        row.s.max.toFixed(2),
        row.s.std.toFixed(2)
      ];
      if (phaseFilter === 'pack') {
        baseCols.push(row.s.sizeMean !== undefined ? Math.round(row.s.sizeMean).toString() : '');
      }
      rows.push(baseCols);
    }
    const colWidths: number[] = headers.map((header, i) =>
      rows.reduce((w, r) => Math.max(w, r[i].length), 0)
    );
    return rows.map((r) => r.map((c, i) => c.padStart(colWidths[i], ' ')).join('  '));
  }
  const packTable: string[] = buildTable(tableRows, 'pack');
  const unpackTable: string[] = buildTable(tableRows, 'unpack');
  const outputLines: string[] = [];
  outputLines.push('\nBenchmark Results (iterations=' + ITERATIONS + '):');
  outputLines.push('PACK PHASE:');
  outputLines.push(packTable[0]);
  outputLines.push('-'.repeat(packTable[0].length));
  for (let i = 1; i < packTable.length; i++) outputLines.push(packTable[i]);
  outputLines.push('* baseline (pack)');
  outputLines.push('');
  outputLines.push('UNPACK PHASE:');
  outputLines.push(unpackTable[0]);
  outputLines.push('-'.repeat(unpackTable[0].length));
  for (let i = 1; i < unpackTable.length; i++) outputLines.push(unpackTable[i]);
  outputLines.push('* baseline (unpack)');
  const resultText = outputLines.join('\n');
  console.log(resultText);
  try {
    const resultFile = path.join(__dirname, '..', 'temp', `benchmark-results.txt`);
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
    const checkTar = process.platform === 'win32' ? 'where tar' : 'command -v tar';
    execSync(checkTar, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
