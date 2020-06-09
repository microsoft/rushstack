// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { minifySingleFile } from '../terser/MinifySingleFile';
import { MinifyOptions } from 'terser';
import { parentPort, workerData } from 'worker_threads';
import { IModuleMinificationRequest, IModuleMinificationResult } from '../ModuleMinifierPlugin.types';

const terserOptions: MinifyOptions = workerData;

// Set to non-zero to help debug unexpected graceful exit
process.exitCode = 2;

parentPort!.on('message', (message: IModuleMinificationRequest) => {
  if (!message) {
    process.exit(0);
  }

  const result: IModuleMinificationResult = minifySingleFile(message, terserOptions);

  parentPort!.postMessage(result);
});
