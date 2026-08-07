// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from './ReporterProtocolVersion';
import type { ReporterPrivacyClassification } from './ReporterPrivacyClassification';
import type { ReporterEventType } from './ReporterEventType';

/**
 * Identifies the code that produced a reporter event.
 *
 * @beta
 */
export interface IReporterEventSource {
  /**
   * The npm package name of the producer, for example `@microsoft/rush-lib`.
   */
  readonly packageName: string;

  /**
   * The version of the producing package.
   */
  readonly packageVersion: string;

  /**
   * An optional finer-grained component name within the producing package.
   */
  readonly component?: string;
}

/**
 * Associates a reporter event with the command, operation, project, and phase it belongs to.
 *
 * @beta
 */
export interface IReporterEventScope {
  /**
   * The name of the Rush command the event belongs to.
   */
  readonly commandName?: string;

  /**
   * The identifier of the operation the event belongs to.
   */
  readonly operationId?: string;

  /**
   * The name of the project the event belongs to.
   */
  readonly projectName?: string;

  /**
   * The name of the phase the event belongs to.
   */
  readonly phaseName?: string;
}

/**
 * The canonical, immutable envelope that wraps every reporter event.
 *
 * @remarks
 * Envelopes are immutable and JSON-serializable; JavaScript `Error` instances
 * are never serialized directly. `sequence` is authoritative for ordering and
 * `timestamp` is informational only.
 *
 * For a child session, {@link IReporterEventEnvelope.sequence | sequence} is the
 * global sequence assigned by the manager in receipt order, and
 * {@link IReporterEventEnvelope.sourceSequence | sourceSequence} preserves the
 * producer's own local sequence.
 *
 * @beta
 */
export interface IReporterEventEnvelope<TPayload = unknown> {
  /**
   * The protocol version that produced this event.
   */
  readonly protocolVersion: IReporterProtocolVersion;

  /**
   * A unique identifier for this event, assigned by the sink on emission.
   */
  readonly eventId: string;

  /**
   * The identifier of the session that produced this event.
   */
  readonly sessionId: string;

  /**
   * The identifier of the parent session, when this event originates from a child session.
   */
  readonly parentSessionId?: string;

  /**
   * The identifier of the parent operation that spawned the child session, when applicable.
   */
  readonly parentOperationId?: string;

  /**
   * The authoritative monotonic ordering value assigned by the manager.
   */
  readonly sequence: number;

  /**
   * For child sessions, the producer's original local sequence value.
   */
  readonly sourceSequence?: number;

  /**
   * The informational ISO 8601 time at which the event was created.
   */
  readonly timestamp: string;

  /**
   * The code that produced this event.
   */
  readonly source: IReporterEventSource;

  /**
   * The command, operation, project, and phase this event belongs to.
   */
  readonly scope?: IReporterEventScope;

  /**
   * The minimum privacy classification floor for every field in this event.
   */
  readonly privacy: ReporterPrivacyClassification;

  /**
   * Whether this event is correctness-critical and must never be dropped.
   */
  readonly required: boolean;

  /**
   * The core event type, or `extension` for a namespaced beta extension event.
   */
  readonly type: ReporterEventType;

  /**
   * The JSON-serializable payload for this event type.
   */
  readonly payload: TPayload;
}
