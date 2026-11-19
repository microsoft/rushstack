// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The reason with which the Rush daemon invalidates operations whose inputs changed. The incremental execution
 * guard compares the inputs itself, so such an invalidation keeps the last successful run of an operation as the
 * base for its next run. Every other invalidation forgets the base of the operations that it invalidates.
 *
 * @remarks
 * The Rush daemon only imports types from Rush, so it repeats this value.
 */
export const INPUTS_CHANGED_INVALIDATION_REASON: 'workspace-inputs-changed' = 'workspace-inputs-changed';

/**
 * The reason with which a long-lived host invalidates every operation after a native Rush command ran in the
 * workspace. That command may have replaced the outputs of any operation, including those that were already
 * invalidated, so the incremental execution guard forgets every base.
 */
export const NATIVE_COMMAND_INVALIDATION_REASON: 'native-command-completed' = 'native-command-completed';

/**
 * Options that an operation runner passes to its {@link IIncrementalExecutionGuard}.
 *
 * @beta
 */
export interface IIncrementalExecutionGuardOptions {
  /**
   * Set by a runner whose incremental runs keep the previous build in memory, such as a watch-mode bundler in a
   * warm worker. Outputs that look like bundles then do not require the initial command. If an incremental run
   * changes which output files exist, that run is still followed by the initial command, but later runs of the
   * operation may use the incremental command again, unless the run added or removed a content-hashed file.
   * Defaults to false.
   */
  readonly outputsMayBeBundles?: boolean;
}

/**
 * Decides whether an operation may run its `:incremental` command outside watch mode.
 * The Rush daemon registers one for each execution record. Runners get it from
 * {@link IOperationRunnerContext.getIncrementalExecutionGuard}.
 *
 * @beta
 */
export interface IIncrementalExecutionGuard {
  /**
   * Returns `undefined` if the incremental command may run, otherwise why it may not, as a clause that completes
   * "Not using the incremental command because ...", e.g. `its command line changed`.
   */
  getBlockReasonAsync(options?: IIncrementalExecutionGuardOptions): Promise<string | undefined>;
  /**
   * Called after the incremental command succeeded. Returns `undefined` if its outputs can be kept, otherwise why
   * the initial command must run as well, as a clause that completes "Running the initial command, because ...".
   */
  verifyIncrementalResultAsync(options?: IIncrementalExecutionGuardOptions): Promise<string | undefined>;
}

/**
 * The name that rush-lib's own runners and plugins use for {@link IOperationCommandExecution}.
 */
export type ICommandExecution = IOperationCommandExecution;

/**
 * Which command an operation runner executed for an operation in one iteration.
 *
 * @beta
 */
export interface IOperationCommandExecution {
  /**
   * The command that produced the final outputs.
   */
  readonly kind: 'initial' | 'incremental';
  /**
   * Whether the runner has an incremental command that a later iteration could use.
   */
  readonly hasIncrementalCommand: boolean;
  /**
   * Whether the command ran in a process that keeps watching the operation's input files after the command
   * completed, to run the incremental command again, such as a warm worker. A watcher can miss changes in a folder
   * that was deleted and recreated, so the next incremental run then requires that none of the folders that held
   * input files was deleted or recreated since this run started. Defaults to false.
   */
  readonly watchesInputs?: boolean;
}

// All are keyed by the execution record, which is the runner's context and the hooks' argument.
const guardByRecord: WeakMap<object, IIncrementalExecutionGuard> = new WeakMap();
const commandExecutionByRecord: WeakMap<object, ICommandExecution> = new WeakMap();
const watchedCommandCallbackByRecord: WeakMap<object, () => void> = new WeakMap();
const recordsWithoutCacheRead: WeakSet<object> = new WeakSet();

export function setIncrementalExecutionGuard(record: object, guard: IIncrementalExecutionGuard): void {
  guardByRecord.set(record, guard);
}

export function getIncrementalExecutionGuard(record: object): IIncrementalExecutionGuard | undefined {
  return guardByRecord.get(record);
}

export function clearIncrementalExecutionGuard(record: object): void {
  guardByRecord.delete(record);
  watchedCommandCallbackByRecord.delete(record);
}

/**
 * Sets a function that `setCommandExecution` calls for the execution record each time a runner records a command
 * that watches the input files, which it does before the command starts.
 */
export function setWatchedCommandCallback(record: object, callback: () => void): void {
  watchedCommandCallbackByRecord.set(record, callback);
}

/**
 * Records which command a runner is about to execute for an execution record. Call it before starting the command,
 * so that the outputs of a command that fails or is aborted are attributed to it too.
 */
export function setCommandExecution(record: object, execution: ICommandExecution): void {
  commandExecutionByRecord.set(record, execution);
  if (execution.watchesInputs) {
    watchedCommandCallbackByRecord.get(record)?.();
  }
}

export function getCommandExecution(record: object): ICommandExecution | undefined {
  return commandExecutionByRecord.get(record);
}

/**
 * Returns true if the outputs of this execution record were produced by an operation's incremental command.
 * Such outputs are never written to the build cache or recorded for legacy skip detection, and neither are the
 * outputs of consumers that were built against them.
 */
export function wasExecutedIncrementally(record: object): boolean {
  return commandExecutionByRecord.get(record)?.kind === 'incremental';
}

/**
 * Records that the runner of an execution record will run its incremental command without first trying to restore
 * the operation from the build cache, e.g. because a restore would replace the outputs that a warm worker built and
 * keeps in memory. Call it from a `beforeExecuteOperationAsync` tap that runs before `CacheableOperationPlugin`'s.
 */
export function skipBuildCacheRead(record: object): void {
  recordsWithoutCacheRead.add(record);
}

/**
 * Returns true if `skipBuildCacheRead` was called for the execution record.
 */
export function isBuildCacheReadSkipped(record: object): boolean {
  return recordsWithoutCacheRead.has(record);
}
