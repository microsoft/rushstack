// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { MinifyOptions } from 'terser';
import { parentPort, workerData } from 'worker_threads';

import { minifySingleFileAsync } from './MinifySingleFile';
import type { IModuleMinificationRequest, IModuleMinificationResult } from './types';

const terserOptions: MinifyOptions = workerData;

// Set to non-zero to help debug unexpected graceful exit
process.exitCode = 2;

parentPort!.on('message', async (message: IModuleMinificationRequest) => {
  if (!message) {
    process.exit(0);
  }

  const result: IModuleMinificationResult = await minifySingleFileAsync(message, terserOptions);

  parentPort!.postMessage(result);
});
