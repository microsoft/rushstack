// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IProfileSummary } from './types.ts';

/**
 * A message sent to a worker to process a file (or shutdown).
 */
export type IMessageToWorker = string | false;

/**
 * A message sent from a worker to the main thread on success.
 */
export interface IWorkerSuccessMessage {
  type: 'success';
  /**
   * The file requested to be processed.
   */
  file: string;
  /**
   * The summary of the profile data.
   */
  data: IProfileSummary;
}

/**
 * A message sent from a worker to the main thread on error.
 */
export interface IWorkerErrorMessage {
  type: 'error';
  /**
   * The file requested to be processed.
   */
  file: string;
  /**
   * The error stack trace or message.
   */
  data: string;
}

/**
 * A message sent from a worker to the main thread.
 */
export type IMessageFromWorker = IWorkerSuccessMessage | IWorkerErrorMessage;
