// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parentPort as rawParentPort, type MessagePort } from 'node:worker_threads';

import { Terminal } from '@rushstack/terminal/lib/Terminal';
import { StringBufferTerminalProvider } from '@rushstack/terminal/lib/StringBufferTerminalProvider';

import { type IZipSyncUnpackOptions, type IZipSyncUnpackResult, unpack } from './unpack';
import { defaultBufferSize } from './zipSyncUtils';

export { type IZipSyncUnpackOptions, type IZipSyncUnpackResult } from './unpack';

export interface IHashWorkerData {
  basePath: string;
}

export interface IZipSyncUnpackCommandMessage {
  type: 'zipsync-unpack';
  id: number;
  options: Omit<IZipSyncUnpackOptions, 'terminal'>;
}

export interface IZipSyncUnpackWorkerResult {
  zipSyncReturn: IZipSyncUnpackResult;
  zipSyncLogs: string;
}

interface IZipSyncUnpackSuccessMessage {
  id: number;
  type: 'zipsync-unpack';
  result: IZipSyncUnpackWorkerResult;
}

export interface IZipSyncUnpackErrorMessage {
  type: 'error';
  id: number;
  args: {
    message: string;
    stack: string;
    zipSyncLogs: string;
  };
}

export type IHostToWorkerMessage = IZipSyncUnpackCommandMessage;
export type IWorkerToHostMessage = IZipSyncUnpackSuccessMessage | IZipSyncUnpackErrorMessage;

if (!rawParentPort) {
  throw new Error('This module must be run in a worker thread.');
}
const parentPort: MessagePort = rawParentPort;

let outputBuffer: Buffer<ArrayBuffer> | undefined = undefined;

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
      case 'zipsync-unpack': {
        const { options } = message;
        if (!outputBuffer) {
          outputBuffer = Buffer.allocUnsafeSlow(defaultBufferSize);
        }

        const successMessage: IZipSyncUnpackSuccessMessage = {
          type: message.type,
          id: message.id,
          result: {
            zipSyncReturn: unpack({ ...options, terminal, outputBuffer }),
            zipSyncLogs: terminalProvider.getOutput()
          }
        };
        return parentPort.postMessage(successMessage);
      }
    }
  } catch (err) {
    const errorMessage: IZipSyncUnpackErrorMessage = {
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
