// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): replace with `ReporterEventType`/`REPORTER_EVENT_TYPES` from
// `@rushstack/reporter` once that package merges into main (#5858).

/**
 * The runtime list of every core event type, in canonical order.
 *
 * @remarks
 * The `as const` declaration is the single source of truth: the
 * {@link DaemonEventType} union is derived from it, so the list and the type
 * can never drift apart.
 *
 * @beta
 */
const EVENT_TYPE_LIST = [
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
] as const;

/**
 * The closed set of core event type identifiers carried by `0x05` event frames.
 *
 * @remarks
 * Derived from the canonical list, so the list and the type can never drift
 * apart. The set is intentionally closed and mirrors the reporter event
 * contract; producers that need a custom event use the `extension` type with
 * a namespaced identifier instead.
 *
 * @beta
 */
export type DaemonEventType = (typeof EVENT_TYPE_LIST)[number];

/**
 * The runtime list of every core event type, in canonical order.
 *
 * @beta
 */
export const DAEMON_EVENT_TYPES: readonly DaemonEventType[] = EVENT_TYPE_LIST;

const DAEMON_EVENT_TYPE_SET: ReadonlySet<string> = new Set(DAEMON_EVENT_TYPES);

/**
 * Returns `true` when `value` is a core event type identifier.
 *
 * @beta
 */
export function isDaemonEventType(value: unknown): value is DaemonEventType {
  return typeof value === 'string' && DAEMON_EVENT_TYPE_SET.has(value);
}
