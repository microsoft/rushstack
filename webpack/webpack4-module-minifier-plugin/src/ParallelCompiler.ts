// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import os from 'os';
import { resolve } from 'path';
import type { Worker } from 'worker_threads';

import type { Configuration } from 'webpack';

import type {
  IMinifierConnection,
  IModuleMinificationRequest,
  IModuleMinificationResult,
  MinifyOptions
} from '@rushstack/module-minifier';
import { WorkerPoolMinifier } from '@rushstack/module-minifier';
import { WorkerPool } from '@rushstack/worker-pool';

export interface IParallelWebpackOptions {
  cacheDirectory?: string;
  configFilePath: string;
  maxCompilationThreads?: number;
  sourceMap?: boolean | undefined;
  terserOptions?: MinifyOptions;
  usePortableModules?: boolean;
}

const ZERO: bigint = BigInt(0);
const THOUSAND: bigint = BigInt(1e3);

/**
 * Formats a delta of `process.hrtime.bigint()` values as a string
 * @param timeNs
 */
function formatTime(timeNs: bigint): string {
  let unit: string = 'ns';
  let fraction: bigint = ZERO;
  if (timeNs > THOUSAND) {
    unit = 'us';
    fraction = timeNs % THOUSAND;
    timeNs /= THOUSAND;
  }
  if (timeNs > THOUSAND) {
    unit = 'ms';
    fraction = timeNs % THOUSAND;
    timeNs /= THOUSAND;
  }
  if (timeNs > THOUSAND) {
    unit = 's';
    fraction = timeNs % THOUSAND;
    timeNs /= THOUSAND;
  }

  return `${timeNs}.${('000' + fraction).slice(-3, -1)} ${unit}`;
}

export async function runParallel(options: IParallelWebpackOptions): Promise<void> {
  const resolvedPath: string = resolve(options.configFilePath);

  const rawConfig: Configuration | Configuration[] = require(resolvedPath); // eslint-disable-line @typescript-eslint/no-var-requires
  const configArray: Configuration[] = Array.isArray(rawConfig) ? rawConfig : [rawConfig];
  const configCount: number = configArray.length;

  const totalCpus: number = os.availableParallelism?.() ?? os.cpus().length;

  // TODO: Use all cores if not minifying
  const {
    maxCompilationThreads: maxConfiguredCompilationThreads = Math.max(
      totalCpus > 8 ? (totalCpus * 3) >> 2 : totalCpus >> 1,
      1
    ),
    sourceMap,
    usePortableModules
  } = options;

  const maxCompilationThreads: number = Math.min(configCount, maxConfiguredCompilationThreads);

  const maxCompressionThreads: number = Math.max(1, totalCpus - maxCompilationThreads);

  const minifier: WorkerPoolMinifier = new WorkerPoolMinifier({
    terserOptions: options.terserOptions,
    maxThreads: maxCompressionThreads
  });

  const minifierConnection: IMinifierConnection = await minifier.connectAsync();

  const webpackPool: WorkerPool = new WorkerPool({
    id: 'Webpack',
    maxWorkers: maxCompilationThreads,
    onWorkerDestroyed: (): void => {
      // Allocate the webpack worker to terser
      minifier.maxThreads++;
    },
    workerScriptPath: require.resolve('./workerPool/WebpackWorker'),
    workerData: {
      configFilePath: resolvedPath,
      sourceMap,
      usePortableModules
    }
  });

  let processed: number = 0;
  const startTime: bigint = process.hrtime.bigint();

  for (let i: number = 0; i < configCount; i++) {
    const webpackWorker: Worker = await webpackPool.checkoutWorkerAsync(true);

    const sendMinifierResult: (result: IModuleMinificationResult) => void = (
      result: IModuleMinificationResult
    ): void => {
      webpackWorker.postMessage(result);
    };

    const workerOnMessage: (message: IModuleMinificationRequest | number) => void = (
      message: IModuleMinificationRequest | string | number
    ): void => {
      if (message === 'getConfigHash') {
        webpackWorker.postMessage(minifierConnection.configHash);
        return;
      }

      if (typeof message === 'object') {
        return minifier.minify(message, sendMinifierResult);
      }

      ++processed;
      // eslint-disable-next-line no-console
      console.log(
        `${processed}/${configCount} complete (${formatTime(process.hrtime.bigint() - startTime)})`
      );

      webpackWorker.off('message', workerOnMessage);
      webpackPool.checkinWorker(webpackWorker);
    };

    webpackWorker.on('message', workerOnMessage);
    webpackWorker.postMessage(i);
  }

  await webpackPool.finishAsync();

  await minifierConnection.disconnectAsync();
}
