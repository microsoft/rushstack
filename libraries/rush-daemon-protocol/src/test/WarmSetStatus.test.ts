// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage, encodeDaemonControlMessage } from '../ControlFrameCodec';

import { INVALID_NUMBER, WARM_STATUS, ZERO, statusFrame, workspaceStatus } from './WorkspaceStatusTestData';

it.each([
  null,
  [],
  {},
  { ...WARM_STATUS, retainedProjectNames: ['a', null] },
  { ...WARM_STATUS, protectedProjectNames: 'a' },
  { ...WARM_STATUS, watchedProjectNames: [ZERO] },
  { ...WARM_STATUS, daemonResidentMemoryBytes: INVALID_NUMBER },
  { ...WARM_STATUS, measuredRunnerMemoryBytes: 'unknown' },
  { ...WARM_STATUS, unmeasuredRunnerCount: INVALID_NUMBER },
  { ...WARM_STATUS, overMemoryBudget: 'false' },
  { ...WARM_STATUS, overProjectLimit: ZERO },
  { ...WARM_STATUS, maintenanceState: 'evicted' },
  { ...WARM_STATUS, deferredReason: 'success' },
  { ...WARM_STATUS, maintenanceFailure: {} },
  { ...WARM_STATUS, cleanupFailures: [false] },
  { ...WARM_STATUS, projectRanks: {} },
  { ...WARM_STATUS, projectRanks: [{ projectName: 'a', frequency: ZERO, lastUsed: ZERO, timeSavedMs: INVALID_NUMBER }] },
  { ...WARM_STATUS, projectRanks: [{ projectName: 'a', frequency: ZERO, lastUsed: ZERO, measuredRunnerMemoryBytes: ZERO }] }
])('rejects malformed warm accounting', (warmSet: unknown) => {
  expect(() => decodeDaemonControlMessage(statusFrame(workspaceStatus(warmSet)))).toThrow();
});

it.each([
  'watch',
  'warmIdleTimeoutSeconds',
  'warmMemoryBudgetMB',
  'warmSetMaxProjects',
  'autoWarmByTelemetry'
])('rejects invalid effective configuration field %s', (field: string) => {
  const configuration: Record<string, unknown> = { ...WARM_STATUS.configuration, [field]: ZERO };
  const warmSet: unknown = { ...WARM_STATUS, configuration };
  expect(() => decodeDaemonControlMessage(statusFrame(workspaceStatus(warmSet)))).toThrow();
});

it.each([false, true, undefined])(
  'accepts observation policy and legacy omission: %s',
  (watch: boolean | undefined) => {
    const warmSet: unknown = { ...WARM_STATUS, configuration: { ...WARM_STATUS.configuration, watch } };
    const frame: Uint8Array = statusFrame(workspaceStatus(warmSet));
    expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
  }
);

it.each(['workspace-busy', 'native-busy', 'graph-busy', 'disposed'])(
  'round-trips explicit deferral %s',
  (deferredReason: string) => {
    const warmSet: unknown = { ...WARM_STATUS, maintenanceState: 'stopped', deferredReason };
    expect(decodeDaemonControlMessage(statusFrame(workspaceStatus(warmSet)))).toMatchObject({
      payload: { workspace: { warmSet } }
    });
  }
);

it('round-trips real ranking inputs while preserving unknown measurements', () => {
  const projectRanks: ReadonlyArray<object> = [{ projectName: 'a', frequency: ZERO, lastUsed: ZERO }];
  const frame: Uint8Array = statusFrame(workspaceStatus({ ...WARM_STATUS, projectRanks }));
  expect(encodeDaemonControlMessage(decodeDaemonControlMessage(frame))).toEqual(frame);
});
