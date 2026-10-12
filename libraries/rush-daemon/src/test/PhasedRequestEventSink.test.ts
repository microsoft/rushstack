// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type {
  IDaemonEventEnvelope,
  IDaemonOperationStatusChangedPayload
} from '@rushstack/rush-daemon-protocol';
import { OperationStatus, type IOperationExecutionResult } from '@microsoft/rush-lib';
import {
  type ICommandExecution,
  setCommandExecution
} from '@microsoft/rush-lib/lib/logic/operations/IncrementalExecutionState';

import { PhasedRequestEventSink } from '../PhasedRequestEventSink';
import { TestPhasedRequestClient } from './PhasedRequestRouterTestUtilities';

const ACTIVE_OPERATION: string = 'project-a (_phase:test)';
const OTHER_OPERATION: string = 'project-b (_phase:test)';
const SECOND_ACTIVE_OPERATION: string = 'project-c (_phase:test)';

function createSink(client: TestPhasedRequestClient): PhasedRequestEventSink {
  return new PhasedRequestEventSink({
    activeOperationIds: new Set([ACTIVE_OPERATION]),
    client,
    getNextSequence: () => client.getNextEventSequence(),
    onWriteFailure: () => undefined,
    rushVersion: '5.178.1'
  });
}

it('forwards unscoped and active activity while filtering other operation activity', async () => {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  const sink: PhasedRequestEventSink = createSink(client);
  sink.onActivity('request summary');
  sink.onActivity('active detail', { operationId: ACTIVE_OPERATION });
  sink.onActivity('other detail', { operationId: OTHER_OPERATION });

  await sink.flushAsync();

  const activities: IDaemonEventEnvelope[] = client.writes
    .map(({ event }) => event)
    .filter(
      (event: IDaemonEventEnvelope | undefined): event is IDaemonEventEnvelope =>
        event?.type === 'activityChanged'
    );
  expect(activities.map(({ payload }) => payload)).toEqual([
    { stream: 'stdout', text: 'request summary' },
    { stream: 'stdout', text: 'active detail' }
  ]);
  expect(activities.map(({ scope }) => scope)).toEqual([undefined, { operationId: ACTIVE_OPERATION }]);
  expect(activities.every(({ required }) => required)).toBe(true);
});

function createRecord(operationId: string, status: OperationStatus): IOperationExecutionResult {
  return { operation: { name: operationId }, silent: false, status } as unknown as IOperationExecutionResult;
}

function createCompletionRecord(
  operationId: string,
  status: OperationStatus,
  isOperationCompleted: boolean
): IOperationExecutionResult {
  return {
    ...createRecord(operationId, status),
    isOperationCompleted
  } as unknown as IOperationExecutionResult;
}

function createSettlingSink(onSettled: () => void): PhasedRequestEventSink {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  return new PhasedRequestEventSink({
    activeOperationIds: new Set([ACTIVE_OPERATION, SECOND_ACTIVE_OPERATION]),
    client,
    getNextSequence: () => client.getNextEventSequence(),
    onActiveOperationsSettled: onSettled,
    onWriteFailure: () => undefined,
    rushVersion: '5.178.1'
  });
}

it('reports settlement once, after every scheduled active operation completed', () => {
  const onSettled: jest.Mock = jest.fn();
  const sink: PhasedRequestEventSink = createSettlingSink(onSettled);
  sink.onIterationScheduled([
    createRecord(ACTIVE_OPERATION, OperationStatus.Waiting),
    createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Ready),
    createRecord(OTHER_OPERATION, OperationStatus.Waiting)
  ]);

  sink.onOperationCompleted(createRecord(ACTIVE_OPERATION, OperationStatus.Success));
  sink.onOperationCompleted(createRecord(OTHER_OPERATION, OperationStatus.Success));
  expect(onSettled).not.toHaveBeenCalled();
  sink.onOperationCompleted(createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Failure));
  sink.onOperationCompleted(createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Failure));

  expect(onSettled).toHaveBeenCalledTimes(1);
});

