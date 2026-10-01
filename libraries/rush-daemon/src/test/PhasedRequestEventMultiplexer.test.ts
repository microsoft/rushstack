// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type IOperationExecutionResult,
  OperationStatus,
  type _IOperationGraphEventSink
} from '@microsoft/rush-lib';

import { type IRequestEventSink, PhasedRequestEventMultiplexer } from '../PhasedRequestEventMultiplexer';

describe(PhasedRequestEventMultiplexer.name, () => {
  it('forwards stream closure before completion to workspace and request sinks', () => {
    const events: string[] = [];
    const workspaceSink: _IOperationGraphEventSink = {
      onOperationStreamClosed: () => events.push('workspace-closed'),
      onOperationCompleted: () => events.push('workspace-completed')
    };
    const requestSink: _IOperationGraphEventSink & {
      onIterationScheduled(records: Iterable<IOperationExecutionResult>): void;
    } = {
      onIterationScheduled: () => {},
      onOperationStreamClosed: () => events.push('request-closed'),
      onOperationCompleted: () => events.push('request-completed')
    };
    const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(workspaceSink);
    multiplexer.subscribe(requestSink);
    const result: IOperationExecutionResult = { iterationId: 1 } as IOperationExecutionResult;

    multiplexer.onOperationStreamClosed('operation', result, 1);
    multiplexer.onOperationCompleted(result);

    expect(events).toEqual([
      'workspace-closed',
      'request-closed',
      'workspace-completed',
      'request-completed'
    ]);
  });

  describe('when an iteration starts', () => {
    const records: IOperationExecutionResult[] = [
      { operation: { name: 'beta' }, silent: false },
      { operation: { name: 'alpha' }, silent: false },
      { operation: { name: 'quiet' }, silent: true }
    ] as unknown as IOperationExecutionResult[];

    function createRequestSink(
      announcements: unknown[]
    ): _IOperationGraphEventSink & { onIterationScheduled(): void } {
      return {
        onIterationScheduled: () => {},
        onIterationStarting: (...args: unknown[]) => announcements.push(args)
      };
    }

    it('lets each sink that announces it do so, and announces all operations as activity to any other sink', () => {
      const workspaceActivity: string[] = [];
      const requestActivity: string[] = [];
      const announcements: unknown[] = [];
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer({
        onActivity: (text: string) => workspaceActivity.push(text)
      });
      multiplexer.subscribe(createRequestSink(announcements));
      multiplexer.subscribe({ onIterationScheduled: () => {} });
      multiplexer.subscribe({
        onIterationScheduled: () => {},
        onActivity: (text: string) => requestActivity.push(text)
      });

      multiplexer.onIterationStarting(records, 4, false);

      const allOperationsAnnouncement: string[] = [
        'Selected 2 operations:',
        '  alpha',
        '  beta',
        '',
        'Executing a maximum of 2 simultaneous processes...'
      ];
      expect(workspaceActivity).toEqual(allOperationsAnnouncement);
      expect(requestActivity).toEqual(allOperationsAnnouncement);
      expect(announcements).toEqual([[records, 4, false]]);
    });

    it('forwards it to a workspace sink that announces iterations itself', () => {
      const workspaceActivity: string[] = [];
      const workspaceAnnouncements: unknown[] = [];
      const announcements: unknown[] = [];
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer({
        onActivity: (text: string) => workspaceActivity.push(text),
        onIterationStarting: (...args: unknown[]) => workspaceAnnouncements.push(args)
      });
      multiplexer.subscribe(createRequestSink(announcements));

      multiplexer.onIterationStarting(records, 1, true);

      expect(workspaceActivity).toEqual([]);
      expect(workspaceAnnouncements).toEqual([[records, 1, true]]);
      expect(announcements).toEqual([[records, 1, true]]);
    });
  });

  describe('when a request sink subscribes to the executing iteration', () => {
    function createRecord(
      name: string,
      status: OperationStatus,
      dependencyCount: number = 0,
      silent: boolean = false
    ): IOperationExecutionResult {
      return {
        iterationId: 7,
        operation: { name, dependencies: new Set(Array.from({ length: dependencyCount }, () => ({}))) },
        silent,
        status
      } as unknown as IOperationExecutionResult;
    }

    function createRecordingSink(events: unknown[][]): IRequestEventSink {
      return {
        onIterationScheduled: (scheduled: Iterable<IOperationExecutionResult>) =>
          events.push(['scheduled', Array.from(scheduled, (record) => record.operation.name)]),
        onOperationRegistered: (operationId: string, silent: boolean, record, iterationId: number) =>
          events.push(['registered', operationId, silent, record?.status, iterationId]),
        onIterationStarting: (records, parallelism: number, quietMode: boolean) =>
          events.push(['starting', parallelism, quietMode]),
        onOperationStatusChanged: (record: IOperationExecutionResult, previousStatus: OperationStatus) =>
          events.push(['status', record.operation.name, previousStatus, record.status])
      };
    }

    it('throws if no iteration was scheduled', () => {
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(undefined);

      expect(() => multiplexer.subscribeToCurrentIteration(createRecordingSink([]))).toThrow(
        'No iteration was scheduled.'
      );
    });

    it('replays the iteration, its start and each changed status, then forwards its events', () => {
      const ready: IOperationExecutionResult = createRecord('ready', OperationStatus.Ready);
      const waiting: IOperationExecutionResult = createRecord('waiting', OperationStatus.Waiting, 1);
      const executing: IOperationExecutionResult = createRecord('executing', OperationStatus.Executing);
      const unblocked: IOperationExecutionResult = createRecord('unblocked', OperationStatus.Ready, 2);
      const done: IOperationExecutionResult = createRecord('done', OperationStatus.Success, 1, true);
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(undefined);
      multiplexer.onIterationScheduled([ready, waiting, executing, unblocked, done]);
      multiplexer.onIterationStarting([ready, waiting, executing, unblocked, done], 3, true);
      const events: unknown[][] = [];

      multiplexer.subscribeToCurrentIteration(createRecordingSink(events));
      multiplexer.onOperationStatusChanged(waiting, OperationStatus.Ready);

      expect(events).toEqual([
        ['scheduled', ['ready', 'waiting', 'executing', 'unblocked', 'done']],
        ['registered', 'ready', false, OperationStatus.Ready, 7],
        ['registered', 'waiting', false, OperationStatus.Waiting, 7],
        ['registered', 'executing', false, OperationStatus.Executing, 7],
        ['registered', 'unblocked', false, OperationStatus.Ready, 7],
        ['registered', 'done', true, OperationStatus.Success, 7],
        ['starting', 3, true],
        ['status', 'executing', OperationStatus.Ready, OperationStatus.Executing],
        ['status', 'unblocked', OperationStatus.Waiting, OperationStatus.Ready],
        ['status', 'done', OperationStatus.Waiting, OperationStatus.Success],
        ['status', 'waiting', OperationStatus.Ready, OperationStatus.Waiting]
      ]);
    });

    it('does not announce an iteration that has not started', () => {
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(undefined);
      multiplexer.onIterationStarting([], 1, false);
      multiplexer.onIterationScheduled([createRecord('ready', OperationStatus.Ready)]);
      const events: unknown[][] = [];

      multiplexer.subscribeToCurrentIteration(createRecordingSink(events));

      expect(events).toEqual([
        ['scheduled', ['ready']],
        ['registered', 'ready', false, OperationStatus.Ready, 7]
      ]);
    });

    it('announces the start as activity to a sink that does not announce iterations itself', () => {
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(undefined);
      const records: IOperationExecutionResult[] = [createRecord('alpha', OperationStatus.Ready)];
      multiplexer.onIterationScheduled(records);
      multiplexer.onIterationStarting(records, 2, false);
      const activity: string[] = [];

      multiplexer.subscribeToCurrentIteration({
        onIterationScheduled: () => {},
        onActivity: (text: string) => activity.push(text)
      });

      expect(activity).toEqual([
        'Selected 1 operation:',
        '  alpha',
        '',
        'Executing a maximum of 1 simultaneous processes...'
      ]);
    });

    it('returns a function that unsubscribes the sink', () => {
      const record: IOperationExecutionResult = createRecord('ready', OperationStatus.Ready);
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(undefined);
      multiplexer.onIterationScheduled([record]);
      const events: unknown[][] = [];

      multiplexer.subscribeToCurrentIteration(createRecordingSink(events))();
      multiplexer.onOperationStatusChanged(record, OperationStatus.Ready);

      expect(events).toHaveLength(2);
    });
  });

  describe(PhasedRequestEventMultiplexer.prototype.runForIterationRecords.name, () => {
    it("forwards only the iteration's status changes to request sinks while the callback runs", () => {
      const scheduled: IOperationExecutionResult = {
        operation: { name: 'scheduled' }
      } as IOperationExecutionResult;
      const retained: IOperationExecutionResult = {
        operation: { name: 'retained' }
      } as IOperationExecutionResult;
      const workspaceEvents: string[] = [];
      const requestEvents: string[] = [];
      const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer({
        onOperationStatusChanged: (record: IOperationExecutionResult) =>
          workspaceEvents.push(record.operation.name)
      });
      multiplexer.subscribe({
        onIterationScheduled: () => {},
        onOperationStatusChanged: (record: IOperationExecutionResult) =>
          requestEvents.push(record.operation.name)
      });
      multiplexer.onIterationScheduled([scheduled]);

      const value: number = multiplexer.runForIterationRecords(() => {
        multiplexer.onOperationStatusChanged(retained, OperationStatus.Success);
        multiplexer.onOperationStatusChanged(scheduled, OperationStatus.Ready);
        return 5;
      });
      expect(() =>
        multiplexer.runForIterationRecords(() => {
          multiplexer.onOperationStatusChanged(retained, OperationStatus.Success);
          throw new Error('refused');
        })
      ).toThrow('refused');
      multiplexer.onOperationStatusChanged(retained, OperationStatus.Success);

      expect(value).toBe(5);
      expect(workspaceEvents).toEqual(['retained', 'scheduled', 'retained', 'retained']);
      expect(requestEvents).toEqual(['scheduled', 'retained']);
    });
  });
});
