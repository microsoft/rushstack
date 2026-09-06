// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The runtime list of every core reporter event type, in canonical order.
 *
 * @remarks
 * Rush controls creation of every core lifecycle event. The set is intentionally
 * closed: producers that need a custom event use the `extension` type with a
 * namespaced beta identifier rather than adding a new core type.
 *
 * Per-type policy (the contract the manager, log-level filters, and reporters
 * implement):
 *
 * | type | never dropped | minimum log level |
 * | --- | --- | --- |
 * | `sessionStarted` | yes | `normal` |
 * | `sessionCompleted` | yes | `quiet` |
 * | `commandStarted` | yes | `normal` |
 * | `commandCompleted` | yes | `quiet` |
 * | `operationRegistered` | yes | `normal` |
 * | `operationStatusChanged` | yes | `normal` |
 * | `activityChanged` | **no — coalescible** | `normal` |
 * | `watchCycleCompleted` | yes | `normal` |
 * | `diagnosticEmitted` | yes | by severity: error `quiet`, warning `normal` |
 * | `messageEmitted` | yes | by severity: error/warning `quiet`, info `normal`, debug `debug` |
 * | `externalProcessStarted` | yes | `verbose` |
 * | `externalOutput` | yes | `debug` |
 * | `externalProcessCompleted` | yes | `verbose` |
 * | `artifactAvailable` | yes | `normal` |
 * | `commandResult` | yes | `quiet` |
 * | `extension` | yes | `normal` |
 *
 * Coalescing a replaceable `activityChanged` event under queue pressure leaves
 * gaps in the delivered `sequence` values; gaps are legal and are not a
 * corruption signal.
 *
 * Changing this set is a protocol change: additions are additive minors and
 * are appended in canonical order.
 *
 * @beta
 */
// eslint-disable-next-line @typescript-eslint/typedef -- literal inference feeds the derived ReporterEventType union
export const REPORTER_EVENT_TYPES = [
  'sessionStarted',
  'sessionCompleted',
  'commandStarted',
  'commandCompleted',
  'operationRegistered',
  'operationStatusChanged',
  'activityChanged',
  'watchCycleCompleted',
  'diagnosticEmitted',
  'messageEmitted',
  'externalProcessStarted',
  'externalOutput',
  'externalProcessCompleted',
  'artifactAvailable',
  'commandResult',
  'extension'
] as const;

/**
 * The closed set of core reporter event type identifiers, derived from
 * {@link REPORTER_EVENT_TYPES}.
 *
 * @beta
 */
export type ReporterEventType = (typeof REPORTER_EVENT_TYPES)[number];

/**
 * Returns `true` if events of this type are correctness-critical and must
 * never be dropped or coalesced.
 *
 * @remarks
 * The manager derives the envelope `required` flag from this policy;
 * producers never set it. Only `activityChanged` is replaceable — every other
 * type, including `extension`, must be delivered.
 *
 * @param type - the event type to check
 *
 * @beta
 */
export function isReporterEventRequired(type: ReporterEventType): boolean {
  return type !== 'activityChanged';
}