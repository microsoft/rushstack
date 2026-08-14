// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): replace with `ReporterEventType`/`REPORTER_EVENT_TYPES` from
// `@rushstack/reporter` once that package merges into main (#5858).

/**
 * The closed set of core event type identifiers carried by `0x05` event frames.
 *
 * @remarks
 * The set is intentionally closed and mirrors the reporter event contract.
 * Producers that need a custom event use the `extension` type with a namespaced
 * identifier (see {@link isDaemonExtensionEventName}) rather than adding a new
 * core type.
 *
 * @beta
 */
export type DaemonEventType =
  | 'sessionStarted'
  | 'sessionCompleted'
  | 'commandStarted'
  | 'commandCompleted'
  | 'operationRegistered'
  | 'operationStatusChanged'
  | 'activityChanged'
  | 'watchCycleCompleted'
  | 'diagnosticEmitted'
  | 'externalProcessStarted'
  | 'externalOutput'
  | 'externalProcessCompleted'
  | 'artifactAvailable'
  | 'commandResult'
  | 'extension';

/**
 * The runtime list of every core event type, in canonical order.
 *
 * @beta
 */
export const DAEMON_EVENT_TYPES: readonly DaemonEventType[] = [
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
];

/**
 * Returns `true` when `value` is a core event type identifier.
 *
 * @beta
 */
export function isDaemonEventType(value: unknown): value is DaemonEventType {
  return typeof value === 'string' && (DAEMON_EVENT_TYPES as readonly string[]).includes(value);
}