it('does not report settlement when an active operation was aborted', () => {
  const onSettled: jest.Mock = jest.fn();
  const sink: PhasedRequestEventSink = createSettlingSink(onSettled);
  sink.onIterationScheduled([
    createRecord(ACTIVE_OPERATION, OperationStatus.Waiting),
    createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Waiting)
  ]);

  sink.onOperationCompleted(createRecord(ACTIVE_OPERATION, OperationStatus.Aborted));
  sink.onOperationCompleted(createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Success));

  expect(onSettled).not.toHaveBeenCalled();
});
it('points at the full log of failed operations and operations with warnings, and only those', async () => {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  const sink: PhasedRequestEventSink = createSink(client);
  const logFilePaths = { text: '/repo/project-a/rush-logs/project-a._phase_test.log' };
  for (const status of [
    OperationStatus.Executing,
    OperationStatus.Failure,
    OperationStatus.SuccessWithWarning,
    OperationStatus.Success
  ]) {
    const record: IOperationExecutionResult = {
      ...createRecord(ACTIVE_OPERATION, status),
      logFilePaths
    } as unknown as IOperationExecutionResult;
    sink.onOperationStatusChanged(record, OperationStatus.Ready);
  }

  await sink.flushAsync();

  const payloads: unknown[] = client.writes
    .map(({ event }) => event)
    .filter((event) => event?.type === 'operationStatusChanged')
    .map((event) => event?.payload);
  expect(payloads).toEqual([
    { operationId: ACTIVE_OPERATION, previousStatus: 'READY', status: 'EXECUTING' },
    {
      operationId: ACTIVE_OPERATION,
      previousStatus: 'READY',
      status: 'FAILURE',
      logFilePath: logFilePaths.text
    },
    {
      operationId: ACTIVE_OPERATION,
      previousStatus: 'READY',
      status: 'SUCCESS WITH WARNINGS',
      logFilePath: logFilePaths.text
    },
    { operationId: ACTIVE_OPERATION, previousStatus: 'READY', status: 'SUCCESS' }
  ]);
});

it('says which command failed or reported warnings, for an operation that has an incremental command', async () => {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  const sink: PhasedRequestEventSink = createSink(client);
  const incremental: ICommandExecution = { kind: 'incremental', hasIncrementalCommand: true };
  const cases: ReadonlyArray<[OperationStatus, ICommandExecution | undefined]> = [
    [OperationStatus.Failure, incremental],
    [OperationStatus.SuccessWithWarning, incremental],
    [OperationStatus.Failure, { kind: 'initial', hasIncrementalCommand: true }],
    // The runner has no incremental command, so the initial command is the only one.
    [OperationStatus.Failure, { kind: 'initial', hasIncrementalCommand: false }],
    // No command ran, or the runner does not report its command.
    [OperationStatus.Failure, undefined],
    [OperationStatus.Success, incremental],
    [OperationStatus.Executing, incremental]
  ];
  for (const [status, execution] of cases) {
    const record: IOperationExecutionResult = createRecord(ACTIVE_OPERATION, status);
    if (execution) {
      setCommandExecution(record, execution);
    }
    sink.onOperationStatusChanged(record, OperationStatus.Ready);
  }

  await sink.flushAsync();

  const payloads: IDaemonOperationStatusChangedPayload[] = client.writes
    .map(({ event }) => event)
    .filter((event) => event?.type === 'operationStatusChanged')
    .map((event) => event?.payload as IDaemonOperationStatusChangedPayload);
  expect(payloads.map(({ status, commandKind }) => [status, commandKind])).toEqual([
    ['FAILURE', 'incremental'],
    ['SUCCESS WITH WARNINGS', 'incremental'],
    ['FAILURE', 'initial'],
    ['FAILURE', undefined],
    ['FAILURE', undefined],
    ['SUCCESS', undefined],
    ['EXECUTING', undefined]
  ]);
  expect(payloads.filter((payload) => Object.keys(payload).includes('commandKind'))).toHaveLength(3);
});

const TARGET_OPERATION: string = 'project-a (_phase:test)';
const FAILED_OPERATION: string = 'project-b (_phase:test)';
const RUNNING_OPERATION: string = 'project-c (_phase:test)';
const QUEUED_OPERATION: string = 'project-d (_phase:test)';

function createEarlyFailureSink(onSettled: (unfinishedOperations: number) => void): PhasedRequestEventSink {
  const client: TestPhasedRequestClient = new TestPhasedRequestClient();
  return new PhasedRequestEventSink({
    activeOperationIds: new Set([TARGET_OPERATION, FAILED_OPERATION, RUNNING_OPERATION, QUEUED_OPERATION]),
    client,
    getNextSequence: () => client.getNextEventSequence(),
    onWriteFailure: () => undefined,
    rushVersion: '5.178.1',
    earlyFailure: { targetOperationIds: new Set([TARGET_OPERATION]), onSettled }
  });
}

function setStatus(record: IOperationExecutionResult, status: OperationStatus): void {
  (record as { status: OperationStatus }).status = status;
}

