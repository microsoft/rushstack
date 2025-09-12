// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { MessagePort, Worker } from 'node:worker_threads';
import type { IZipSyncOptions } from './zipSync';
import type { IWorkerToHostMessage, IZipSyncCommandMessage } from './zipSyncWorker';

type IZipSyncResult = ReturnType<typeof import('./zipSync').zipSync>;

export async function zipSyncWorkerAsync(options: IZipSyncOptions): Promise<IZipSyncResult> {
  const { parentPort: rawParentPort, Worker } = await import('node:worker_threads');
  if (!rawParentPort) {
    throw new Error('This module must be run in a worker thread.');
  }
  const parentPort: MessagePort = rawParentPort;

  return new Promise<IZipSyncResult>((resolve, reject) => {
    const worker: Worker = new Worker(require.resolve('./zipSyncWorker'));

    worker.on('message', (message: IWorkerToHostMessage) => {
      switch (message.type) {
        case 'zipsync': {
          resolve(message.result);
          break;
        }
        case 'error': {
          const error: Error = new Error(message.args.message);
          error.stack = message.args.stack;
          reject(error);
          break;
        }
        default: {
          const exhaustiveCheck: never = message;
          throw new Error(`Unexpected message type: ${JSON.stringify(exhaustiveCheck)}`);
        }
      }
    });

    worker.on('error', (err) => {
      reject(err);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });

    const commandMessage: IZipSyncCommandMessage = {
      type: 'zipsync',
      id: 0,
      options
    };
    worker.postMessage(commandMessage);

    parentPort.on('close', () => {
      worker.postMessage(false);
    });
  });
}
