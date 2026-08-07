// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * The closed set of core reporter event type identifiers.
 *
 * @remarks
 * Rush controls creation of every core lifecycle event. The set is intentionally
 * closed: producers that need a custom event use the `extension` type with a
 * namespaced beta identifier rather than adding a new core type.
 *
 * @beta
 */
export type ReporterEventType =
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
 * The runtime list of every core reporter event type, in canonical order.
 *
 * @remarks
 * This companion to {@link ReporterEventType} lets consumers validate and
 * enumerate the closed core union at runtime.
 *
 * @beta
 */
export const REPORTER_EVENT_TYPES: readonly ReporterEventType[] = [
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
