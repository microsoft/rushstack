// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Benchmark harness for comparing zipsync against system tar and zip/unzip.
 *
 * Scenarios (pack & unpack):
 *  1. zipsync (store)
 *  2. zipsync (deflate)
 *  2a. zipsync (auto) - heuristic per-file compression
 *  3. zip (store -0)
 *  4. zip (deflate -9)
 *  5. tar (no compression)
 *  6. tar+gzip (gz compression)
 *
 * For each scenario we measure:
 *  - Pack time (wall clock)
 *  - Archive size (bytes)
 *  - Unpack time (wall clock)
 *  - Verification hash (simple combined SHA1 of file listing + sizes) to ensure integrity
 *
 * Usage:
 *   node lib/benchmark --data <datasetDir> [--iterations N] [--keep] [--verbose]
 *
 * Notes:
 *  - Dataset directory should be a stable tree of files (no node_modules if you want faster runs).
 *  - Iterations >1 will repeat each scenario and report min/avg/max.
 *  - Only commands found on PATH are executed; missing tools are skipped.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { zipSync } from './zip';
import { ConsoleTerminalProvider, Terminal } from '@rushstack/terminal';

interface IArgs {
  dataDir: string;
  iterations: number;
  keep: boolean;
  verbose: boolean;
  verify: boolean;
}

interface ITimingSample {
  packMs: number;
  unpackMs: number;
  size: number; // archive size in bytes
}

interface IScenarioResult {
  name: string;
  tool: string; // zipsync|zip|tar
  compression: string; // store|deflate|gzip|none
  archiveExt: string;
  available: boolean;
  samples: ITimingSample[];
  error?: string;
  verifyFailed?: boolean;
  verifySkipped?: boolean;
  prepopulate?: 'empty' | 'all' | 'partial'; // how to pre-populate target before unpack (zipsync only)
}

function parseArgs(): IArgs {
  const args: string[] = process.argv.slice(2);
  let dataDir: string | undefined;
  let iterations: number = 1;
  let keep: boolean = false;
  let verbose: boolean = false;
  let verify: boolean = true;
  for (let i: number = 0; i < args.length; i++) {
    const a: string = args[i];
    if (a === '--data') {
      dataDir = args[++i];
    } else if (a === '--iterations') {
      iterations = Number(args[++i]);
    } else if (a === '--keep') {
      keep = true;
    } else if (a === '--verbose') {
      verbose = true;
    } else if (a === '--no-verify') {
      verify = false;
    } else if (a === '--help' || a === '-h') {
      printHelpAndExit();
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelpAndExit(1);
    }
  }
  if (!dataDir) {
    console.error('Error: --data <datasetDir> is required');
    printHelpAndExit(1);
  }
  const resolved: string = path.resolve(dataDir);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.error(`Dataset directory not found: ${resolved}`);
    process.exit(1);
  }
  return { dataDir: resolved, iterations, keep, verbose, verify };
}

function printHelpAndExit(code: number = 0): never {
  console.log(`Benchmark zipsync vs tar/zip
Usage: node lib/benchmark --data <datasetDir> [--iterations N] [--keep] [--verbose] [--no-verify]

Options:
  --data <dir>       Dataset directory to benchmark
  --iterations N     Number of iterations (default 1)
  --keep             Keep temp artifacts (archives/unpack dirs)
  --verbose          Verbose logging for individual file operations
  --no-verify        Skip dataset hashing & post-unpack verification
`);
  process.exit(code);
}

function commandExists(cmd: string): boolean {
  const res: SpawnSyncReturns<Buffer> = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  if (res.error) {
    // try help fallback
    const res2: SpawnSyncReturns<Buffer> = spawnSync('which', [cmd], { stdio: 'ignore' });
    return !res2.error && res2.status === 0;
  }
  return res.status === 0;
}

function nowMs(): number {
  return Number(process.hrtime.bigint() / BigInt(1_000_000));
}

function copyDataset(srcDir: string, destDir: string): void {
  // Shallow copy using recursive cp (Node 16+)
  fs.cpSync(srcDir, destDir, { recursive: true, preserveTimestamps: true });
}

function hashTree(root: string): string {
  const files: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full: string = path.join(dir, entry.name);
      const rel: string = path.relative(root, full).replace(/\\/g, '/');
      if (entry.isFile()) {
        const stat: fs.Stats = fs.statSync(full);
        files.push(`${rel}:${stat.size}`);
      } else if (entry.isDirectory()) {
        walk(full);
      }
    }
  }
  walk(root);
  files.sort();
  return crypto.createHash('sha1').update(files.join('\n')).digest('hex');
}

