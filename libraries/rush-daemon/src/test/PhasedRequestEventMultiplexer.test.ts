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
    const result: IOperationExecutionResult = {} as IOperationExecutionResult;

    multiplexer.onOperationStreamClosed('operation', 1);
    multiplexer.onOperationCompleted(result);

    expect(events).toEqual([
      'workspace-closed',
      'request-closed',
      'workspace-completed',
      'request-completed'
    ]);
  });
});
