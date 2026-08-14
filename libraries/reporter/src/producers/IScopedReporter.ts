// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';
import type { ReporterJsonValue } from '../events/ReporterJsonValue';
import type {
  IActivityChangedPayload,
  IArtifactAvailablePayload,
  IOperationStatusChangedPayload
} from '../events/ReporterEventPayloads';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import type { ReporterExtensionEventName } from './ReporterExtensionEventName';

/**
 * The severity of a human-oriented scoped message.
 *
 * @remarks
 * Message severity is independent of a reporter's log level; each reporter
 * decides whether to render a given severity based on its configured level.
 *
 * @beta
 */
export type ReporterMessageSeverity = 'debug' | 'info' | 'warning' | 'error';

/**
 * Options describing a human-oriented message emitted through a scoped reporter.
 *
 * @beta
 */
export interface IScopedMessageOptions {
  /**
   * The severity of the message.
   */
  readonly severity: ReporterMessageSeverity;

  /**
   * The human-readable message text.
   */
  readonly text: string;

  /**
   * The privacy classification of the message text. Defaults to `public`.
   */
  readonly privacy?: ReporterPrivacyClassification;
}

/**
 * Options for emitting an `operationStatusChanged` event through a scoped reporter.
 *
 * @remarks
 * The operation, project, and phase are supplied by the scoped reporter's bound
 * scope, so only the status-specific fields (plus an optional privacy floor) are
 * provided here.
 *
 * @beta
 */
export interface IScopedOperationStatusOptions extends IOperationStatusChangedPayload {
  /**
   * The privacy classification of this event. Defaults to `public`.
   */
  readonly privacy?: ReporterPrivacyClassification;
}

/**
 * Options for emitting a replaceable `activityChanged` progress or liveness
 * event through a scoped reporter.
 *
 * @beta
 */
export interface IScopedActivityOptions extends IActivityChangedPayload {
  /**
   * The privacy classification of this event. Defaults to `public`.
   */
  readonly privacy?: ReporterPrivacyClassification;
}

/**
 * Options for emitting an `artifactAvailable` event through a scoped reporter.
 *
 * @beta
 */
export interface IScopedArtifactOptions extends IArtifactAvailablePayload {
  /**
   * The privacy classification of this event. Defaults to `public`. An artifact
   * `path` is `local-sensitive`, so classify accordingly when one is included.
   */
  readonly privacy?: ReporterPrivacyClassification;
}

/**
 * The scoped, presentation-free producer API handed to actions, plugins, and operations.
 *
 * @remarks
 * A scoped reporter is pre-bound to a command, operation, project, and phase
 * scope. It never exposes reporter implementations, destinations, active modes,
 * or thresholds. Creation of the session- and command-level lifecycle events
 * (such as `sessionStarted` and `commandStarted`) remains controlled by Rush;
 * producers own the operation-, activity-, and artifact-level events through the
 * typed convenience methods below, and use {@link IScopedReporter.emitExtension}
 * for their own custom events.
 *
 * Every emit method returns the assigned event id.
 *
 * @beta
 */
export interface IScopedReporter {
  /**
   * Emits a human-oriented message and returns its assigned event id.
   */
  emitMessage(options: IScopedMessageOptions): string;

  /**
   * Emits a structured diagnostic and returns its assigned event id.
   */
  emitDiagnostic(diagnostic: IRushDiagnostic): string;

  /**
   * Emits an `operationStatusChanged` event for this reporter's bound operation
   * and returns its assigned event id.
   */
  emitOperationStatus(options: IScopedOperationStatusOptions): string;

  /**
   * Emits a replaceable `activityChanged` progress or liveness event and returns
   * its assigned event id.
   *
   * @remarks
   * Activity events are coalescible under back-pressure, so callers must treat
   * them as best-effort and never rely on every snapshot being delivered.
   */
  emitActivity(options: IScopedActivityOptions): string;

  /**
   * Emits an `artifactAvailable` event announcing a produced artifact (such as a
   * log file) and returns its assigned event id.
   */
  emitArtifact(options: IScopedArtifactOptions): string;

  /**
   * Emits a namespaced extension event with a JSON-serializable payload and
   * returns its assigned event id.
   *
   * @param name - a namespaced beta identifier, see {@link ReporterExtensionEventName}
   * @param payload - a JSON-serializable payload
   */
  emitExtension<TPayload extends ReporterJsonValue>(
    name: ReporterExtensionEventName,
    payload: TPayload
  ): string;
}