function formatBytes(n: number): string {
  const units: string[] = ['B', 'KB', 'MB', 'GB'];
  let u: number = 0;
  let v: number = n;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return (u === 0 ? v.toString() : v.toFixed(2)) + ' ' + units[u];
}

function stats(values: number[]): { min: number; max: number; avg: number } {
  if (values.length === 0) return { min: 0, max: 0, avg: 0 };
  let min: number = values[0];
  let max: number = values[0];
  let sum: number = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return { min, max, avg: sum / values.length };
}

async function main(): Promise<void> {
  const args: IArgs = parseArgs();
  const terminal: Terminal = new Terminal(new ConsoleTerminalProvider({ verboseEnabled: args.verbose }));

  terminal.writeLine(`Dataset: ${args.dataDir}`);
  const datasetHash: string | undefined = args.verify ? hashTree(args.dataDir) : undefined;
  if (args.verify) {
    terminal.writeLine(`Dataset file hash: ${datasetHash}`);
  } else {
    terminal.writeLine('Verification disabled (--no-verify)');
  }

  const scenarios: IScenarioResult[] = [
    {
      name: 'zipsync-store',
      tool: 'zipsync',
      compression: 'store',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'empty'
    },
    {
      name: 'zipsync-deflate',
      tool: 'zipsync',
      compression: 'deflate',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'empty'
    },
    {
      name: 'zipsync-auto',
      tool: 'zipsync',
      compression: 'auto',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'empty'
    },
    {
      name: 'zipsync-store-existing-all',
      tool: 'zipsync',
      compression: 'store',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'all'
    },
    {
      name: 'zipsync-store-partial',
      tool: 'zipsync',
      compression: 'store',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'partial'
    },
    {
      name: 'zipsync-deflate-existing-all',
      tool: 'zipsync',
      compression: 'deflate',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'all'
    },
    {
      name: 'zipsync-deflate-partial',
      tool: 'zipsync',
      compression: 'deflate',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'partial'
    },
    {
      name: 'zipsync-auto-existing-all',
      tool: 'zipsync',
      compression: 'auto',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'all'
    },
    {
      name: 'zipsync-auto-partial',
      tool: 'zipsync',
      compression: 'auto',
      archiveExt: '.zipsync',
      available: true,
      samples: [],
      prepopulate: 'partial'
    },
    {
      name: 'zip-store',
      tool: 'zip',
      compression: 'store',
      archiveExt: '.zip',
      available: commandExists('zip'),
      samples: []
    },
    {
      name: 'zip-deflate',
      tool: 'zip',
      compression: 'deflate',
      archiveExt: '.zip',
      available: commandExists('zip'),
      samples: []
    },
    {
      name: 'tar',
      tool: 'tar',
      compression: 'none',
      archiveExt: '.tar',
      available: commandExists('tar'),
      samples: []
    },
    {
      name: 'tar-gzip',
      tool: 'tar',
      compression: 'gzip',
      archiveExt: '.tar.gz',
      available: commandExists('tar'),
      samples: []
    }
  ];

  const tmpRoot: string = fs.mkdtempSync(path.join(os.tmpdir(), 'zipsync-bench-'));
  terminal.writeLine(`Temp root: ${tmpRoot}`);

  // Copy dataset once per iteration (shared read-only source for all scenarios)
  for (let iter: number = 0; iter < args.iterations; iter++) {
    const iterSrcDir: string = path.join(tmpRoot, `src-${iter}`);
    fs.mkdirSync(iterSrcDir);
    copyDataset(args.dataDir, iterSrcDir);
    terminal.writeVerboseLine(`Iteration ${iter + 1}: dataset copied to ${iterSrcDir}`);

    // Build deterministic sorted file list for prepopulation operations
    const datasetFiles: string[] = [];
    const rootLen: number = iterSrcDir.length + 1;
    (function collect(dir: string): void {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full: string = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collect(full);
        } else if (entry.isFile()) {
          datasetFiles.push(full.substring(rootLen));
        }
      }
    })(iterSrcDir);
    datasetFiles.sort();

    for (const scenario of scenarios) {
      if (!scenario.available) {
        terminal.writeWarningLine(`Skipping ${scenario.name}: tool not available on PATH`);
        continue;
      }
      const iterLabel: string = `${scenario.name} (iter ${iter + 1}/${args.iterations})`;
      terminal.writeLine(`Running ${iterLabel}`);
      const workDir: string = iterSrcDir; // shared source directory
      const archivePath: string = path.join(
        tmpRoot,
        `${scenario.name}-archive-${iter}${scenario.archiveExt}`
      );

      // PACK
      const packStart: number = nowMs();
      try {
        if (scenario.tool === 'zipsync') {
          zipSync({
            terminal,
            mode: 'pack',
            archivePath,
            targetDirectory: workDir,
            compression:
              scenario.compression === 'deflate'
                ? 'deflate'
                : scenario.compression === 'auto'
                  ? 'auto'
                  : 'store'
          });
        } else if (scenario.tool === 'zip') {
          const levelFlag: string = scenario.compression === 'store' ? '-0' : '-9';
          const res: SpawnSyncReturns<Buffer> = spawnSync('zip', ['-rq', levelFlag, archivePath, '.'], {
            cwd: workDir
          });
          if (res.status !== 0) throw new Error(`zip failed: ${res.stderr?.toString()}`);
        } else if (scenario.tool === 'tar') {
          if (scenario.compression === 'gzip') {
            const res: SpawnSyncReturns<Buffer> = spawnSync('tar', ['-czf', archivePath, '.'], {
              cwd: workDir
            });
            if (res.status !== 0) throw new Error(`tar gzip failed`);
          } else {
            const res: SpawnSyncReturns<Buffer> = spawnSync('tar', ['-cf', archivePath, '.'], {
              cwd: workDir
            });
            if (res.status !== 0) throw new Error(`tar failed`);
          }
        }
      } catch (e) {
        scenario.error = (e as Error).message;
        terminal.writeErrorLine(`Error packing ${scenario.name}: ${scenario.error}`);
        continue; // go to next scenario; keep other scenarios running this iteration
      }
      const packEnd: number = nowMs();
      const size: number = fs.existsSync(archivePath) ? fs.statSync(archivePath).size : 0;

      // UNPACK
      const unpackDir: string = path.join(tmpRoot, `${scenario.name}-dst-${iter}`);
      fs.mkdirSync(unpackDir);
      // Prepopulate target for zipsync variants if requested
      if (scenario.tool === 'zipsync' && scenario.prepopulate && scenario.prepopulate !== 'empty') {
        if (scenario.prepopulate === 'all') {
          fs.cpSync(iterSrcDir, unpackDir, { recursive: true, preserveTimestamps: true });
        } else if (scenario.prepopulate === 'partial') {
          const total: number = datasetFiles.length;
          if (total < 4) {
            // Fallback: copy all if dataset too small for meaningful partition
            fs.cpSync(iterSrcDir, unpackDir, { recursive: true, preserveTimestamps: true });
          } else {
            const unchangedCount: number = Math.floor(total * 0.5);
            const modifiedCount: number = Math.floor(total * 0.25);
            const missingCount: number = Math.min(
              Math.floor(total * 0.25),
              total - unchangedCount - modifiedCount
            );
            const unchangedFiles: string[] = datasetFiles.slice(0, unchangedCount);
            const modifiedFiles: string[] = datasetFiles.slice(
              unchangedCount,
              unchangedCount + modifiedCount
            );
            // Remaining files (after unchanged+modified) are implicitly missing

            // Copy unchanged files verbatim
            for (const rel of unchangedFiles) {
              const srcFile: string = path.join(iterSrcDir, rel);
              const dstFile: string = path.join(unpackDir, rel);
              fs.mkdirSync(path.dirname(dstFile), { recursive: true });
              fs.copyFileSync(srcFile, dstFile);
            }

            // Copy modified files with content changes
            for (const rel of modifiedFiles) {
              const srcFile: string = path.join(iterSrcDir, rel);
              const dstFile: string = path.join(unpackDir, rel);
              fs.mkdirSync(path.dirname(dstFile), { recursive: true });
              try {
                const orig: Buffer = fs.readFileSync(srcFile);
                // Simple deterministic mutation: invert first byte & append marker
                if (orig.length > 0) {
                  const mutated: Buffer = Buffer.from(orig);
                  // Invert first byte (ensure within 0-255)
                  mutated[0] = mutated[0] ^ 0xff; // invert first byte
                  const marker: Buffer = Buffer.from(`\n__PARTIAL_MODIFIED__${rel}\n`);
                  fs.writeFileSync(dstFile, Buffer.concat([mutated, marker]));
                } else {
                  fs.writeFileSync(dstFile, Buffer.from(`__PARTIAL_MODIFIED_EMPTY__${rel}\n`));
                }
              } catch (e) {
                terminal.writeWarningLine(`Failed to mutate file ${rel}: ${(e as Error).message}`);
              }
            }

            // Extra files (not in archive): choose up to 5% or at least 1, max 10
            const extraCount: number = Math.max(1, Math.min(10, Math.floor(total * 0.05)));
            const extraDir: string = path.join(unpackDir, 'z_extra');
            fs.mkdirSync(extraDir, { recursive: true });
            for (let iExtra: number = 0; iExtra < extraCount; iExtra++) {
              const extraPath: string = path.join(extraDir, `extra_file_${iExtra}.txt`);
              fs.writeFileSync(extraPath, `extra file ${iExtra} for partial scenario`);
            }

            terminal.writeVerboseLine(
              `Prepopulated partial for ${scenario.name}: unchanged=${unchangedFiles.length}, modified=${modifiedFiles.length}, missing=${missingCount}, extra=${extraCount}`
            );
          }
        }
      }
      const unpackStart: number = nowMs();
      try {
        if (scenario.tool === 'zipsync') {
          zipSync({
            terminal,
            mode: 'unpack',
            archivePath,
            targetDirectory: unpackDir,
            compression:
              scenario.compression === 'deflate'
                ? 'deflate'
                : scenario.compression === 'auto'
                  ? 'auto'
                  : 'store'
          });
        } else if (scenario.tool === 'zip') {
          const res: SpawnSyncReturns<Buffer> = spawnSync('unzip', ['-q', archivePath, '-d', unpackDir]);
          if (res.status !== 0) throw new Error(`unzip failed`);
        } else if (scenario.tool === 'tar') {
          if (scenario.compression === 'gzip') {
            const res: SpawnSyncReturns<Buffer> = spawnSync('tar', ['-xzf', archivePath, '-C', unpackDir]);
            if (res.status !== 0) throw new Error('tar x (gzip) failed');
          } else {
            const res: SpawnSyncReturns<Buffer> = spawnSync('tar', ['-xf', archivePath, '-C', unpackDir]);
            if (res.status !== 0) throw new Error('tar x failed');
          }
        }
      } catch (e) {
        scenario.error = (e as Error).message;
        terminal.writeErrorLine(`Error unpacking ${scenario.name}: ${scenario.error}`);
        continue;
      }
      const unpackEnd: number = nowMs();

      // VERIFY (optional)
      if (args.verify && datasetHash) {
        const srcHash: string = datasetHash;
        const dstHash: string = hashTree(unpackDir);
        if (srcHash !== dstHash) {
          scenario.verifyFailed = true;
          terminal.writeErrorLine(`Verification hash mismatch for ${scenario.name}`);
        }
      } else if (!args.verify) {
        scenario.verifySkipped = true;
      }

      scenario.samples.push({
        packMs: packEnd - packStart,
        unpackMs: unpackEnd - unpackStart,
        size
      });

      if (!args.keep) {
        try {
          fs.rmSync(unpackDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        if (!args.keep) {
          try {
            fs.unlinkSync(archivePath);
          } catch {
            /* ignore */
          }
        }
      }
    }

    if (!args.keep) {
      try {
        fs.rmSync(iterSrcDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  if (!args.keep) {
    // Do not remove tmpRoot; allow user to inspect with --keep
    try {
      fs.rmdirSync(tmpRoot);
    } catch {
      /* ignore if not empty */
    }
  }

  // REPORT
  console.log('\n================ Benchmark Summary ================');
  interface IFinalRow {
    name: string;
    pack: string; // formatted
    unpack: string; // formatted
    size: string; // formatted
    notes: string;
    packAvg?: number;
    packMin?: number;
    packMax?: number;
    unpackAvg?: number;
    unpackMin?: number;
    unpackMax?: number;
    sizeAvg?: number;
    compressionLabel: string; // original compression setting
    isCompressed: boolean; // grouping flag
  }
  const rows: IFinalRow[] = [];
  for (const s of scenarios) {
    if (!s.available) continue;
    const isCompressedScenario: boolean = ['deflate', 'gzip', 'auto'].includes(s.compression);
    if (s.samples.length === 0) {
      rows.push({
        name: s.name,
        pack: '-',
        unpack: '-',
        size: '-',
        notes: s.error || 'no samples',
        compressionLabel: s.compression,
        isCompressed: isCompressedScenario
      });
      continue;
    }
    const packStats: { min: number; max: number; avg: number } = stats(s.samples.map((x) => x.packMs));
    const unpackStats: { min: number; max: number; avg: number } = stats(s.samples.map((x) => x.unpackMs));
    const sizeStats: { min: number; max: number; avg: number } = stats(s.samples.map((x) => x.size));
    const notes: string[] = [];
    if (s.error) notes.push(`error:${s.error}`);
    if (s.verifyFailed) notes.push('verify-failed');
    if (s.verifySkipped) notes.push('verify-skipped');
    rows.push({
      name: s.name,
      pack: `${packStats.avg.toFixed(1)}ms (min ${packStats.min} / max ${packStats.max})`,
      unpack: `${unpackStats.avg.toFixed(1)}ms (min ${unpackStats.min} / max ${unpackStats.max})`,
      size: formatBytes(sizeStats.avg),
      notes: notes.join(',') || '',
      packAvg: packStats.avg,
      packMin: packStats.min,
      packMax: packStats.max,
      unpackAvg: unpackStats.avg,
      unpackMin: unpackStats.min,
      unpackMax: unpackStats.max,
      sizeAvg: sizeStats.avg,
      compressionLabel: s.compression,
      isCompressed: isCompressedScenario
    });
  }

  // Build a table using a fixed baseline scenario name (tar for uncompressed, tar-gzip for compressed)
  type TableRow = Record<string, string | number>;
  function buildTable(subset: IFinalRow[], title: string, baselineName: string): void {
    const baseline: IFinalRow | undefined = subset.find(
      (r) => r.name === baselineName && r.packAvg !== undefined
    );
    const tableData: TableRow[] = subset.map((r) => {
      if (r.packAvg === undefined) {
        return {
          Scenario: r.name,
          Compression: r.compressionLabel,
          PackAvgMs: '-',
          PackMinMs: '-',
          PackMaxMs: '-',
          UnpackAvgMs: '-',
          UnpackMinMs: '-',
          UnpackMaxMs: '-',
          SizeAvg: '-',
          RelPackToBaseline: '-',
          RelUnpackToBaseline: '-',
          Notes: r.notes
        };
      }
      let relPack: string = '-';
      let relUnpack: string = '-';
      if (baseline && baseline.packAvg !== undefined && baseline.unpackAvg !== undefined) {
        relPack = (r.packAvg! / baseline.packAvg!).toFixed(2) + 'x';
        relUnpack = (r.unpackAvg! / baseline.unpackAvg!).toFixed(2) + 'x';
      }
      return {
        Scenario: r.name,
        Compression: r.compressionLabel,
        PackAvgMs: r.packAvg?.toFixed(1) ?? '-',
        PackMinMs: r.packMin ?? '-',
        PackMaxMs: r.packMax ?? '-',
        UnpackAvgMs: r.unpackAvg?.toFixed(1) ?? '-',
        UnpackMinMs: r.unpackMin ?? '-',
        UnpackMaxMs: r.unpackMax ?? '-',
        SizeAvg: formatBytes(r.sizeAvg || 0),
        RelPackToBaseline: relPack,
        RelUnpackToBaseline: relUnpack,
        Notes: r.notes
      };
    });
    console.log(`\n${title}`);
    console.table(tableData);
    if (baseline && baseline.packAvg !== undefined && baseline.unpackAvg !== undefined) {
      console.log(
        `Baseline (${baseline.name}): pack ${baseline.packAvg.toFixed(1)}ms / unpack ${baseline.unpackAvg.toFixed(1)}ms`
      );
    } else {
      console.log(`Baseline (${baselineName}) not available (missing tool or no samples).`);
    }
  }

  const uncompressedRows: IFinalRow[] = rows.filter((r) => !r.isCompressed);
  const compressedRows: IFinalRow[] = rows.filter((r) => r.isCompressed);
  buildTable(uncompressedRows, 'Uncompressed Scenarios', 'tar');
  buildTable(compressedRows, 'Compressed Scenarios', 'tar-gzip');
  console.log('==================================================');
}

// Execute
main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
