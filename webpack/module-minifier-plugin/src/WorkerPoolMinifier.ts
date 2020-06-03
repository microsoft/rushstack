// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IModuleMinificationCallback, IModuleMinificationResult, IModuleMinificationRequest } from './ModuleMinifierPlugin.types';
import { MinifyOptions } from 'terser';
import { Worker } from 'worker_threads';
import { WorkerPool } from './threadPool/WorkerPool';
import { createHash } from 'crypto';
import { cpus } from 'os';

import './OverrideWebpackIdentifierAllocation';

export interface IWorkerPoolMinifierOptions {
  /**
   * Maximum number of worker threads to use. Will never use more than there are modules to process.
   * Defaults to os.cpus().length
   */
  maxThreads?: number;
  /**
   * The options to forward to Terser.
   * `output.comments` is currently not configurable and will always extract license comments to a separate file.
   */
  terserOptions?: MinifyOptions;
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
    const {
      maxThreads = cpus().length,
      terserOptions = {}
    } = options || {};

    const activeRequests: Map<string, IModuleMinificationCallback[]> = new Map();
    const resultCache: Map<string, IWorkerResponseMessage> = new Map();
    const terserPool: WorkerPool = new WorkerPool({
      id: 'Minifier',
      maxWorkers: maxThreads,
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
      workerData: terserOptions,
      workerScriptPath: require.resolve('./MinifierWorker')
    });

    this._activeRequests = activeRequests;
    this._resultCache = resultCache;
    this._pool = terserPool;
  }

  /**
   * Transform code by farming it out to a worker pool.
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(
    request: IModuleMinificationRequest,
    callback: IModuleMinificationCallback
  ): void {
    const {
      code,
      nameForMap
    } = request;

    const hash: string = createHash('sha256').update(code).digest('hex');

    const cached: IWorkerResponseMessage | undefined = this._resultCache.get(hash);
    if (cached) {
      callback(cached);
    }

    const {
      _activeRequests: activeRequests
    } = this;
    const callbacks: IModuleMinificationCallback[] | undefined = activeRequests.get(hash);
    if (callbacks) {
      callbacks.push(callback);
      return;
    }

    activeRequests.set(hash, [callback]);

    this._pool.checkoutWorker(true).then((worker) => {
      worker.postMessage({
        hash,
        code,
        nameForMap
      });
    }).catch((error: Error) => {
      const errorCallbacks: IModuleMinificationCallback[] = activeRequests.get(hash)!;
      for (const errorCallback of errorCallbacks) {
        errorCallback({
          hash,
          error,
          code: undefined,
          map: undefined,
          extractedComments: undefined
        });
      }
    });
  }

  /**
   * Shuts down the worker threads to free up resources.
   */
  public shutdown(): Promise<void> {
    return this._pool.finish();
  }
}