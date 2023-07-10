// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { Worker } from 'node:worker_threads';
import type { IOperationRunner, IOperationRunnerContext } from '@rushstack/rush-sdk';
import type { WorkerPool } from '@rushstack/worker-pool/lib/WorkerPool';
import type { IDependencyMetadata, IRefCount, IParsedTarball, IFile, ITarballExtractMessage } from '../types';
import { OperationStatus } from '../externals';

/**
 * Runner that unpacks the decompressed tar archive for a package to disk.
 * Uses a worker thread for the main unpacking step to avoid blocking the main thread.
 */
export class UnpackOperationRunner implements IOperationRunner {
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

  private readonly _pool: IRefCount<WorkerPool>;

  public constructor(name: string, data: IDependencyMetadata, pool: IRefCount<WorkerPool>) {
    this.name = name;
    this.data = data;
    this._pool = pool;
    pool.count++;
  }

  public async executeAsync(context: IOperationRunnerContext): Promise<OperationStatus> {
    const { data } = this;
    const { tarball: tarballEntry, targetFolder } = data;
    const tarball: IParsedTarball | undefined = tarballEntry?.parsed;
    const integrity: string | undefined = tarballEntry?.integrity;

    if (!tarball || !integrity) {
      return OperationStatus.Failure;
    }

    let worker: Worker | undefined;

    try {
      const { hasBin, requiresBuild } = data;
      if (hasBin || requiresBuild) {
        const packageJsonEntry: IFile | undefined = tarball.files.get('package.json');
        if (!packageJsonEntry) {
          throw new Error(`${integrity} did not contain package.json`);
        }
        const packageJson: string = Buffer.from(
          tarball.buffer,
          packageJsonEntry.offset,
          packageJsonEntry.size
        ).toString('utf-8');

        const { bin, scripts }: { bin: Record<string, string> | string; scripts: Record<string, string> } =
          JSON.parse(packageJson);

        if (hasBin) {
          // Now that we have package.json, update the metadata about bins that need linking
          if (typeof bin === 'string') {
            const { packageName } = data;
            const slashIndex: number = packageName.lastIndexOf('/');
            const binName: string = slashIndex > 0 ? packageName.slice(slashIndex + 1) : packageName;
            data.hasBin = { [binName]: bin };
          } else {
            data.hasBin = bin;
          }
        }

        if (requiresBuild && scripts) {
          // Now that we have package.json, update the metadata about build scripts that need running
          const buildScripts: string[] = [];
          // Deliberately ignoring 'prepublish', 'preprepare', 'prepare', 'postprepare'.
          // Can revisit if any dependencies need these.
          for (const scriptName of ['preinstall', 'install', 'postinstall']) {
            const script: string | undefined = scripts[scriptName];
            if (script) {
              buildScripts.push(script);
            }
          }
          this.data.requiresBuild = buildScripts;
        }
      }

      // Make lint happy
      const localWorker: Worker = (worker = await this._pool.ref.checkoutWorkerAsync(true));

      await new Promise(function extractTarball(
        resolve: (result: boolean) => void,
        reject: (err: Error) => void
      ): void {
        localWorker.once('message', ({ requestId, status, error, value }) => {
          if (status === 'error') {
            return reject(error);
          }
          if (requestId !== integrity) {
            return reject(new Error(`Expected unpack integrity ${integrity}, received ${requestId}`));
          }
          resolve(value);
        });

        const extractMessage: ITarballExtractMessage = {
          type: 'extract',
          integrity,
          buffer: tarball.buffer,

          folder: targetFolder,
          files: tarball.files
        };

        localWorker.postMessage(extractMessage);
      });

      return OperationStatus.Success;
    } catch (err) {
      this.silent = false;
      context.collatedWriter.terminal.writeStderrLine(
        `Unpack "${integrity}" to "${targetFolder}" failed with: ${err.toString()}`
      );
      return OperationStatus.Failure;
    } finally {
      this.data.tarball = undefined;

      if (worker) {
        this._pool.ref.checkinWorker(worker);
      }

      if (--this._pool.count === 0) {
        await this._pool.ref.finishAsync();
      }
    }
  }
}
