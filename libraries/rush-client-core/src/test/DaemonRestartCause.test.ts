// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRestartReason } from '@rushstack/rush-daemon-protocol';

import { formatDaemonRestartCause } from '../DaemonRestartCause';

describe(formatDaemonRestartCause.name, () => {
  it.each<[DaemonRestartReason, string, string]>([
    [
      { kind: 'installationChanged', change: 'removed', folder: '/snapshots/s9' },
      'because its installation at /snapshots/s9 was removed',
      "because the daemon's installation at /snapshots/s9 was removed"
    ],
    [
      { kind: 'environmentChanged', variableNames: ['NODE_OPTIONS'] },
      "because this request's environment differs from the daemon's in NODE_OPTIONS",
      "because its environment differs from the daemon's in NODE_OPTIONS"
    ],
    [
      { kind: 'environmentChanged', variableNames: [] },
      "because this request's environment differs from the daemon's",
      "because its environment differs from the daemon's"
    ],
    [
      { kind: 'workspaceInputsChanged', installationFiles: ['common/config/rush/pnpm-lock.yaml'] },
      'because common/config/rush/pnpm-lock.yaml changed',
      'because common/config/rush/pnpm-lock.yaml changed'
    ],
    [
      { kind: 'workspaceInputsChanged', installationFiles: [] },
      "because the workspace's installation changed",
      "because the workspace's installation changed"
    ],
    [
      { kind: 'workspaceInputsChanged', implementationFiles: ['common/autoinstallers/p/lib/index.js'] },
      'because the code of Rush or a Rush plugin changed (common/autoinstallers/p/lib/index.js)',
      'because the code of Rush or a Rush plugin changed (common/autoinstallers/p/lib/index.js)'
    ],
    [
      { kind: 'workspaceInputsChanged', implementationFiles: [] },
      'because the code of Rush or a Rush plugin changed',
      'because the code of Rush or a Rush plugin changed'
    ],
    [
      { kind: 'workspaceInputsChanged', selectedRushVersion: '5.180.0' },
      'because this request selects Rush 5.180.0',
      'because it selects Rush 5.180.0'
    ],
    [
      { kind: 'workspaceInputsChanged' },
      'because the inputs that the daemon started with changed',
      'because the inputs that the daemon started with changed'
    ]
  ])('explains %j', (reason, forThisRequest, forAnotherRequest) => {
    expect(formatDaemonRestartCause(reason, 'thisRequest')).toBe(forThisRequest);
    expect(formatDaemonRestartCause(reason, 'anotherRequest')).toBe(forAnotherRequest);
  });

  it('joins every changed input, and lists at most four names of each', () => {
    expect(
      formatDaemonRestartCause(
        {
          kind: 'workspaceInputsChanged',
          installationFiles: ['a', 'b'],
          implementationFiles: ['c'],
          selectedRushVersion: '5.180.0'
        },
        'thisRequest'
      )
    ).toBe(
      'because a and b changed, the code of Rush or a Rush plugin changed (c) and this request selects Rush 5.180.0'
    );
    expect(
      formatDaemonRestartCause(
        { kind: 'environmentChanged', variableNames: ['A', 'B', 'C', 'D', 'E', 'F'] },
        'thisRequest'
      )
    ).toBe("because this request's environment differs from the daemon's in A, B, C, D and 2 more");
    expect(
      formatDaemonRestartCause({ kind: 'environmentChanged', variableNames: ['A', 'B', 'C'] }, 'thisRequest')
    ).toBe("because this request's environment differs from the daemon's in A, B and C");
  });

  it('does not explain a reason kind that it does not know', () => {
    const reason: unknown = { kind: 'futureInputsChanged' };
    expect(formatDaemonRestartCause(reason as DaemonRestartReason, 'thisRequest')).toBeUndefined();
  });
});