/** Schedules the records, then fails FAILED_OPERATION, which blocks the target while RUNNING_OPERATION runs. */
function failWhileRunning(
  sink: PhasedRequestEventSink,
  queued: IOperationExecutionResult,
  beforeFailure?: () => void
): void {
  const target: IOperationExecutionResult = createRecord(TARGET_OPERATION, OperationStatus.Waiting);
  const failed: IOperationExecutionResult = createRecord(FAILED_OPERATION, OperationStatus.Executing);
  sink.onIterationScheduled([
    target,
    failed,
    createRecord(RUNNING_OPERATION, OperationStatus.Executing),
    queued
  ]);
  beforeFailure?.();
  setStatus(failed, OperationStatus.Failure);
  sink.onOperationStatusChanged(failed, OperationStatus.Executing);
  // Blocked operations complete only when the iteration ends.
  setStatus(target, OperationStatus.Blocked);
  sink.onOperationCompleted(failed);
}

describe('the early failure offer', () => {
  it('counts the unfinished operations that are not silent', () => {
    const onSettled: jest.Mock = jest.fn();
    // Like a phase that the project does not define: the result does not list it while it is unfinished.
    const silent: IOperationExecutionResult = {
      ...createRecord(QUEUED_OPERATION, OperationStatus.Ready),
      silent: true
    } as IOperationExecutionResult;

    failWhileRunning(createEarlyFailureSink(onSettled), silent);

    expect(onSettled.mock.calls).toEqual([[1]]);
  });

  it('offers a failed result again when asked to, once it was offered and until the sink settles', () => {
    const onSettled: jest.Mock = jest.fn();
    const sink: PhasedRequestEventSink = createEarlyFailureSink(onSettled);
    sink.onIterationScheduled([
      createRecord(TARGET_OPERATION, OperationStatus.Blocked),
      createRecord(FAILED_OPERATION, OperationStatus.Failure),
      createRecord(RUNNING_OPERATION, OperationStatus.Executing),
      createRecord(QUEUED_OPERATION, OperationStatus.Success)
    ]);
    sink.reofferEarlyFailure();
    expect(onSettled).not.toHaveBeenCalled();

    sink.settleIfIdle();
    sink.reofferEarlyFailure();
    expect(onSettled.mock.calls).toEqual([[1], [1]]);

    sink.onOperationCompleted(createRecord(RUNNING_OPERATION, OperationStatus.Success));
    sink.reofferEarlyFailure();
    expect(onSettled.mock.calls).toEqual([[1], [1]]);
    expect(sink.activeOperationsSettled).toBe(true);
  });

  it('offers nothing once one of its operations was aborted, even before that operation completed', () => {
    const onSettled: jest.Mock = jest.fn();
    const queued: IOperationExecutionResult = createRecord(QUEUED_OPERATION, OperationStatus.Ready);

    // An aborted iteration marks the queued operations that it skips as aborted at once, but they complete only
    // when the iteration ends, after the operations that were already running.
    failWhileRunning(createEarlyFailureSink(onSettled), queued, () =>
      setStatus(queued, OperationStatus.Aborted)
    );

    expect(onSettled).not.toHaveBeenCalled();
  });
});

