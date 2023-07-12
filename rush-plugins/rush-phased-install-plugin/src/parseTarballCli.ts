// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// This file is for manually testing the tarball worker to ensure it is working correctly, and for performance testing.
// It uses the same worker pool logic is as the full plugin to try to keep the test as close to the real thing as possible.

import fs from 'fs';
import type { Worker } from 'worker_threads';

import { WorkerPool } from '@rushstack/worker-pool/lib/WorkerPool';

import type { IParsedTarball, ITarballExtractMessage, ITarballParseMessage } from './types';

const log: boolean = process.argv.includes('--log');

/**
 * Helper function for local testing of the performance of the tarball parser worker.
 *
 * @param pool - The worker pool to use
 * @param tarballPath - Path to the .tgz file on disk
 * @param integrity - The expected integrity hash of the tarball
 * @returns - The parsed tarball
 */
async function parseTarball(
  pool: WorkerPool,
  tarballPath: string,
  integrity: string
): Promise<IParsedTarball> {
  // eslint-disable-next-line no-console
  console.log(`Reading tarball.`);
  const rawTarball: Buffer = await fs.promises.readFile(tarballPath);

  const localWorker: Worker = await pool.checkoutWorkerAsync(true);

  // eslint-disable-next-line no-console
  console.log(`Parsing tarball`);
  // eslint-disable-next-line no-console
  console.time('parse');
  const parsedTarball: IParsedTarball = await new Promise(
    (resolve: (result: IParsedTarball) => void, reject: (err: Error) => void) => {
      localWorker.once('message', ({ requestId, status, error, value }) => {
        if (status === 'error') {
          return reject(error);
        }
        if (requestId !== integrity) {
          return reject(new Error(`Expected parsed integrity ${integrity}, received ${requestId}`));
        }
        resolve(value);
      });

      const parseMessage: ITarballParseMessage = {
        type: 'parse',
        integrity,
        buffer: rawTarball.buffer,
        length: rawTarball.length
      };

      localWorker.postMessage(parseMessage, [rawTarball.buffer]);
    }
  );
  // eslint-disable-next-line no-console
  console.timeEnd('parse');

  pool.checkinWorker(localWorker);

  // eslint-disable-next-line no-console
  console.log(`Buffer length: ${parsedTarball.buffer.byteLength}`);
  if (log) {
    // eslint-disable-next-line no-console
    console.log(`Files:`);
    for (const [path, { offset, size, mode }] of parsedTarball.files) {
      // eslint-disable-next-line no-console
      console.log(` - "${path}" [offset=${offset}, size=${size}, mode=${mode}]`);
    }
  }

  return parsedTarball;
}

async function extractTarballAsync(
  pool: WorkerPool,
  tarball: IParsedTarball,
  integrity: string,
  destination: string
): Promise<void> {
  const localWorker: Worker = await pool.checkoutWorkerAsync(true);

  // eslint-disable-next-line no-console
  console.log(`Extracting tarball`);
  // eslint-disable-next-line no-console
  console.time('extract');
  await new Promise((resolve: (result: boolean) => void, reject: (err: Error) => void) => {
    localWorker.once('message', ({ requestId, status, error, value }) => {
      if (status === 'error') {
        return reject(error);
      }
      if (requestId !== integrity) {
        return reject(new Error(`Expected parsed integrity ${integrity}, received ${requestId}`));
      }
      resolve(value);
    });

    const extractMessage: ITarballExtractMessage = {
      type: 'extract',
      integrity,
      buffer: tarball.buffer,

      folder: destination,
      files: tarball.files
    };

    localWorker.postMessage(extractMessage);
  });
  // eslint-disable-next-line no-console
  console.timeEnd('extract');

  pool.checkinWorker(localWorker);
}

const workerPool: WorkerPool = new WorkerPool({
  id: 'tarball',
  maxWorkers: 1,
  workerScriptPath: require.resolve('../lib/worker/tarballWorker.js')
});

const [, , tarballPath, integrity, destination] = process.argv;
fs.rmSync(destination, { recursive: true });
fs.mkdirSync(destination, { recursive: true });
parseTarball(workerPool, tarballPath, integrity)
  .then((tarball: IParsedTarball) => {
    return extractTarballAsync(workerPool, tarball, integrity, destination);
  })
  .finally(async () => {
    await workerPool.finishAsync();
  })
  // eslint-disable-next-line no-console
  .catch(console.error);
