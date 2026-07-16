// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ReporterPrivacyClassification } from '../events/ReporterPrivacyClassification';
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
 * The scoped, presentation-free producer API handed to actions, plugins, and operations.
 *
 * @remarks
 * A scoped reporter is pre-bound to a command, operation, project, and phase
 * scope. It never exposes reporter implementations, destinations, active modes,
 * or thresholds. Creation of core lifecycle events remains controlled by Rush;
 * producers use {@link IScopedReporter.emitExtension} for their own events.
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
   * Emits a namespaced extension event with a JSON-serializable payload and
   * returns its assigned event id.
   *
   * @param name - a namespaced beta identifier, see {@link ReporterExtensionEventName}
   * @param payload - a JSON-serializable payload
   */
  emitExtension<TPayload>(name: ReporterExtensionEventName, payload: TPayload): string;
}
