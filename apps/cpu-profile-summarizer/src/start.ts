// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Worker } from 'node:worker_threads';

import { WorkerPool } from '@rushstack/worker-pool';

import type { IMessageFromWorker } from './protocol';
import type { INodeSummary, IProfileSummary } from './types';

/**
 * Merges summarized information from multiple profiles into a single collection.
 * @param accumulator - The collection to merge the nodes into
 * @param values - The nodes to merge
 */
function mergeProfileSummaries(
  accumulator: Map<string, INodeSummary>,
  values: Iterable<[string, INodeSummary]>
): void {
  for (const [nodeId, node] of values) {
    const existing: INodeSummary | undefined = accumulator.get(nodeId);
    if (!existing) {
      accumulator.set(nodeId, node);
    } else {
      existing.selfTime += node.selfTime;
      existing.totalTime += node.totalTime;
    }
  }
}

/**
 * Scans a directory and its subdirectories for CPU profiles.
 * @param baseDir - The directory to recursively search for CPU profiles
 * @returns All .cpuprofile files found in the directory and its subdirectories
 */
function findProfiles(baseDir: string): string[] {
  baseDir = path.resolve(baseDir);

  const files: string[] = [];
  const directories: string[] = [baseDir];

  for (const dir of directories) {
    const entries: fs.Dirent[] = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.cpuprofile')) {
        files.push(`${dir}/${entry.name}`);
      } else if (entry.isDirectory()) {
        directories.push(`${dir}/${entry.name}`);
      }
    }
  }

  return files;
}

/**
 * Prints the usage information for the application.
 */
function printUsage(): void {
  console.log('Usage: cpu-profile-summarizer --input DIR [[--input DIR] ...] --output TSV_FILE');
}

/**
 * Processes a set of CPU profiles and aggregates the results.
 * Uses a worker pool.
 * @param profiles - The set of .cpuprofile files to process
 * @returns A summary of the profiles
 */
async function processProfilesAsync(profiles: Set<string>): Promise<IProfileSummary> {
  const maxWorkers: number = Math.min(profiles.size, os.availableParallelism());
  console.log(`Processing ${profiles.size} profiles using ${maxWorkers} workers...`);
  const workerPool: WorkerPool = new WorkerPool({
    id: 'cpu-profile-summarizer',
    maxWorkers,
    workerScriptPath: path.resolve(__dirname, 'worker.js')
  });

  const summary: IProfileSummary = new Map();

  let processed: number = 0;
  await Promise.all(
    Array.from(profiles, async (profile: string) => {
      const worker: Worker = await workerPool.checkoutWorkerAsync(true);
      const responsePromise: Promise<IMessageFromWorker[]> = once(worker, 'message');
      worker.postMessage(profile);
      const { 0: messageFromWorker } = await responsePromise;
      if (messageFromWorker.type === 'error') {
        console.error(`Error processing ${profile}: ${messageFromWorker.data}`);
      } else {
        ++processed;
        console.log(`Processed ${profile} (${processed}/${profiles.size})`);
        mergeProfileSummaries(summary, messageFromWorker.data);
      }
      workerPool.checkinWorker(worker);
    })
  );

  await workerPool.finishAsync();

  return summary;
}

function writeSummaryToTsv(tsvPath: string, summary: IProfileSummary): void {
  const dir: string = path.dirname(tsvPath);
  fs.mkdirSync(dir, { recursive: true });

  let tsv: string = `Self Time (seconds)\tTotal Time (seconds)\tFunction Name\tURL\tLine\tColumn`;
  for (const { selfTime, totalTime, functionName, url, lineNumber, columnNumber } of summary.values()) {
    const selfSeconds: string = (selfTime / 1e6).toFixed(3);
    const totalSeconds: string = (totalTime / 1e6).toFixed(3);

    tsv += `\n${selfSeconds}\t${totalSeconds}\t${functionName}\t${url}\t${lineNumber}\t${columnNumber}`;
  }

  fs.writeFileSync(tsvPath, tsv, 'utf8');
  console.log(`Wrote summary to ${tsvPath}`);
}

async function executeAsync(): Promise<boolean> {
  const {
    values: { input, output, help }
  } = parseArgs({
    args: process.argv.slice(2),
    options: {
      input: {
        type: 'string',
        alias: 'i',
        multiple: true,
        required: true
      },
      output: {
        type: 'string',
        alias: 'o'
      },
      help: {
        type: 'boolean',
        alias: 'h'
      }
    }
  });

  if (help) {
    printUsage();
    return true;
  }

  if (!input) {
    console.error('No input directories provided');
    printUsage();
    return false;
  }

  if (!output) {
    console.error('No output file provided');
    printUsage();
    return false;
  }

  const allProfiles: Set<string> = new Set();
  for (const dir of input) {
    const resolvedDir: string = path.resolve(dir);
    console.log(`Collating CPU profiles from ${resolvedDir}...`);
    const profiles: string[] = findProfiles(resolvedDir);
    console.log(`Found ${profiles.length} profiles`);
    for (const profile of profiles) {
      allProfiles.add(profile);
    }
  }

  const summary: IProfileSummary = await processProfilesAsync(allProfiles);

  writeSummaryToTsv(output, summary);

  return true;
}

process.exitCode = 1;
executeAsync()
  .then((success: boolean) => {
    if (success) {
      process.exitCode = 0;
    }
  })
  .catch((error: Error) => {
    console.error(error);
  });
