// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import process from 'node:process';

import { OperationStatus } from '@microsoft/rush-lib';

import {
  createPhasedCommandResult,
  type IPhasedOperationOutcome,
  parseWarningsAllowedByEnvironment
} from '../CommandResultPolicy';

interface IParityCase {
  readonly aborted?: boolean;
  readonly expectedExitCode: number;
  readonly expectedOutcome: 'success' | 'success-with-warning' | 'failure' | 'aborted';
  readonly graphStatus?: OperationStatus;
  readonly scheduled?: boolean;
  readonly statuses: ReadonlyArray<{
    readonly status: OperationStatus;
    readonly warningsAreAllowed?: boolean;
  }>;
  readonly warningEnvironment?: string;
}

const PARITY_CASES: ReadonlyArray<IParityCase> = [
  { expectedExitCode: 0, expectedOutcome: 'success', statuses: [status(OperationStatus.Success)] },
  { expectedExitCode: 0, expectedOutcome: 'success', statuses: [status(OperationStatus.Skipped)] },
  { expectedExitCode: 0, expectedOutcome: 'success', statuses: [status(OperationStatus.FromCache)] },
  { expectedExitCode: 0, expectedOutcome: 'success', statuses: [status(OperationStatus.NoOp)] },
  {
    expectedExitCode: 1,
    expectedOutcome: 'success-with-warning',
    statuses: [status(OperationStatus.SuccessWithWarning)]
  },
  {
    expectedExitCode: 0,
    expectedOutcome: 'success-with-warning',
    graphStatus: OperationStatus.Success,
    statuses: [status(OperationStatus.SuccessWithWarning, true)]
  },
  {
    expectedExitCode: 0,
    expectedOutcome: 'success-with-warning',
    statuses: [status(OperationStatus.SuccessWithWarning)],
    warningEnvironment: '1'
  },
  {
    expectedExitCode: 0,
    expectedOutcome: 'success-with-warning',
    graphStatus: OperationStatus.Success,
    statuses: [status(OperationStatus.SuccessWithWarning, true)],
    warningEnvironment: '0'
  },
  { expectedExitCode: 1, expectedOutcome: 'failure', statuses: [status(OperationStatus.Failure)] },
  { expectedExitCode: 1, expectedOutcome: 'failure', statuses: [status(OperationStatus.Blocked)] },
  {
    aborted: true,
    expectedExitCode: 1,
    expectedOutcome: 'aborted',
    statuses: [status(OperationStatus.Aborted)]
  },
  {
    aborted: true,
    expectedExitCode: 1,
    expectedOutcome: 'failure',
    graphStatus: OperationStatus.Failure,
    statuses: [status(OperationStatus.Failure), status(OperationStatus.Aborted)]
  },
  {
    expectedExitCode: 0,
    expectedOutcome: 'success',
    scheduled: false,
    statuses: [status(OperationStatus.Failure)]
  }
];

describe('Rush command result parity', () => {
  it.each(PARITY_CASES)('matches the in-process outcome for %#', (testCase: IParityCase) => {
    const operationOutcomes: IPhasedOperationOutcome[] = testCase.statuses.map(
      ({ status: operationStatus, warningsAreAllowed = false }, index: number) => ({
        observedInCurrentIteration: true,
        result: { operationId: `operation-${index}`, status: operationStatus },
        warningsAreAllowed
      })
    );

    const result = createPhasedCommandResult({
      aborted: testCase.aborted ?? false,
      error: undefined,
      graphStatus:
        testCase.graphStatus ??
        testCase.statuses[testCase.statuses.length - 1]?.status ??
        OperationStatus.NoOp,
      operationOutcomes,
      requestId: 'parity',
      scheduled: testCase.scheduled ?? true,
      warningsAllowedByEnvironment: parseWarningsAllowedByEnvironment({
        RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD: testCase.warningEnvironment ?? ''
      })
    });

    expect(result).toMatchObject({
      exitCode: testCase.expectedExitCode,
      outcome: testCase.expectedOutcome
    });
  });

  it('rejects an invalid warnings override like EnvironmentConfiguration', () => {
    expect(() =>
      parseWarningsAllowedByEnvironment({ RUSH_ALLOW_WARNINGS_IN_SUCCESSFUL_BUILD: 'true' })
    ).toThrow('must be set to 1 or 0');
  });

  it('uses platform environment-name semantics for the warnings override', () => {
    const lowercaseEnvironmentName: string = 'rush_allow_warnings_in_successful_build';
    expect(
      parseWarningsAllowedByEnvironment({ [lowercaseEnvironmentName]: '1' })
    ).toBe(process.platform === 'win32');
  });

  it('ignores a retained warning when the current incremental iteration succeeds', () => {
    const result = createPhasedCommandResult({
      aborted: false,
      error: undefined,
      graphStatus: OperationStatus.Success,
      operationOutcomes: [
        {
          observedInCurrentIteration: false,
          result: { operationId: 'retained-warning', status: OperationStatus.SuccessWithWarning },
          warningsAreAllowed: false
        },
        {
          observedInCurrentIteration: true,
          result: { operationId: 'current-success', status: OperationStatus.Success },
          warningsAreAllowed: false
        }
      ],
      requestId: 'incremental',
      scheduled: true,
      warningsAllowedByEnvironment: false
    });

    expect(result).toMatchObject({ exitCode: 0, outcome: 'success' });
    expect(result.operationResults).toEqual([
      { operationId: 'retained-warning', status: OperationStatus.SuccessWithWarning },
      { operationId: 'current-success', status: OperationStatus.Success }
    ]);
  });
});

function status(
  operationStatus: OperationStatus,
  warningsAreAllowed: boolean = false
): { readonly status: OperationStatus; readonly warningsAreAllowed: boolean } {
  return { status: operationStatus, warningsAreAllowed };
}
