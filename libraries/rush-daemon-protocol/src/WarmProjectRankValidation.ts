// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  failStatus,
  requireStatusCount,
  requireStatusPositive,
  requireStatusRecord,
  requireStatusText
} from './StatusValidation';

const ZERO: number = 0;

export function validateWarmProjectRanks(value: unknown): void {
  if (value === undefined) return;
  for (const rank of requireRanks(value)) validateRank(rank);
}

function requireRanks(value: unknown): ReadonlyArray<unknown> {
  if (!Array.isArray(value)) failStatus('projectRanks');
  return value;
}

function validateRank(value: unknown): void {
  const rank: Record<string, unknown> = requireStatusRecord(value, 'projectRank');
  requireStatusText(rank.projectName, 'projectName');
  requireStatusCount(rank.frequency, 'frequency');
  requireNonnegative(rank.lastUsed, 'lastUsed');
  validateSavings(rank.timeSavedMs);
  validateMemory(rank.measuredRunnerMemoryBytes);
}

function requireNonnegative(value: unknown, field: string): void {
  if (value !== ZERO) requireStatusPositive(value, field);
}

function validateSavings(value: unknown): void {
  if (value !== undefined) requireNonnegative(value, 'timeSavedMs');
}

function validateMemory(value: unknown): void {
  if (value === undefined) return;
  requireStatusPositive(value, 'measuredRunnerMemoryBytes');
  requireStatusCount(value, 'measuredRunnerMemoryBytes');
}
