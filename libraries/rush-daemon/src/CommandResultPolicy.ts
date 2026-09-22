// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { OperationStatus } from '@microsoft/rush-lib';
import { EnvironmentMap } from '@rushstack/node-core-library';
import type {
  DaemonCommandOutcome,
  IDaemonCommandResult,
  IDaemonPhasedOperationResult,
  IDaemonPhasedRequestResult
} from '@rushstack/rush-daemon-protocol';

export const RUSH_SUCCESS_EXIT_CODE: number = 0;
export const RUSH_FAILURE_EXIT_CODE: number = 1;
export const RUSH_ALLOW_WARNINGS_ENVIRONMENT_VARIABLE: string =
  'RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD';

export interface IPhasedOperationOutcome {
  readonly observedInCurrentIteration: boolean;
  readonly result: IDaemonPhasedOperationResult;
  readonly warningsAreAllowed: boolean;
}

export interface IPhasedCommandResultOptions {
  readonly aborted: boolean;
  readonly error: unknown;
  readonly graphStatus: OperationStatus;
  readonly operationOutcomes: ReadonlyArray<IPhasedOperationOutcome>;
  readonly requestId: string;
  readonly scheduled: boolean;
  readonly warningsAllowedByEnvironment: boolean;
}

const SUCCESS_STATUSES: ReadonlySet<string> = new Set([
  OperationStatus.Success,
  OperationStatus.Skipped,
  OperationStatus.FromCache,
  OperationStatus.NoOp
]);

export function parseWarningsAllowedByEnvironment(
  environment: Readonly<Record<string, string>>
): boolean {
  const value: string | undefined = new EnvironmentMap(environment).get(
    RUSH_ALLOW_WARNINGS_ENVIRONMENT_VARIABLE
  );
  if (value === undefined || value === '' || value === '0') {
    return false;
  }
  if (value === '1') {
    return true;
  }
  throw new Error(
    `The ${RUSH_ALLOW_WARNINGS_ENVIRONMENT_VARIABLE} environment variable must be set to 1 or 0.`
  );
}

export function createGlobalCommandResult(options: {
  readonly aborted: boolean;
  readonly error: unknown;
  readonly exitCode: number | undefined;
  readonly requestId: string;
}): IDaemonCommandResult {
  if (options.error !== undefined) {
    return createResult('failure', RUSH_FAILURE_EXIT_CODE, options.requestId, options.aborted, options.error);
  }
  if (options.aborted) {
    return createResult('aborted', RUSH_FAILURE_EXIT_CODE, options.requestId, true);
  }
  const exitCode: number = validateExitCode(options.exitCode);
  return createResult(
    exitCode === RUSH_SUCCESS_EXIT_CODE ? 'success' : 'failure',
    exitCode,
    options.requestId,
    false
  );
}

export function createPhasedCommandResult(
  options: IPhasedCommandResultOptions
): IDaemonPhasedRequestResult {
  const operationResults: ReadonlyArray<IDaemonPhasedOperationResult> = options.operationOutcomes.map(
    ({ result }) => result
  );
  if (options.error !== undefined) {
    return createPhasedResult('failure', RUSH_FAILURE_EXIT_CODE, options, operationResults);
  }
  const outcome: DaemonCommandOutcome = getPhasedOutcome(options);
  const warningsAllowed: boolean = options.operationOutcomes.every(
    ({ observedInCurrentIteration, result, warningsAreAllowed }) =>
      !observedInCurrentIteration ||
      result.status !== OperationStatus.SuccessWithWarning ||
      warningsAreAllowed ||
      options.warningsAllowedByEnvironment
  );
  const exitCode: number =
    outcome === 'success' || (outcome === 'success-with-warning' && warningsAllowed)
      ? RUSH_SUCCESS_EXIT_CODE
      : RUSH_FAILURE_EXIT_CODE;
  return createPhasedResult(outcome, exitCode, options, operationResults);
}

function getPhasedOutcome(options: IPhasedCommandResultOptions): DaemonCommandOutcome {
  if (!options.scheduled) {
    return options.aborted ? 'aborted' : 'success';
  }
  if (options.graphStatus === OperationStatus.Failure || options.graphStatus === OperationStatus.Blocked) {
    return 'failure';
  }
  if (options.graphStatus === OperationStatus.Aborted) {
    return 'aborted';
  }
  if (
    options.graphStatus === OperationStatus.SuccessWithWarning ||
    options.operationOutcomes.some(
      ({ observedInCurrentIteration, result }) =>
        observedInCurrentIteration && result.status === OperationStatus.SuccessWithWarning
    )
  ) {
    return 'success-with-warning';
  }
  if (SUCCESS_STATUSES.has(options.graphStatus)) {
    return 'success';
  }
  return 'failure';
}

function createPhasedResult(
  outcome: DaemonCommandOutcome,
  exitCode: number,
  options: IPhasedCommandResultOptions,
  operationResults: ReadonlyArray<IDaemonPhasedOperationResult>
): IDaemonPhasedRequestResult {
  return {
    aborted: options.aborted,
    errorMessage: normalizeErrorMessage(options.error),
    exitCode,
    operationResults,
    outcome,
    requestId: options.requestId,
    scheduled: options.scheduled
  };
}

function createResult(
  outcome: DaemonCommandOutcome,
  exitCode: number,
  requestId: string,
  aborted: boolean,
  error?: unknown
): IDaemonCommandResult {
  return { aborted, errorMessage: normalizeErrorMessage(error), exitCode, outcome, requestId };
}

function normalizeErrorMessage(error: unknown): string | undefined {
  if (error === undefined) {
    return undefined;
  }
  return error instanceof Error ? error.message : String(error);
}

function validateExitCode(exitCode: number | undefined): number {
  if (exitCode === undefined || !Number.isSafeInteger(exitCode) || exitCode < RUSH_SUCCESS_EXIT_CODE) {
    throw new Error('A global command executor must return a nonnegative safe-integer exit code.');
  }
  return exitCode;
}
