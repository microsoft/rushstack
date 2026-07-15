// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { computeEnvelopePrivacyFloor } from '../diagnostics/DiagnosticPrivacy';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';
import type {
  ISessionStartedPayload,
  ISessionCompletedPayload,
  ICommandStartedPayload,
  ICommandCompletedPayload,
  IOperationRegisteredPayload,
  IOperationStatusChangedPayload,
  ICommandResultPayload,
  IWatchCycleCompletedPayload
} from './LifecycleEvents';

/**
 * Options for constructing a {@link LifecycleEmitter}.
 *
 * @beta
 */
export interface ILifecycleEmitterOptions {
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
   * The base scope merged into every emitted event.
   */
  readonly scope?: IReporterEventScope;

  /**
   * The protocol version stamped onto emitted events. Defaults to
   * {@link REPORTER_PROTOCOL_VERSION}.
   */
  readonly protocolVersion?: IReporterProtocolVersion;
}

/**
 * Emits the canonical first-party lifecycle and diagnostic events.
 *
 * @remarks
 * Actions, the operation scheduler, and plugins use this to publish structured
 * events. During the shadow phase these events flow to subscribers while legacy
 * rendering remains the sole visible output; the emitter itself writes nothing
 * to stdout or stderr. Every lifecycle, result, and diagnostic event is marked
 * required so the manager never drops it.
 *
 * @beta
 */
export class LifecycleEmitter {
  private readonly _sink: IReporterEventSink;
  private readonly _sessionId: string;
  private readonly _source: IReporterEventSource;
  private readonly _scope: IReporterEventScope | undefined;
  private readonly _protocolVersion: IReporterProtocolVersion;

  public constructor(options: ILifecycleEmitterOptions) {
    this._sink = options.sink;
    this._sessionId = options.sessionId;
    this._source = options.source;
    this._scope = options.scope;
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
  }

  public emitSessionStarted(payload: ISessionStartedPayload): string {
    return this._emit('sessionStarted', payload, 'public');
  }

  public emitSessionCompleted(payload: ISessionCompletedPayload): string {
    return this._emit('sessionCompleted', payload, 'public');
  }

  public emitCommandStarted(payload: ICommandStartedPayload): string {
    return this._emit('commandStarted', payload, 'public', { commandName: payload.commandName });
  }

  public emitCommandCompleted(payload: ICommandCompletedPayload): string {
    return this._emit('commandCompleted', payload, 'public', { commandName: payload.commandName });
  }

  public emitOperationRegistered(payload: IOperationRegisteredPayload): string {
    return this._emit('operationRegistered', payload, 'public', {
      operationId: payload.operationId,
      projectName: payload.projectName,
      phaseName: payload.phaseName
    });
  }

  public emitOperationStatusChanged(payload: IOperationStatusChangedPayload): string {
    return this._emit('operationStatusChanged', payload, 'public', {
      operationId: payload.operationId
    });
  }

  public emitCommandResult(payload: ICommandResultPayload): string {
    return this._emit('commandResult', payload, 'public', { commandName: payload.commandName });
  }

  public emitWatchCycleCompleted(payload: IWatchCycleCompletedPayload): string {
    return this._emit('watchCycleCompleted', payload, 'public');
  }

  /**
   * Emits a structured diagnostic alongside the existing legacy rendering.
   */
  public emitDiagnostic(diagnostic: IRushDiagnostic): string {
    const classifications: ReadonlyArray<'public' | 'local-sensitive' | 'secret'> = diagnostic.parameters
      ? Object.values(diagnostic.parameters).map((value) => value.privacy)
      : [];
    return this._emit('diagnosticEmitted', diagnostic, computeEnvelopePrivacyFloor(classifications));
  }

  private _emit(
    type:
      | 'sessionStarted'
      | 'sessionCompleted'
      | 'commandStarted'
      | 'commandCompleted'
      | 'operationRegistered'
      | 'operationStatusChanged'
      | 'commandResult'
      | 'watchCycleCompleted'
      | 'diagnosticEmitted',
    payload: unknown,
    privacy: 'public' | 'local-sensitive' | 'secret',
    scopeOverride?: IReporterEventScope
  ): string {
    const scope: IReporterEventScope | undefined =
      this._scope || scopeOverride ? { ...this._scope, ...scopeOverride } : undefined;
    return this._sink.emit({
      protocolVersion: this._protocolVersion,
      sessionId: this._sessionId,
      source: this._source,
      scope,
      privacy,
      required: true,
      type,
      payload
    });
  }
}
