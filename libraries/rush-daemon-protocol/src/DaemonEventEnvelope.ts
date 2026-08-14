// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// TODO(reconcile): replace these placeholder types with `IReporterEventEnvelope`
// and friends from `@rushstack/reporter` once that package merges into main
// (#5858). The shapes below mirror the reporter contract field-for-field so the
// swap is mechanical.

import type { DaemonEventType } from './DaemonEventType';

/**
 * Identifies the code that produced an event.
 *
 * @beta
 */
export interface IDaemonEventSource {
  /** The npm package name of the producer, for example `@microsoft/rush-lib`. */
  readonly packageName: string;
  /** The version of the producing package. */
  readonly packageVersion: string;
  /** An optional finer-grained component name within the producing package. */
  readonly component?: string;
}

/**
 * Associates an event with the command, operation, project, and phase it belongs to.
 *
 * @beta
 */
export interface IDaemonEventScope {
  /** The name of the Rush command the event belongs to. */
  readonly commandName?: string;
  /** The identifier of the operation the event belongs to. */
  readonly operationId?: string;
  /** The name of the project the event belongs to. */
  readonly projectName?: string;
  /** The name of the phase the event belongs to. */
  readonly phaseName?: string;
}

/**
 * Classifies how sensitive a value is, and therefore which destinations may receive it.
 *
 * @remarks
 * - `public` values may be written to any destination, including telemetry.
 * - `local-sensitive` values may appear in local reporter output but never in telemetry.
 * - `secret` values must never reach any local log or telemetry.
 *
 * @beta
 */
export type DaemonEventPrivacy = 'public' | 'local-sensitive' | 'secret';

/**
 * The canonical, immutable envelope wrapping every event carried by a `0x05` frame.
 *
 * @remarks
 * Envelopes are immutable and JSON-serializable. `sequence` is authoritative for
 * ordering; `timestamp` is informational only.
 *
 * @beta
 */
export interface IDaemonEventEnvelope<TPayload = unknown> {
  /** The event-schema protocol version that produced this event. */
  readonly protocolVersion: { readonly major: number; readonly minor: number };
  /** A unique identifier for this event, assigned by the sink on emission. */
  readonly eventId: string;
  /** The identifier of the session that produced this event. */
  readonly sessionId: string;
  /** The identifier of the parent session, when from a child session. */
  readonly parentSessionId?: string;
  /** The identifier of the parent operation that spawned the child session. */
  readonly parentOperationId?: string;
  /** The authoritative monotonic ordering value assigned by the producer's manager. */
  readonly sequence: number;
  /** For child sessions, the producer's original local sequence value. */
  readonly sourceSequence?: number;
  /** The informational ISO 8601 time at which the event was created. */
  readonly timestamp: string;
  /** The code that produced this event. */
  readonly source: IDaemonEventSource;
  /** The command, operation, project, and phase this event belongs to. */
  readonly scope?: IDaemonEventScope;
  /** The minimum privacy classification floor for every field in this event. */
  readonly privacy: DaemonEventPrivacy;
  /** Whether this event is correctness-critical and must never be dropped. */
  readonly required: boolean;
  /** The core event type, or `extension` for a namespaced extension event. */
  readonly type: DaemonEventType;
  /** The JSON-serializable payload for this event type. */
  readonly payload: TPayload;
}
