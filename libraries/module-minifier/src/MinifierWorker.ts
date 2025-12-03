// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parentPort, workerData } from 'node:worker_threads';

import type { MinifyOptions } from 'terser';

import { minifySingleFileAsync } from './MinifySingleFile';
import type { IModuleMinificationRequest, IModuleMinificationResult } from './types';

const terserOptions: MinifyOptions = workerData;

// Set to non-zero to help debug unexpected graceful exit
process.exitCode = 2;

async function handler(message: IModuleMinificationRequest): Promise<void> {
  if (!message) {
    parentPort!.off('postMessage', handler);
    parentPort!.close();
    return;
  }

  const result: IModuleMinificationResult = await minifySingleFileAsync(message, terserOptions);

  parentPort!.postMessage(result);
}

parentPort!.once('close', () => {
  process.exitCode = 0;
});
parentPort!.on('message', handler);
