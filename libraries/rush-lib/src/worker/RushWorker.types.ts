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

/**
 * @alpha
 */
export interface ITransferableOperationStatus {
  operation: ITransferableOperation;

  status: OperationStatus;
  hash: string | undefined;
  duration: number;
}

export interface IRushWorkerOperationMessage {
  type: 'operation';
  value: ITransferableOperationStatus;
}
export interface IRushWorkerGraphMessage {
  type: 'graph';
  value: { operations: ITransferableOperation[] };
}
export interface IRushWorkerActiveGraphMessage {
  type: 'activeGraph';
  value: { operations: ITransferableOperationStatus[] };
}
export interface IRushWorkerReadyMessage {
  type: 'ready';
  value: {};
}
export type IRushWorkerResponse =
  | IRushWorkerOperationMessage
  | IRushWorkerGraphMessage
  | IRushWorkerActiveGraphMessage
  | IRushWorkerReadyMessage;

export interface IRushWorkerBuildMessage {
  type: 'build';
  value: { targets: string[] };
}
export interface IRushWorkerAbortMessage {
  type: 'abort';
  value: {};
}
export interface IRushWorkerShutdownMessage {
  type: 'shutdown';
  value: {};
}
export type IRushWorkerRequest =
  | IRushWorkerBuildMessage
  | IRushWorkerAbortMessage
  | IRushWorkerShutdownMessage;

export type PhasedCommandWorkerState =
  | 'initializing'
  | 'waiting'
  | 'updating'
  | 'executing'
  | 'aborting'
  | 'exiting'
  | 'exited';
