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
export interface IRushWorkerReadyMessage {
  type: 'ready';
  value: {};
}
export type IRushWorkerResponse =
  | IRushWorkerOperationMessage
  | IRushWorkerGraphMessage
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

/**
 * Interface for controlling a phased command worker. The worker internally tracks the most recent state of the underlying command,
 * so that each call to `updateAsync` only needs to perform operations for which the last inputs are stale.
 * @alpha
 */
export interface IPhasedCommandWorkerController {
  /**
   * Ensures that the specified operations are built and up to date.
   * @param operations - The operations to build.
   * @returns The results of all operations that were built in the process.
   */
  updateAsync(operations: ITransferableOperation[]): Promise<ITransferableOperationStatus[]>;
  /**
   * After the worker initializes, returns the list of all operations that are defined for the
   * command the worker was initialzed with.
   *
   * @returns The list of known operations in the command for which this worker was initialized.
   */
  getGraphAsync(): Promise<ITransferableOperation[]>;
  /**
   * Overrideable, event handler for operation status changes.
   */
  onStatusUpdate: (operationStatus: ITransferableOperationStatus) => void;
  /**
   * Aborts the current build.
   * @returns A promise that resolves when the worker has aborted.
   */
  abortAsync(): Promise<void>;
  /**
   * Waits for the worker to be ready to receive input.
   *
   * @returns A promise that resolves when the worker is ready for more input.
   */
  readyAsync(): Promise<void>;
  /**
   * Aborts and shuts down the worker.
   *
   * @returns A promise that resolves when the worker has shut down.
   */
  shutdownAsync(): Promise<void>;
}
