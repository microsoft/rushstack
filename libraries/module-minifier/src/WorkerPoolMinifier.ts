// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { createHash } from 'node:crypto';
import os from 'node:os';
import type { ResourceLimits } from 'node:worker_threads';

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
   * Defaults to os.availableParallelism()
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

  /**
   * Optional resource limits for the workers.
   */
  workerResourceLimits?: ResourceLimits;
}

/**
 * Minifier implementation that uses a thread pool for minification.
 * @public
 */
export class WorkerPoolMinifier implements IModuleMinifier {
  readonly #pool: WorkerPool;
  readonly #verbose: boolean;
  readonly #configHash: string;

  #refCount: number;
  #deduped: number;
  #minified: number;

  readonly #resultCache: Map<string, IModuleMinificationResult>;
  readonly #activeRequests: Map<string, IModuleMinificationCallback[]>;

  public constructor(options: IWorkerPoolMinifierOptions) {
    const {
      maxThreads = os.availableParallelism?.() ?? os.cpus().length,
      terserOptions = {},
      verbose = false,
      workerResourceLimits
    } = options || {};

    const activeRequests: Map<string, IModuleMinificationCallback[]> = new Map();
    const resultCache: Map<string, IModuleMinificationResult> = new Map();
    const terserPool: WorkerPool = new WorkerPool({
      id: 'Minifier',
      maxWorkers: maxThreads,
      workerData: terserOptions,
      workerScriptPath: require.resolve('./MinifierWorker'),
      workerResourceLimits
    });

    const { version: terserVersion } = require('terser/package.json');

    this.#configHash = createHash('sha256')
      .update(WorkerPoolMinifier.name, 'utf8')
      .update(`terser@${terserVersion}`)
      .update(serialize(terserOptions))
      .digest('base64');

    this.#activeRequests = activeRequests;
    this.#refCount = 0;
    this.#resultCache = resultCache;
    this.#pool = terserPool;
    this.#verbose = verbose;

    this.#deduped = 0;
    this.#minified = 0;
  }

  public get maxThreads(): number {
    return this.#pool.maxWorkers;
  }

  public set maxThreads(threads: number) {
    this.#pool.maxWorkers = threads;
  }

  /**
   * Transform code by farming it out to a worker pool.
   * @param request - The request to process
   * @param callback - The callback to invoke
   */
  public minify(request: IModuleMinificationRequest, callback: IModuleMinificationCallback): void {
    const { hash } = request;

    const cached: IModuleMinificationResult | undefined = this.#resultCache.get(hash);
    if (cached) {
      ++this.#deduped;
      return callback(cached);
    }

    const callbacks: IModuleMinificationCallback[] | undefined = this.#activeRequests.get(hash);
    if (callbacks) {
      ++this.#deduped;
      callbacks.push(callback);
      return;
    }

    this.#activeRequests.set(hash, [callback]);
    ++this.#minified;

    this.#pool
      .checkoutWorkerAsync(true)
      .then((worker) => {
        const cb: (message: IModuleMinificationResult) => void = (
          message: IModuleMinificationResult
        ): void => {
          worker.off('message', cb);
          const workerCallbacks: IModuleMinificationCallback[] | undefined = this.#activeRequests.get(
            message.hash
          )!;
          this.#activeRequests.delete(message.hash);
          this.#resultCache.set(message.hash, message);
          for (const workerCallback of workerCallbacks) {
            workerCallback(message);
          }
          // This should always be the last thing done with the worker
          this.#pool.checkinWorker(worker);
        };

        worker.on('message', cb);
        worker.postMessage(request);
      })
      .catch((error: Error) => {
        const errorCallbacks: IModuleMinificationCallback[] = this.#activeRequests.get(hash)!;
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

  /**
   * {@inheritdoc IModuleMinifier.connectAsync}
   */
  public async connectAsync(): Promise<IMinifierConnection> {
    if (++this.#refCount === 1) {
      this.#pool.reset();
    }

    const disconnectAsync: IMinifierConnection['disconnectAsync'] = async () => {
      if (--this.#refCount === 0) {
        if (this.#verbose) {
          // eslint-disable-next-line no-console
          console.log(`Shutting down minifier worker pool`);
        }
        await this.#pool.finishAsync();
        this.#resultCache.clear();
        this.#activeRequests.clear();
        if (this.#verbose) {
          // eslint-disable-next-line no-console
          console.log(`Module minification: ${this.#deduped} Deduped, ${this.#minified} Processed`);
        }
      }
      this.#deduped = 0;
      this.#minified = 0;
    };

    return {
      configHash: this.#configHash,

      disconnectAsync,
      disconnect: disconnectAsync
    };
  }

  /**
   * @deprecated Use {@link WorkerPoolMinifier.connectAsync} instead
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  public async connect(): Promise<IMinifierConnection> {
    return await this.connectAsync();
  }
}
