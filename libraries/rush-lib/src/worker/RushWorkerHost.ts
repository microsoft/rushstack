// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { Worker } from 'worker_threads';
import {
  IRushWorkerAbortMessage,
  IRushWorkerBuildMessage,
  IRushWorkerResponse,
  IRushWorkerShutdownMessage,
  ITransferableOperation,
  ITransferableOperationStatus,
  IPhasedCommandWorkerController
} from './RushWorker.types';
import { once } from 'events';

/**
 * Creates a Worker than runs the phased commands indicated by `args`, e.g. `build --production`.
 * Do not pass selection parameters (--to, --from, etc.), as scoping is handled later.
 *
 * @param args - The command line arguments for the worker, including the command name and any parameters.
 *
 * @alpha
 */
export async function createPhasedCommandWorker(
  args: string[],
  onStatusUpdate?: (operationStatus: ITransferableOperationStatus) => void
): Promise<IPhasedCommandWorkerController> {
  const statusByOperation: Map<string, ITransferableOperationStatus> = new Map();
  let resolveGraph: (operations: ITransferableOperation[]) => void;
  const graphPromise: Promise<ITransferableOperation[]> = new Promise((resolve) => {
    resolveGraph = resolve;
  });

  let resolveReady: () => void;
  let readyPromise: Promise<void> = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  const abortMessage: IRushWorkerAbortMessage = {
    type: 'abort',
    value: {}
  };
  const shutdownMessage: IRushWorkerShutdownMessage = {
    type: 'shutdown',
    value: {}
  };

  const workerPath: string = path.resolve(__dirname, 'RushWorkerEntry.js');
  const worker: Worker = new Worker(workerPath, {
    workerData: {
      argv: args
    },
    stdout: true,
    stderr: true
  });

  const controller: IPhasedCommandWorkerController = {
    async updateAsync(operations: ITransferableOperation[]): Promise<ITransferableOperationStatus[]> {
      await this.readyAsync();
      const targets: string[] = [];
      for (const operation of operations) {
        const { project, phase } = operation;
        if (project && phase) {
          targets.push(`${project};${phase}`);
        }
      }
      const buildMessage: IRushWorkerBuildMessage = {
        type: 'build',
        value: {
          targets
        }
      };
      // eslint-disable-next-line require-atomic-updates
      readyPromise = new Promise<void>((resolve) => {
        resolveReady = resolve;
      });
      worker.postMessage(buildMessage);
      await this.readyAsync();
      return Array.from(statusByOperation.values());
    },
    getGraphAsync(): Promise<ITransferableOperation[]> {
      return graphPromise;
    },
    onStatusUpdate:
      onStatusUpdate ??
      ((operationStatus: ITransferableOperationStatus): void => {
        // Default do nothing.
      }),
    async abortAsync(): Promise<void> {
      worker.postMessage(abortMessage);
      await readyPromise;
    },
    async readyAsync(): Promise<void> {
      await readyPromise;
    },
    async shutdownAsync(): Promise<void> {
      worker.postMessage(shutdownMessage);
      await once(worker, 'exit');
    }
  };

  function handleMessage(message: IRushWorkerResponse): void {
    switch (message.type) {
      case 'graph':
        resolveGraph(message.value.operations);
        break;
      case 'ready':
        resolveReady();
        break;
      case 'operation':
        statusByOperation.set(message.value.operation.name!, message.value);
        controller.onStatusUpdate(message.value);
        break;
    }
  }

  worker.on('message', handleMessage);

  await controller.readyAsync();

  return controller;
}
