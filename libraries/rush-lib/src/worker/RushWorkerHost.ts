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
 * @alpha
 */
export interface IPhasedCommandWorkerOptions {
  /**
   * The working directory
   */
  cwd?: string;

  /**
   * Status update callback
   */
  onStatusUpdate?: IPhasedCommandWorkerController['onStatusUpdate'];
}

/**
 * Creates a Worker than runs the phased commands indicated by `args`, e.g. `build --production`.
 * Do not pass selection parameters (--to, --from, etc.), as scoping is handled later.
 *
 * @param args - The command line arguments for the worker, including the command name and any parameters.
 * @param options - Configuration for the worker
 *
 * @alpha
 */
export function createPhasedCommandWorker(
  args: string[],
  options?: IPhasedCommandWorkerOptions
): IPhasedCommandWorkerController {
  const {
    cwd,
    onStatusUpdate = () => {
      // Noop
    }
  } = options ?? {};

  const statusByOperation: Map<string, ITransferableOperationStatus> = new Map();
  let resolveGraph: (operations: ITransferableOperation[]) => void;
  const graphPromise: Promise<ITransferableOperation[]> = new Promise((resolve) => {
    resolveGraph = resolve;
  });

  let resolveReady: () => void;
  let readyPromise: Promise<void> = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });

  let resolveActiveGraph: (graph: ITransferableOperationStatus[]) => void;
  let activeGraphPromise: Promise<ITransferableOperationStatus[]> = new Promise<
    ITransferableOperationStatus[]
  >((resolve) => {
    resolveActiveGraph = resolve;
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
      argv: args,
      cwd
    },
    stdout: true
  });

  let exited: boolean = false;
  const exitPromise: Promise<void> = once(worker, 'exit').then(() => {
    exited = true;
  });

  function checkExited(): void {
    if (exited) {
      throw new Error(`Worker has exited!`);
    }
  }

  const controller: IPhasedCommandWorkerController = {
    onStatusUpdate,

    async updateAsync(operations: ITransferableOperation[]): Promise<ITransferableOperationStatus[]> {
      await this.readyAsync();
      checkExited();
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
      activeGraphPromise = new Promise<ITransferableOperationStatus[]>((resolve) => {
        resolveActiveGraph = resolve;
      });
      worker.postMessage(buildMessage);
      const statuses: ITransferableOperationStatus[] | void = await Promise.race([
        exitPromise,
        activeGraphPromise
      ]);
      if (!statuses) {
        throw new Error(`Worker has exited!`);
      }
      return statuses;
    },

    async getGraphAsync(): Promise<ITransferableOperation[]> {
      const results: void | ITransferableOperation[] = await Promise.race([exitPromise, graphPromise]);
      if (!results) {
        throw new Error(`Worker has exited!`);
      }
      return results;
    },

    async readyAsync(): Promise<void> {
      await Promise.race([exitPromise, readyPromise]);
    },
    async abortAsync(): Promise<void> {
      if (exited) {
        return;
      }
      worker.postMessage(abortMessage);
      await this.readyAsync();
    },
    async shutdownAsync(): Promise<void> {
      if (exited) {
        return;
      }
      worker.postMessage(shutdownMessage);
      await exitPromise;
    }
  };

  function handleMessage(message: IRushWorkerResponse): void {
    switch (message.type) {
      case 'graph':
        resolveGraph(message.value.operations);
        break;
      case 'activeGraph':
        resolveActiveGraph(message.value.operations);
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

  return controller;
}
