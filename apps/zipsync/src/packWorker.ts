// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parentPort as rawParentPort, type MessagePort } from 'node:worker_threads';

import { Terminal } from '@rushstack/terminal/lib/Terminal';
import { StringBufferTerminalProvider } from '@rushstack/terminal/lib/StringBufferTerminalProvider';

import { type IZipSyncPackOptions, type IZipSyncPackResult, pack } from './pack';

export { type IZipSyncPackOptions, type IZipSyncPackResult } from './pack';

export interface IHashWorkerData {
  basePath: string;
}

export interface IZipSyncPackCommandMessage {
  type: 'zipsync-pack';
  id: number;
  options: Omit<IZipSyncPackOptions, 'terminal'>;
}

export interface IZipSyncPackWorkerResult {
  zipSyncReturn: IZipSyncPackResult;
  zipSyncLogs: string;
}

interface IZipSyncSuccessMessage {
  id: number;
  type: 'zipsync-pack';
  result: IZipSyncPackWorkerResult;
}

export interface IZipSyncPackErrorMessage {
  type: 'error';
  id: number;
  args: {
    message: string;
    stack: string;
    zipSyncLogs: string;
  };
}

export type IHostToWorkerMessage = IZipSyncPackCommandMessage;
export type IWorkerToHostMessage = IZipSyncSuccessMessage | IZipSyncPackErrorMessage;

if (!rawParentPort) {
  throw new Error('This module must be run in a worker thread.');
}
const parentPort: MessagePort = rawParentPort;

function handleMessage(message: IHostToWorkerMessage | false): void {
  if (message === false) {
    parentPort.removeAllListeners();
    parentPort.close();
    return;
  }

  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);

  try {
    switch (message.type) {
      case 'zipsync-pack': {
        const { options } = message;

        const successMessage: IZipSyncSuccessMessage = {
          type: message.type,
          id: message.id,
          result: {
            zipSyncReturn: pack({ ...options, terminal }),
            zipSyncLogs: terminalProvider.getOutput()
          }
        };
        return parentPort.postMessage(successMessage);
      }
    }
  } catch (err) {
    const errorMessage: IZipSyncPackErrorMessage = {
      type: 'error',
      id: message.id,
      args: {
        message: (err as Error).message,
        stack: (err as Error).stack || '',
        zipSyncLogs: terminalProvider.getOutput()
      }
    };
    parentPort.postMessage(errorMessage);
  }
}

parentPort.on('message', handleMessage);
