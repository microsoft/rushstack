// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IModuleMinificationCallback, IModuleMinificationResult } from '../ModuleMinifierPlugin.types';
import { MinifyOptions } from 'terser';
import { Worker } from 'worker_threads';
import '../OverrideWebpackIdentifierAllocation';
import { WorkerPool } from './WorkerPool';
import { createHash } from 'crypto';

export interface IWorkerPoolMinifierOptions {
  /**
   * Maximum number of worker threads to use. Will never use more than there are modules to process.
   */
  maxThreads: number;
  /**
   * The options to forward to Terser.
   * `output.comments` is currently not configurable and will always extract license comments to a separate file.
   */
  terserOptions: MinifyOptions;
}

type IWorkerResponseMessage = {
  hash: string;
} & IModuleMinificationResult;

/**
 * Minifier implementation that uses a thread pool for minification.
 * @public
 */
export class WorkerPoolMinifier {
  private readonly _pool: WorkerPool;

  private readonly _resultCache: Map<string, IWorkerResponseMessage>;
  private readonly _activeRequests: Map<string, IModuleMinificationCallback[]>;

  public constructor(options: IWorkerPoolMinifierOptions) {
    const activeRequests: Map<string, IModuleMinificationCallback[]> = new Map();
    const resultCache: Map<string, IWorkerResponseMessage> = new Map();
    const terserPool: WorkerPool = new WorkerPool({
      id: 'Minifier',
      maxWorkers: options.maxThreads,
      prepareWorker: (worker: Worker) => {
        worker.on('message', (message: IWorkerResponseMessage) => {
          const callbacks: IModuleMinificationCallback[] | undefined = activeRequests.get(message.hash)!;
          activeRequests.delete(message.hash);
          resultCache.set(message.hash, message);
          for (const callback of callbacks) {
            callback(message);
          }
          terserPool.checkinWorker(worker);
        });
      },
      workerData: options.terserOptions,
      workerScriptPath: require.resolve('./MinifierWorker')
    });

    this._activeRequests = activeRequests;
    this._resultCache = resultCache;
    this._pool = terserPool;
  }

  /**
   * Transform code by farming it out to a worker pool.
   * @param code - The code to process
   * @param callback - The callback to invoke
   */
  public minify(
    code: string,
    callback: IModuleMinificationCallback
  ): void {
    const hash: string = createHash('sha256').update(code).digest('hex');

    const cached: IWorkerResponseMessage | undefined = this._resultCache.get(hash);
    if (cached) {
      callback(cached);
    }

    const callbacks: IModuleMinificationCallback[] | undefined = this._activeRequests.get(hash);
    if (callbacks) {
      callbacks.push(callback);
      return;
    }

    this._activeRequests.set(hash, [callback]);

    this._pool.checkoutWorker(true).then((worker) => {
      worker.postMessage({
        hash,
        code
      });
    }).catch((error: Error) => {
      callback({
        hash,
        error,
        code: undefined,
        extractedComments: undefined
      });
    });
  }

  /**
   * Shuts down the worker threads to free up resources.
   */
  public shutdown(): Promise<void> {
    return this._pool.finish();
  }
}