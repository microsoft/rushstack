// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parentPort as rawParentPort, type MessagePort } from 'node:worker_threads';
import { type IZipSyncOptions, zipSync } from './zipSync';
import { Terminal } from '@rushstack/terminal/lib/Terminal';
import { StringBufferTerminalProvider } from '@rushstack/terminal/lib/StringBufferTerminalProvider';

export interface IHashWorkerData {
  basePath: string;
}

export interface IZipSyncCommandMessage {
  type: 'zipsync';
  id: number;
  options: Omit<IZipSyncOptions, 'terminal'>;
}

interface IZipSyncSuccessMessage {
  id: number;
  type: 'zipsync';
  result: {
    zipSyncReturn: ReturnType<typeof zipSync>;
    zipSyncLogs: string;
  };
}

export interface IErrorMessage {
  type: 'error';
  id: number;
  args: {
    message: string;
    stack: string;
  };
}

export type IHostToWorkerMessage = IZipSyncCommandMessage;
export type IWorkerToHostMessage = IZipSyncSuccessMessage | IErrorMessage;

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

  try {
    switch (message.type) {
      case 'zipsync': {
        const { options } = message;

        const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
        const terminal: Terminal = new Terminal(terminalProvider);

        const successMessage: IZipSyncSuccessMessage = {
          type: message.type,
          id: message.id,
          result: {
            zipSyncReturn: zipSync({ ...options, terminal }),
            zipSyncLogs: terminalProvider.getOutput()
          }
        };
        return parentPort.postMessage(successMessage);
      }
    }
  } catch (err) {
    const errorMessage: IErrorMessage = {
      type: 'error',
      id: message.id,
      args: {
        message: (err as Error).message,
        stack: (err as Error).stack || ''
      }
    };
    parentPort.postMessage(errorMessage);
  }
}

parentPort.on('message', handleMessage);
