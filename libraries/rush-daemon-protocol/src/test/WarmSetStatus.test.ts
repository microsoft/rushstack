// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { decodeDaemonControlMessage } from '../ControlFrameCodec';

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
  { ...WARM_STATUS, cleanupFailures: [false] }
])('rejects malformed warm accounting', (warmSet: unknown) => {
  expect(() => decodeDaemonControlMessage(statusFrame(workspaceStatus(warmSet)))).toThrow();
});

it.each(['warmIdleTimeoutSeconds', 'warmMemoryBudgetMB', 'warmSetMaxProjects', 'autoWarmByTelemetry'])(
  'rejects invalid effective configuration field %s',
  (field: string) => {
    const configuration: Record<string, unknown> = { ...WARM_STATUS.configuration, [field]: ZERO };
    const warmSet: unknown = { ...WARM_STATUS, configuration };
    expect(() => decodeDaemonControlMessage(statusFrame(workspaceStatus(warmSet)))).toThrow();
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
