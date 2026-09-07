// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { validateRequestId } from './RequestIdentifierValidation';
import {
  failStatus,
  requireStatusBoolean,
  requireStatusCount,
  requireStatusPositive,
  requireStatusRecord
} from './StatusValidation';
import { validateWarmSetStatus } from './WarmSetStatusValidation';

const MAX_RELOAD_TIER: number = 2;

export function validateWorkspaceStatus(value: unknown): void {
  if (value === undefined) return;
  const status: Record<string, unknown> = requireStatusRecord(value, 'workspace');
  requireStatusCount(status.generation, 'generation');
  requireStatusPositive(status.generation, 'generation');
  validateReloadTier(status.lastReloadTier);
  requireStatusBoolean(status.graphInitialized, 'graphInitialized');
  validateGenerationToken(status);
  validateWarmGraph(status);
  validateWarmSetStatus(status.warmSet);
}

function validateReloadTier(value: unknown): void {
  if (value === undefined) return;
  requireStatusCount(value, 'lastReloadTier');
  if (value > MAX_RELOAD_TIER) failStatus('lastReloadTier');
}

function validateGenerationToken(status: Record<string, unknown>): void {
  if (status.graphInitialized === true || status.generationToken !== undefined) {
    validateRequestId(status.generationToken);
  }
}

function validateWarmGraph(status: Record<string, unknown>): void {
  if (status.warmSet !== undefined && status.graphInitialized !== true) failStatus('warmSet');
}
