// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'crypto';
import { cpus } from 'os';

import serialize from 'serialize-javascript';
import type { MinifyOptions } from 'terser';
import { WorkerPool } from '@rushstack/worker-pool';

import type {
  IMinifierConnection,
  IModuleMinificationCallback,
  IModuleMinificationResult,
  IModuleMinificationRequest,
  IModuleMinifier
} from './types';

/**
 * Options for configuring the WorkerPoolMinifier
 * @public
 */
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

  /**
   * If true, log to the console about the minification results.
   */
  verbose?: boolean;
}

/**
 * Minifier implementation that uses a thread pool for minification.
 * @public
 */
export class WorkerPoolMinifier implements IModuleMinifier {
  private readonly _pool: WorkerPool;
  private readonly _verbose: boolean;
  private readonly _configHash: string;

  private _refCount: number;
  private _deduped: number;
  private _minified: number;

  private readonly _resultCache: Map<string, IModuleMinificationResult>;
  private readonly _activeRequests: Map<string, IModuleMinificationCallback[]>;

  public constructor(options: IWorkerPoolMinifierOptions) {
    const { maxThreads = cpus().length, terserOptions = {}, verbose = false } = options || {};

    const activeRequests: Map<string, IModuleMinificationCallback[]> = new Map();
    const resultCache: Map<string, IModuleMinificationResult> = new Map();
    const terserPool: WorkerPool = new WorkerPool({
      id: 'Minifier',
      maxWorkers: maxThreads,
      workerData: terserOptions,
      workerScriptPath: require.resolve('./MinifierWorker')
    });

    const { version: terserVersion } = require('terser/package.json');

    this._configHash = createHash('sha256')
      .update(WorkerPoolMinifier.name, 'utf8')
      .update(`terser@${terserVersion}`)
      .update(serialize(terserOptions))
      .digest('base64');

    this._activeRequests = activeRequests;
    this._refCount = 0;
    this._resultCache = resultCache;
    this._pool = terserPool;
    this._verbose = verbose;

    this._deduped = 0;
    this._minified = 0;
  }

  public get maxThreads(): number {
    return this._pool.maxWorkers;
  }

  public set maxThreads(threads: number) {
    this._pool.maxWorkers = threads;
  }

  /**
   * Transform code by farming it out to a worker pool.
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { hash } = request;

    const cached: IModuleMinificationResult | undefined = this._resultCache.get(hash);
    if (cached) {
      ++this._deduped;
      return callback(cached);
    }

    const { _activeRequests: activeRequests } = this;
    const callbacks: IModuleMinificationCallback[] | undefined = activeRequests.get(hash);
    if (callbacks) {
      ++this._deduped;
      callbacks.push(callback);
      return;
    }

    activeRequests.set(hash, [callback]);
    ++this._minified;

    this._pool
      .checkoutWorkerAsync(true)
      .then((worker) => {
        const cb: (message: IModuleMinificationResult) => void = (
          message: IModuleMinificationResult
        ): void => {
          worker.off('message', cb);
          const workerCallbacks: IModuleMinificationCallback[] | undefined = activeRequests.get(
            message.hash
          )!;
          activeRequests.delete(message.hash);
          this._resultCache.set(message.hash, message);
          for (const workerCallback of workerCallbacks) {
            workerCallback(message);
          }
          // This should always be the last thing done with the worker
          this._pool.checkinWorker(worker);
        };

        worker.on('message', cb);
        worker.postMessage(request);
      })
      .catch((error: Error) => {
        const errorCallbacks: IModuleMinificationCallback[] = activeRequests.get(hash)!;
        for (const errorCallback of errorCallbacks) {
          errorCallback({
            hash,
            error,
            code: undefined,
            map: undefined
          });
        }
      });
  }

  public async connect(): Promise<IMinifierConnection> {
    if (++this._refCount === 1) {
      this._pool.reset();
    }

    return {
      configHash: this._configHash,

      disconnect: async () => {
        if (--this._refCount === 0) {
          if (this._verbose) {
            // eslint-disable-next-line no-console
            console.log(`Shutting down minifier worker pool`);
          }
          await this._pool.finishAsync();
          this._resultCache.clear();
          this._activeRequests.clear();
          if (this._verbose) {
            // eslint-disable-next-line no-console
            console.log(`Module minification: ${this._deduped} Deduped, ${this._minified} Processed`);
          }
        }
        this._deduped = 0;
        this._minified = 0;
      }
    };
  }
}
