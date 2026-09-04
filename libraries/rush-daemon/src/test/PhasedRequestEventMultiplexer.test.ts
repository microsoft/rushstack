// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IOperationExecutionResult, _IOperationGraphEventSink } from '@microsoft/rush-lib';

import { PhasedRequestEventMultiplexer } from '../PhasedRequestEventMultiplexer';

describe(PhasedRequestEventMultiplexer.name, () => {
  it('forwards execution identity, stream closure, and completion to every sink', () => {
    const events: string[] = [];
    const result: IOperationExecutionResult = {} as IOperationExecutionResult;
    const workspaceSink: _IOperationGraphEventSink = {
      onOperationRegistered: (operationId, silent, forwardedResult) => {
        expect(operationId).toBe('operation');
        expect(silent).toBe(false);
        expect(forwardedResult).toBe(result);
        events.push('workspace-registered');
      },
      onOperationStreamClosed: () => events.push('workspace-closed'),
      onOperationCompleted: () => events.push('workspace-completed')
    };
    const requestSink: _IOperationGraphEventSink & {
      onIterationScheduled(records: Iterable<IOperationExecutionResult>): void;
    } = {
      onIterationScheduled: () => {},
      onOperationRegistered: (operationId, silent, forwardedResult) => {
        expect(operationId).toBe('operation');
        expect(silent).toBe(false);
        expect(forwardedResult).toBe(result);
        events.push('request-registered');
      },
      onOperationStreamClosed: () => events.push('request-closed'),
      onOperationCompleted: () => events.push('request-completed')
    };
    const multiplexer: PhasedRequestEventMultiplexer = new PhasedRequestEventMultiplexer(workspaceSink);
    multiplexer.subscribe(requestSink);

    multiplexer.onOperationRegistered('operation', false, result);
    multiplexer.onOperationStreamClosed('operation', result);
    multiplexer.onOperationCompleted(result);

    expect(events).toEqual([
      'workspace-registered',
      'request-registered',
      'workspace-closed',
      'request-closed',
      'workspace-completed',
      'request-completed'
    ]);
  });
});
