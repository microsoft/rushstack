// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '@rushstack/rush-daemon-protocol';

import { PhasedRequestEventSink } from '../PhasedRequestEventSink';
import { TestPhasedRequestClient } from './PhasedRequestRouterTestUtilities';

const ACTIVE_OPERATION: string = 'project-a (_phase:test)';
const OTHER_OPERATION: string = 'project-b (_phase:test)';

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
