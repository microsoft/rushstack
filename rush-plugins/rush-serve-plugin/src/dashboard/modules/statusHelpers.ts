// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

interface IOperationExecutionStateLike {
  name: string;
  status?: string;
  runInThisIteration?: boolean;
}

interface IOperationInfoLike {
  name: string;
  status?: string;
  runInThisIteration?: boolean;
  isActive?: boolean;
  noop?: boolean;
  enabled?: string;
}

const statusEmojiMap: Record<string, string> = {
  Ready: '⏸️',
  Waiting: '🕘',
  Queued: '📝',
  Executing: '⚙️',
  Success: '✅',
  SuccessWithWarning: '⚠️',
  Skipped: '💤',
  FromCache: '🟩',
  Failure: '❌',
  Blocked: '🚫',
  NoOp: '💤',
  Aborted: '🛑',
  Disconnected: '⏸️',
  Unknown: '❓'
};

export function statusEmoji(status: string): string {
  return statusEmojiMap[status] || '•';
}

export function computeDisplayStatus(
  op: IOperationInfoLike,
  executionStates: Map<string, IOperationExecutionStateLike>,
  lastExecutionResults: Map<string, IOperationExecutionStateLike>
): string {
  const state: IOperationExecutionStateLike | undefined = executionStates.get(op.name);
  let displayStatus: string = state?.status || op.status || '';
  const runInThisIteration: boolean | undefined = state ? state.runInThisIteration : op.runInThisIteration;

  if (runInThisIteration === false) {
    const prev: IOperationExecutionStateLike | undefined = lastExecutionResults.get(op.name);
    displayStatus = prev?.status || 'Skipped';
  }

  if (!displayStatus) {
    const last: IOperationExecutionStateLike | undefined = lastExecutionResults.get(op.name);
    displayStatus = last?.status || (op.noop ? 'NoOp' : 'Ready');
  }

  return displayStatus;
}

export function enabledGlyph(op: IOperationInfoLike): string {
  if (op.noop) return '⚪';

  switch (op.enabled) {
    case 'never':
      return '🔴';
    case 'ignore-dependency-changes':
      return '🟡';
    default:
      return '🟢';
  }
}

export function buildRunPolicyText(op: IOperationInfoLike): string {
  if (op.noop) return 'Operation does no work';

  switch (op.enabled) {
    case 'never':
      return 'Never run';
    case 'ignore-dependency-changes':
      return 'Ignores dependency changes';
    default:
      return 'Run if affected';
  }
}

export function buildTooltip(op: IOperationInfoLike, lastResultStatus: string): string {
  const activeLine: string = op.isActive ? '\nHas in-memory state' : '';
  return `${op.name}\nLast Result: ${lastResultStatus}\n${buildRunPolicyText(op)}${activeLine}`;
}

export function getStatusColors(): Record<string, string> {
  const cs: CSSStyleDeclaration = getComputedStyle(document.documentElement);
  return {
    Ready: cs.getPropertyValue('--status-ready').trim(),
    Waiting: cs.getPropertyValue('--status-waiting').trim(),
    Queued: cs.getPropertyValue('--status-queued').trim(),
    Executing: cs.getPropertyValue('--status-executing').trim() || cs.getPropertyValue('--warn').trim(),
    Success: cs.getPropertyValue('--status-success').trim() || cs.getPropertyValue('--success').trim(),
    SuccessWithWarning: cs.getPropertyValue('--status-success-warning').trim(),
    Skipped: cs.getPropertyValue('--status-skipped').trim(),
    FromCache: cs.getPropertyValue('--status-from-cache').trim(),
    Failure: cs.getPropertyValue('--status-failure').trim() || cs.getPropertyValue('--danger').trim(),
    Blocked: cs.getPropertyValue('--status-blocked').trim(),
    NoOp: cs.getPropertyValue('--status-noop').trim(),
    Aborted: cs.getPropertyValue('--status-aborted').trim()
  };
}
