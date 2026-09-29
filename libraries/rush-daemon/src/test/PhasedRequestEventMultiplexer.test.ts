// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationExecutionResult, _IOperationGraphEventSink } from '@microsoft/rush-lib';

import { PhasedRequestEventMultiplexer } from '../PhasedRequestEventMultiplexer';

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
});
