// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { IPackageJson } from '@rushstack/node-core-library';

import type { IPnpmfileModule, IReadPackageContext } from './IPnpmfileModule';

export interface IRequestMessage {
  id: number;
  packageJson: IPackageJson;
  packageJsonFullPath: string;
}

export interface IResponseMessageLog {
  kind: 'log';
  id: number;
  log: string;
}
export interface IResponseMessageError {
  kind: 'error';
  id: number;
  error: string;
}
export interface IResponseMessageReturn {
  kind: 'return';
  id: number;
  result?: unknown;
}
export type ResponseMessage = IResponseMessageLog | IResponseMessageError | IResponseMessageReturn;

// debugger;

const { pnpmfilePath } = workerData;
const resolvedPath: string = path.resolve(pnpmfilePath);

let pnpmfileModule: IPnpmfileModule | undefined = undefined;
let pnpmfileModuleError: Error | undefined = undefined;

try {
  pnpmfileModule = require(resolvedPath);
} catch (error) {
  pnpmfileModuleError = error;
}

// eslint-disable-next-line @rushstack/no-new-null
const threadParentPort: null | MessagePort = parentPort;

if (!threadParentPort) {
  throw new Error('Not running in a worker thread');
}

threadParentPort.on('message', async (message: IRequestMessage) => {
  const { id, packageJson } = message;

  if (pnpmfileModuleError) {
    threadParentPort.postMessage({
      kind: 'error',
      id,
      error: pnpmfileModuleError.message
    } satisfies IResponseMessageError);
    return;
  }

  try {
    if (!pnpmfileModule || !pnpmfileModule.hooks || typeof pnpmfileModule.hooks.readPackage !== 'function') {
      // No transformation needed
      threadParentPort.postMessage({
        kind: 'return',
        id,
        result: packageJson
      } satisfies IResponseMessageReturn);
      return;
    }

    const pnpmContext: IReadPackageContext = {
      log: (logMessage) =>
        threadParentPort.postMessage({
          kind: 'log',
          id,
          log: logMessage
        } satisfies IResponseMessageLog)
    };

    const result: IPackageJson = await pnpmfileModule.hooks.readPackage({ ...packageJson }, pnpmContext);

    threadParentPort.postMessage({ kind: 'return', id, result } satisfies IResponseMessageReturn);
  } catch (e) {
    threadParentPort.postMessage({
      kind: 'error',
      id,
      error: (e as Error).message
    } satisfies IResponseMessageError);
  }
});
