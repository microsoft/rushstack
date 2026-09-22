// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import type { IScopedReporter } from '../producers/IScopedReporter';
import { createScopedReporter } from './ScopedReporterFactory';
import { createScopedLogger, type IScopedLogger } from './ScopedLogger';

/**
 * Options for constructing a {@link RushSessionReporting}.
 *
 * @beta
 */
export interface IRushSessionReportingOptions {
  /**
   * The sink events are emitted into.
   */
  readonly sink: IReporterEventSink;

  /**
   * The session id stamped onto emitted events.
   */
  readonly sessionId: string;

  /**
   * The producer identity stamped onto emitted events.
   */
  readonly source: IReporterEventSource;

  /**
   * The protocol version stamped onto emitted events.
   */
  readonly protocolVersion?: IReporterProtocolVersion;
}

/**
 * The reporting context handed to an action.
 *
 * @remarks
 * Actions receive both the raw sink and a scoped reporter through their
 * execution context. Neither exposes reporter instances, destinations, modes, or
 * thresholds.
 *
 * @beta
 */
export interface IReporterExecutionContext {
  /**
   * The sink the action may emit into directly.
   */
  readonly sink: IReporterEventSink;

  /**
   * A scoped reporter bound to the action's scope.
   */
  readonly reporter: IScopedReporter;
}

/**
 * The reporting surface exposed by `RushSession` to actions and plugins.
 *
 * @remarks
 * `RushSession` composes this to create scoped reporters and loggers. Plugins
 * receive scoped reporters and loggers only, so they cannot inspect active
 * modes, destinations, or thresholds. Actions additionally receive the sink
 * through an execution context.
 *
 * @beta
 */
export class RushSessionReporting {
  private readonly _sink: IReporterEventSink;
  private readonly _sessionId: string;
  private readonly _source: IReporterEventSource;
  private readonly _protocolVersion: IReporterProtocolVersion | undefined;

  public constructor(options: IRushSessionReportingOptions) {
    this._sink = options.sink;
    this._sessionId = options.sessionId;
    this._source = options.source;
    this._protocolVersion = options.protocolVersion;
  }

  /**
   * Creates a scoped reporter bound to the given scope.
   */
  public createScopedReporter(scope?: IReporterEventScope): IScopedReporter {
    return createScopedReporter({
      sink: this._sink,
      sessionId: this._sessionId,
      source: this._source,
      scope,
      protocolVersion: this._protocolVersion
    });
  }

  /**
   * Creates a scoped logger bound to the given scope.
   */
  public createScopedLogger(scope?: IReporterEventScope): IScopedLogger {
    return createScopedLogger(this.createScopedReporter(scope));
  }

  /**
   * Returns the raw sink handed to actions through the execution context.
   */
  public getSink(): IReporterEventSink {
    return this._sink;
  }

  /**
   * Creates the execution context an action receives.
   */
  public createExecutionContext(scope?: IReporterEventScope): IReporterExecutionContext {
    return {
      sink: this._sink,
      reporter: this.createScopedReporter(scope)
    };
  }
}
