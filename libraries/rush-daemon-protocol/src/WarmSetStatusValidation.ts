// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  failStatus,
  requireStatusBoolean,
  requireStatusCount,
  requireStatusPositive,
  requireStatusRecord,
  requireStatusStrings,
  requireStatusText
} from './StatusValidation';

const STATES: ReadonlySet<string> = new Set(['running', 'quiescing', 'stopped', 'failed']);
const DEFERRED: ReadonlySet<string> = new Set(['workspace-busy', 'native-busy', 'graph-busy', 'disposed']);

export function validateWarmSetStatus(value: unknown): void {
  if (value === undefined) return;
  const status: Record<string, unknown> = requireStatusRecord(value, 'warmSet');
  validateConfiguration(status.configuration);
  requireStatusStrings(status.retainedProjectNames, 'retainedProjectNames');
  requireStatusStrings(status.protectedProjectNames, 'protectedProjectNames');
  requireStatusStrings(status.watchedProjectNames, 'watchedProjectNames');
  requireStatusStrings(status.cleanupFailures, 'cleanupFailures');
  requireStatusCount(status.daemonResidentMemoryBytes, 'daemonResidentMemoryBytes');
  requireStatusCount(status.measuredRunnerMemoryBytes, 'measuredRunnerMemoryBytes');
  requireStatusCount(status.unmeasuredRunnerCount, 'unmeasuredRunnerCount');
  requireStatusBoolean(status.overMemoryBudget, 'overMemoryBudget');
  requireStatusBoolean(status.overProjectLimit, 'overProjectLimit');
  validateChoice(status.maintenanceState, 'maintenanceState', STATES);
  validateDeferred(status.deferredReason);
  validateFailure(status.maintenanceFailure);
}

function validateConfiguration(value: unknown): void {
  const config: Record<string, unknown> = requireStatusRecord(value, 'configuration');
  requireStatusPositive(config.warmIdleTimeoutSeconds, 'warmIdleTimeoutSeconds');
  requireStatusPositive(config.warmMemoryBudgetMB, 'warmMemoryBudgetMB');
  requireStatusPositive(config.warmSetMaxProjects, 'warmSetMaxProjects');
  requireStatusCount(config.warmSetMaxProjects, 'warmSetMaxProjects');
  requireStatusBoolean(config.autoWarmByTelemetry, 'autoWarmByTelemetry');
  if (config.watch !== undefined) requireStatusBoolean(config.watch, 'watch');
}

function validateChoice(value: unknown, field: string, choices: ReadonlySet<string>): void {
  requireStatusText(value, field);
  if (!choices.has(value)) failStatus(field);
}

function validateDeferred(value: unknown): void {
  if (value !== undefined) validateChoice(value, 'deferredReason', DEFERRED);
}

function validateFailure(value: unknown): void {
  if (value !== undefined) requireStatusText(value, 'maintenanceFailure');
}
