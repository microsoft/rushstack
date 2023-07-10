// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Worker } from 'node:worker_threads';
import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/rush-sdk';
import type { WorkerPool } from '@rushstack/worker-pool/lib/WorkerPool';
import type { IDependencyMetadata, IRefCount, IParsedTarball, ITarballParseMessage } from '../types';
import { OperationStatus } from '../externals';

/**
 * Runner that takes a binary blob of a .tgz file, validates the integrity hash, decompresses it, and parses it.
 */
export class ParseOperationRunner implements IOperationRunner {
  public readonly name: string;
  // Reporting timing here would be very noisy
  public readonly reportTiming: boolean = false;
  public silent: boolean = true;
  // Has side effects
  public isSkipAllowed: boolean = false;
  // Doesn't block cache writes
  public isCacheWriteAllowed: boolean = true;
  // Nothing will get logged, no point allowing warnings
  public readonly warningsAreAllowed: boolean = false;

  public readonly data: IDependencyMetadata;

  private _pool: IRefCount<WorkerPool>;

  public constructor(name: string, data: IDependencyMetadata, pool: IRefCount<WorkerPool>) {
    this.name = name;
    this.data = data;
    this._pool = pool;
    ++pool.count;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { tarball } = this.data;

    if (!tarball || !tarball.raw) {
      return OperationStatus.Failure;
    }

    const { raw, integrity } = tarball;
    tarball.raw = undefined;

    let worker: Worker | undefined;

    try {
      const localWorker: Worker = (worker = await this._pool.ref.checkoutWorkerAsync(true));

      const parsedTarball: IParsedTarball = await new Promise(function parseTarball(
        resolve: (result: IParsedTarball) => void,
        reject: (err: Error) => void
      ): void {
        localWorker.once('message', ({ requestId, status, error, value }) => {
          if (status === 'error') {
            return reject(error);
          }
          if (requestId !== tarball.integrity) {
            return reject(new Error(`Expected parsed integrity ${integrity}, received ${requestId}`));
          }
          resolve(value);
        });

        const parseMessage: ITarballParseMessage = {
          type: 'parse',
          integrity,
          buffer: raw.buffer,
          length: raw.length
        };

        localWorker.postMessage(parseMessage, [raw.buffer]);
      });

      // eslint-disable-next-line require-atomic-updates
      tarball.parsed = parsedTarball;

      return OperationStatus.Success;
    } catch (err) {
      this.silent = false;
      context.collatedWriter.terminal.writeStderrLine(`Parse "${integrity}" failed with: ${err.toString()}`);
      return OperationStatus.Failure;
    } finally {
      if (worker) {
        this._pool.ref.checkinWorker(worker);
      }

      if (--this._pool.count === 0) {
        await this._pool.ref.finishAsync();
      }
    }
  }
}
