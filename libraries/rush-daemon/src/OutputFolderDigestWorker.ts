// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parentPort, workerData } from 'node:worker_threads';

import { serveOutputFolderDigestJobs, type IOutputFolderDigestWorkerData } from './OutputFolderDigestPool';

// The entry point of each OutputFolderDigestPool worker.
if (parentPort) {
  serveOutputFolderDigestJobs(parentPort, (workerData as IOutputFolderDigestWorkerData).resultPort);
}
