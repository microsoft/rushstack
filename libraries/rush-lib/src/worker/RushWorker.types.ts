// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IDiagnostic } from '@rushstack/terminal';
import { OperationStatus } from '../logic/operations/OperationStatus';

/**
 * @alpha
 */
export interface ITransferableOperation {
  name?: string;
  project?: string;
  phase?: string;

  logFilePath?: string;
}

export type { IDiagnostic };

/**
 * @alpha
 */
export interface ITransferableOperationStatus {
  operation: ITransferableOperation;

  status: OperationStatus;
  hash: string | undefined;
  duration: number;
  active: boolean;
  diagnostics?: IDiagnostic[];
}

export interface IRushWorkerOperationsMessage {
  type: 'operations';
  value: {
    operations: ITransferableOperationStatus[];
  };
}
export interface IRushWorkerGraphMessage {
  type: 'graph';
  value: { operations: ITransferableOperation[] };
}
export interface IRushWorkerReadyMessage {
  type: 'ready';
  value: {};
}
export type IRushWorkerResponse =
  | IRushWorkerOperationsMessage
  | IRushWorkerGraphMessage
  | IRushWorkerReadyMessage;

export interface IRushWorkerBuildMessage {
  type: 'build';
  value: { targets: string[] };
}
export interface IRushWorkerShutdownMessage {
  type: 'shutdown';
  value: {};
}
export type IRushWorkerRequest = IRushWorkerBuildMessage | IRushWorkerShutdownMessage;

export type PhasedCommandWorkerState =
  | 'initializing'
  | 'waiting'
  | 'updating'
  | 'executing'
  | 'exiting'
  | 'exited';
