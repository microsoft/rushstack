// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IDaemonEventEnvelope } from '../DaemonEventEnvelope';
import { DAEMON_EVENT_TYPES } from '../DaemonEventType';
import type {
  RUSHD_EXTENSION_NAMESPACE
} from '../DaemonExtensionEventName';
import {
  isDaemonExtensionEventName,
  isRushdExtensionEventName
} from '../DaemonExtensionEventName';

// Compile-time assertion helpers: a mismatch is a TypeScript error, so these
// declarations pin the placeholder contract to the reporter envelope shape.
type AssertExact<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

type ExpectedEnvelopeKeys =
  | 'protocolVersion'
  | 'eventId'
  | 'sessionId'
  | 'parentSessionId'
  | 'parentOperationId'
  | 'sequence'
  | 'sourceSequence'
  | 'timestamp'
  | 'source'
  | 'scope'
  | 'privacy'
  | 'required'
  | 'type'
  | 'payload';

const envelopeKeysMatch: AssertExact<keyof IDaemonEventEnvelope, ExpectedEnvelopeKeys> = true;
const namespaceIsRushd: AssertExact<typeof RUSHD_EXTENSION_NAMESPACE, 'rushd'> = true;

it('pins the placeholder envelope keys to the reporter contract', () => {
  expect(envelopeKeysMatch).toBe(true);
  expect(namespaceIsRushd).toBe(true);
});

it('declares the closed core event union in canonical order', () => {
  expect(DAEMON_EVENT_TYPES).toEqual([
    'sessionStarted',
    'sessionCompleted',
    'commandStarted',
    'commandCompleted',
    'operationRegistered',
    'operationStatusChanged',
    'activityChanged',
    'watchCycleCompleted',
    'diagnosticEmitted',
    'externalProcessStarted',
    'externalOutput',
    'externalProcessCompleted',
    'artifactAvailable',
    'commandResult',
    'extension'
  ]);
});

it('accepts namespaced extension names and rejects malformed ones', () => {
  expect(isDaemonExtensionEventName('rushd.client-subscribed')).toBe(true);
  expect(isDaemonExtensionEventName('acme.cache-warmed')).toBe(true);
  expect(isDaemonExtensionEventName('NoNamespace')).toBe(false);
  expect(isDaemonExtensionEventName('rushd.')).toBe(false);
  expect(isDaemonExtensionEventName('rushd.HasCaps')).toBe(false);
});

it('scopes rushd-only extension events to the rushd namespace', () => {
  expect(isRushdExtensionEventName('rushd.client-subscribed')).toBe(true);
  expect(isRushdExtensionEventName('acme.cache-warmed')).toBe(false);
});