describe('a sink that subscribes to an iteration that is already executing', () => {
  it('settles at once when none of its operations is unfinished, and says it settled', () => {
    const onSettled: jest.Mock = jest.fn();
    const sink: PhasedRequestEventSink = createSettlingSink(onSettled);
    sink.onIterationScheduled([
      createRecord(ACTIVE_OPERATION, OperationStatus.Success),
      createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.FromCache),
      createRecord(OTHER_OPERATION, OperationStatus.Executing)
    ]);
    expect(sink.activeOperationsSettled).toBe(false);

    sink.settleIfIdle();
    sink.settleIfIdle();
    sink.onOperationCompleted(createRecord(ACTIVE_OPERATION, OperationStatus.Success));

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(sink.activeOperationsSettled).toBe(true);
    sink.onIterationScheduled([createRecord(ACTIVE_OPERATION, OperationStatus.Waiting)]);
    expect(sink.activeOperationsSettled).toBe(false);
  });

  it('waits for its unfinished operations to complete', () => {
    const onSettled: jest.Mock = jest.fn();
    const sink: PhasedRequestEventSink = createSettlingSink(onSettled);
    sink.onIterationScheduled([
      createRecord(ACTIVE_OPERATION, OperationStatus.Success),
      createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Executing)
    ]);

    sink.settleIfIdle();
    expect(onSettled).not.toHaveBeenCalled();
    expect(sink.activeOperationsSettled).toBe(false);
    sink.onOperationCompleted(createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Success));

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(sink.activeOperationsSettled).toBe(true);
  });

  it('waits for terminal statuses to emit completion before settling', () => {
    const onSettled: jest.Mock = jest.fn();
    const sink: PhasedRequestEventSink = createSettlingSink(onSettled);
    sink.onIterationScheduled([
      createCompletionRecord(ACTIVE_OPERATION, OperationStatus.Success, false),
      createCompletionRecord(SECOND_ACTIVE_OPERATION, OperationStatus.SuccessWithWarning, true)
    ]);

    sink.settleIfIdle();
    expect(onSettled).not.toHaveBeenCalled();
    expect(sink.activeOperationsSettled).toBe(false);
    sink.onOperationCompleted(createRecord(ACTIVE_OPERATION, OperationStatus.SuccessWithWarning));

    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(sink.activeOperationsSettled).toBe(true);
  });

  it('leaves the result of an aborted iteration to the batch', () => {
    const onSettled: jest.Mock = jest.fn();
    const sink: PhasedRequestEventSink = createSettlingSink(onSettled);
    sink.onIterationScheduled([
      createRecord(ACTIVE_OPERATION, OperationStatus.Success),
      createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Aborted)
    ]);

    sink.settleIfIdle();

    expect(onSettled).not.toHaveBeenCalled();
    expect(sink.activeOperationsSettled).toBe(false);
  });

  it('offers a failed result once its targets are finished', () => {
    const onSettled: jest.Mock = jest.fn();
    const sink: PhasedRequestEventSink = createEarlyFailureSink(onSettled);
    sink.onIterationScheduled([
      createRecord(TARGET_OPERATION, OperationStatus.Blocked),
      createRecord(FAILED_OPERATION, OperationStatus.Failure),
      createRecord(RUNNING_OPERATION, OperationStatus.Executing),
      createRecord(QUEUED_OPERATION, OperationStatus.Success)
    ]);

    sink.settleIfIdle();

    expect(onSettled.mock.calls).toEqual([[1]]);
    expect(sink.activeOperationsSettled).toBe(false);
  });
});

describe('the iteration announcement', () => {
  async function getActivityTextsAsync(
    client: TestPhasedRequestClient,
    sink: PhasedRequestEventSink
  ): Promise<string[]> {
    await sink.flushAsync();
    return client.writes.flatMap(({ event }) =>
      event?.type === 'activityChanged' ? [(event.payload as { text: string }).text] : []
    );
  }

  function createAnnouncingSink(client: TestPhasedRequestClient): PhasedRequestEventSink {
    return new PhasedRequestEventSink({
      activeOperationIds: new Set([ACTIVE_OPERATION, SECOND_ACTIVE_OPERATION]),
      client,
      getNextSequence: () => client.getNextEventSequence(),
      onWriteFailure: () => undefined,
      rushVersion: '5.178.1'
    });
  }

  it("lists only the client's own operations that are not silent, and caps the processes at their count", async () => {
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    const sink: PhasedRequestEventSink = createAnnouncingSink(client);

    sink.onIterationStarting(
      [
        createRecord(OTHER_OPERATION, OperationStatus.Ready),
        createRecord(ACTIVE_OPERATION, OperationStatus.Ready),
        { ...createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Ready), silent: true }
      ] as IOperationExecutionResult[],
      8,
      false
    );

    expect(await getActivityTextsAsync(client, sink)).toEqual([
      'Selected 1 operation:',
      `  ${ACTIVE_OPERATION}`,
      '',
      'Executing a maximum of 1 simultaneous processes...'
    ]);
  });

  it('caps the processes at the parallelism and omits the listing in quiet mode', async () => {
    const client: TestPhasedRequestClient = new TestPhasedRequestClient();
    const sink: PhasedRequestEventSink = createAnnouncingSink(client);

    sink.onIterationStarting(
      [
        createRecord(SECOND_ACTIVE_OPERATION, OperationStatus.Ready),
        createRecord(OTHER_OPERATION, OperationStatus.Ready),
        createRecord(ACTIVE_OPERATION, OperationStatus.Ready)
      ],
      1,
      true
    );

    expect(await getActivityTextsAsync(client, sink)).toEqual([
      'Executing a maximum of 1 simultaneous processes...'
    ]);
  });

  it.each([false, true])(
    'announces nothing when the client has nothing to run in the iteration (quiet mode: %s)',
    async (quietMode: boolean) => {
      const client: TestPhasedRequestClient = new TestPhasedRequestClient();
      const sink: PhasedRequestEventSink = createAnnouncingSink(client);

      sink.onIterationStarting(
        [
          createRecord(OTHER_OPERATION, OperationStatus.Ready),
          { ...createRecord(ACTIVE_OPERATION, OperationStatus.Ready), silent: true }
        ] as IOperationExecutionResult[],
        8,
        quietMode
      );

      expect(await getActivityTextsAsync(client, sink)).toEqual([]);
    }
  );
});
