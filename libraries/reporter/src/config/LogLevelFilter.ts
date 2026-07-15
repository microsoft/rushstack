// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { ReporterLogLevel } from './ReporterNames';

const LOG_LEVEL_RANK: { readonly [level in ReporterLogLevel]: number } = {
  quiet: 0,
  normal: 1,
  verbose: 2,
  debug: 3
};

/**
 * The log level the full-detail file reporter uses by default.
 *
 * @beta
 */
export const FILE_REPORTER_DEFAULT_LOG_LEVEL: ReporterLogLevel = 'debug';

/**
 * Returns the numeric rank of a log level, where a larger number is more verbose.
 *
 * @beta
 */
export function getLogLevelRank(level: ReporterLogLevel): number {
  return LOG_LEVEL_RANK[level];
}

/**
 * Returns the minimum log level at which an event is rendered.
 *
 * @remarks
 * - `quiet` renders failures, required warnings, and the final result.
 * - `normal` adds standard lifecycle, progress, and all diagnostics.
 * - `verbose` adds detailed operation and external-process activity.
 * - `debug` adds protocol, cache, internal, and debug-message details.
 *
 * The classification uses the event type and, for diagnostics, its severity, but
 * a reporter's log level and a diagnostic's severity remain separate axes.
 *
 * @param event - the event to classify
 *
 * @beta
 */
export function getEventMinimumLogLevel(event: IReporterEventEnvelope<unknown>): ReporterLogLevel {
  switch (event.type) {
    case 'commandResult':
      return 'quiet';
    case 'diagnosticEmitted': {
      const severity: string | undefined = (event.payload as { severity?: string }).severity;
      if (severity === 'error') {
        return 'quiet';
      }
      if (severity === 'warning') {
        return event.required ? 'quiet' : 'normal';
      }
      return 'normal';
    }
    case 'sessionStarted':
    case 'sessionCompleted':
    case 'commandStarted':
    case 'commandCompleted':
    case 'operationRegistered':
    case 'operationStatusChanged':
    case 'watchCycleCompleted':
    case 'artifactAvailable':
      return 'normal';
    case 'activityChanged': {
      const payload: { kind?: string; severity?: string } = event.payload as {
        kind?: string;
        severity?: string;
      };
      if (payload.kind === 'message' && payload.severity === 'debug') {
        return 'debug';
      }
      return 'normal';
    }
    case 'externalProcessStarted':
    case 'externalProcessCompleted':
    case 'externalOutput':
      return 'verbose';
    case 'extension':
      return event.required ? 'normal' : 'debug';
    default:
      return 'normal';
  }
}

/**
 * Returns `true` if a reporter at `logLevel` should render `event`.
 *
 * @param logLevel - the reporter's configured log level
 * @param event - the event to test
 *
 * @beta
 */
export function shouldRenderAtLogLevel(
  logLevel: ReporterLogLevel,
  event: IReporterEventEnvelope<unknown>
): boolean {
  return LOG_LEVEL_RANK[logLevel] >= LOG_LEVEL_RANK[getEventMinimumLogLevel(event)];
}

/**
 * Filters an event stream to those an event a reporter at `logLevel` renders.
 *
 * @param logLevel - the reporter's configured log level
 * @param events - the events to filter
 *
 * @beta
 */
export function filterEventsForLogLevel(
  logLevel: ReporterLogLevel,
  events: readonly IReporterEventEnvelope<unknown>[]
): IReporterEventEnvelope<unknown>[] {
  return events.filter((event: IReporterEventEnvelope<unknown>) => shouldRenderAtLogLevel(logLevel, event));
}
