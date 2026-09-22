// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';

/**
 * The context supplied to a reporter when it is initialized.
 *
 * @beta
 */
export interface IReporterContext {
  /**
   * The protocol version the manager implements.
   */
  readonly protocolVersion: IReporterProtocolVersion;

  /**
   * The exclusive destination the reporter owns, when one was declared.
   */
  readonly destination?: string;
}

/**
 * A subscriber that renders reporter events to a destination.
 *
 * @remarks
 * The manager owns fan-out and ordering. It calls {@link IReporter.report} for
 * every event in session-sequence order, and it never calls a reporter
 * concurrently with itself. `report` is synchronous so the manager can preserve
 * order and apply backpressure; deferred work belongs in
 * {@link IReporter.flushAsync}.
 *
 * @beta
 */
export interface IReporter {
  /**
   * A stable, unique name for this reporter.
   */
  readonly name: string;

  /**
   * Prepares the reporter for use. A rejection is fatal to the session.
   */
  initializeAsync(context: IReporterContext): Promise<void>;

  /**
   * Renders a single event. Called in session-sequence order.
   */
  report(event: IReporterEventEnvelope<unknown>): void;

  /**
   * Flushes any buffered output.
   */
  flushAsync(): Promise<void>;

  /**
   * Flushes and releases the reporter's destination.
   */
  closeAsync(): Promise<void>;
}
