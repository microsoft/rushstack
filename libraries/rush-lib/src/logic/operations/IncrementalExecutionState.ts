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
  getBlockReasonAsync(): Promise<string | undefined>;
  /**
   * Called after the incremental command succeeded. Returns `undefined` if its outputs can be kept, otherwise why
   * the initial command must run as well, as a clause that completes "Running the initial command, because ...".
   */
  verifyIncrementalResultAsync(): Promise<string | undefined>;
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
}

// Both maps are keyed by the execution record, which is the runner's context and the hooks' argument.
const guardByRecord: WeakMap<object, IIncrementalExecutionGuard> = new WeakMap();
const commandExecutionByRecord: WeakMap<object, ICommandExecution> = new WeakMap();

export function setIncrementalExecutionGuard(record: object, guard: IIncrementalExecutionGuard): void {
  guardByRecord.set(record, guard);
}

export function getIncrementalExecutionGuard(record: object): IIncrementalExecutionGuard | undefined {
  return guardByRecord.get(record);
}

/**
 * Records which command a runner is about to execute for an execution record. Call it before starting the command,
 * so that the outputs of a command that fails or is aborted are attributed to it too.
 */
export function setCommandExecution(record: object, execution: ICommandExecution): void {
  commandExecutionByRecord.set(record, execution);
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
