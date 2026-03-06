// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types="node" preserve="true" />

/**
 * A lightweight worker pool implementation using the NodeJS `worker_threads` API.
 *
 * @packageDocumentation
 */

export type { IWorkerPoolOptions } from './WorkerPool.ts';
export { WORKER_ID_SYMBOL, WorkerPool } from './WorkerPool.ts';
