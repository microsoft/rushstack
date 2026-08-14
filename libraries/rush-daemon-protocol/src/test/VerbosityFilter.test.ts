// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '../DaemonEventEnvelope';
import { serializeDaemonEventForSubscription } from '../DaemonEventFrameCodec';
import { shouldSerializeDaemonEvent } from '../DaemonVerbosityFilter';

import { createTestEnvelope } from './TestVectors';

function diagnostic(severity: string): IDaemonEventEnvelope {
  return createTestEnvelope({ type: 'diagnosticEmitted', payload: { severity } });
}

it('quiet passes commandResult, activity lines, and error/warning diagnostics only', () => {
  expect(shouldSerializeDaemonEvent('quiet', createTestEnvelope({ type: 'commandResult' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('quiet', createTestEnvelope({ type: 'activityChanged' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('quiet', diagnostic('error'))).toBe(true);
  expect(shouldSerializeDaemonEvent('quiet', diagnostic('warning'))).toBe(true);
  expect(shouldSerializeDaemonEvent('quiet', diagnostic('info'))).toBe(false);
  expect(shouldSerializeDaemonEvent('quiet', createTestEnvelope({ type: 'operationStatusChanged' }))).toBe(false);
});

it('normal passes lifecycle, activity lines, and non-debug diagnostics', () => {
  expect(shouldSerializeDaemonEvent('normal', createTestEnvelope({ type: 'operationStatusChanged' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('normal', createTestEnvelope({ type: 'watchCycleCompleted' }))).toBe(true);
  // Legacy prints status/summary text in normal (non-quiet) mode, so activityChanged passes.
  expect(shouldSerializeDaemonEvent('normal', createTestEnvelope({ type: 'activityChanged' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('normal', diagnostic('info'))).toBe(true);
  expect(shouldSerializeDaemonEvent('normal', diagnostic('debug'))).toBe(false);
  expect(shouldSerializeDaemonEvent('normal', createTestEnvelope({ type: 'externalOutput' }))).toBe(false);
});

it('verbose adds activity and external output but not extensions', () => {
  expect(shouldSerializeDaemonEvent('verbose', createTestEnvelope({ type: 'activityChanged' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('verbose', createTestEnvelope({ type: 'externalOutput' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('verbose', createTestEnvelope({ type: 'extension' }))).toBe(false);
});

it('debug passes everything including extensions', () => {
  expect(shouldSerializeDaemonEvent('debug', createTestEnvelope({ type: 'extension' }))).toBe(true);
  expect(shouldSerializeDaemonEvent('debug', diagnostic('debug'))).toBe(true);
});

it('never filters required events regardless of verbosity', () => {
  const envelope: IDaemonEventEnvelope = createTestEnvelope({ type: 'activityChanged', required: true });
  expect(shouldSerializeDaemonEvent('quiet', envelope)).toBe(true);
});

it('serialization returns undefined for filtered subscriptions and bytes otherwise', () => {
  const envelope: IDaemonEventEnvelope = createTestEnvelope({ type: 'operationStatusChanged' });
  expect(serializeDaemonEventForSubscription('quiet', envelope)).toBeUndefined();
  const serialized: Buffer | undefined = serializeDaemonEventForSubscription('verbose', envelope);
  expect(serialized).toBeDefined();
  expect(JSON.parse(serialized?.toString() ?? '{}')).toMatchObject({ type: 'operationStatusChanged' });
});

it('gives two clients at different verbosities different subsets of one stream', () => {
  const events: readonly IDaemonEventEnvelope[] = [
    createTestEnvelope({ type: 'operationStatusChanged' }),
    diagnostic('error'),
    createTestEnvelope({ type: 'activityChanged' })
  ];
  const quietCount: number = events.filter((e: IDaemonEventEnvelope) =>
    shouldSerializeDaemonEvent('quiet', e)
  ).length;
  const verboseCount: number = events.filter((e: IDaemonEventEnvelope) =>
    shouldSerializeDaemonEvent('verbose', e)
  ).length;
  expect(quietCount).toBeLessThan(verboseCount);
});
