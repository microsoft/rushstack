// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';
import { OperationStatus, type IOperationExecutionResult } from '@microsoft/rush-lib';

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
  expect(activities.map(({ scope }) => scope)).toEqual([
    undefined,
    { operationId: ACTIVE_OPERATION }
  ]);
  expect(activities.every(({ required }) => required)).toBe(true);
});

function createRecord(operationId: string, status: OperationStatus): IOperationExecutionResult {
  return { operation: { name: operationId }, silent: false, status } as unknown as IOperationExecutionResult;
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