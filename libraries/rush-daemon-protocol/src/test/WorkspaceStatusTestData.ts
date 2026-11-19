// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { WIRE_TEXT_ENCODER } from '../DaemonWireText';
import type { IDaemonWarmSetStatus } from '../DaemonWorkspaceStatus';

export const GENERATION: number = 2;
export const ZERO: number = 0;
export const INVALID_NUMBER: number = -1;
const IDLE_SECONDS: number = 300;
const BUDGET_MB: number = 512;
const MAX_PROJECTS: number = 20;
const DAEMON_MEMORY: number = 1024;

export const WARM_STATUS: IDaemonWarmSetStatus = {
  configuration: {
    warmIdleTimeoutSeconds: IDLE_SECONDS,
    warmMemoryBudgetMB: BUDGET_MB,
    warmSetMaxProjects: MAX_PROJECTS,
    autoWarmByTelemetry: true
  },
  maintenanceState: 'running',
  retainedProjectNames: ['a'],
  protectedProjectNames: [],
  watchedProjectNames: ['a'],
  daemonResidentMemoryBytes: DAEMON_MEMORY,
  measuredRunnerMemoryBytes: ZERO,
  unmeasuredRunnerCount: GENERATION,
  overMemoryBudget: true,
  overProjectLimit: false,
  deferredReason: undefined,
  cleanupFailures: ['An optional close failed.']
};

export function workspaceStatus(warmSet: unknown = WARM_STATUS): Record<string, unknown> {
  return { generation: GENERATION, generationToken: 'generation-token', graphInitialized: true, warmSet };
}

export function statusFrame(workspace: unknown): Uint8Array {
  return WIRE_TEXT_ENCODER.encode(JSON.stringify({ kind: 'pong', payload: { uptimeMs: ZERO, workspace } }));
}
