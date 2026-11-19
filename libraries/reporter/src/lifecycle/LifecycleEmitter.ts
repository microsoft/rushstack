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
  readonly #sink: IReporterEventSink;
  readonly #sessionId: string;
  readonly #source: IReporterEventSource;
  readonly #scope: IReporterEventScope | undefined;
  readonly #protocolVersion: IReporterProtocolVersion;

  public constructor(options: ILifecycleEmitterOptions) {
    this.#sink = options.sink;
    this.#sessionId = options.sessionId;
    this.#source = options.source;
    this.#scope = options.scope;
    this.#protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
  }

  public emitSessionStarted(payload: ISessionStartedPayload): string {
    return this.#emit('sessionStarted', payload, 'public');
  }

  public emitSessionCompleted(payload: ISessionCompletedPayload): string {
    return this.#emit('sessionCompleted', payload, 'public');
  }

  public emitCommandStarted(payload: ICommandStartedPayload): string {
    return this.#emit('commandStarted', payload, 'public', { commandName: payload.commandName });
  }

  public emitCommandCompleted(payload: ICommandCompletedPayload): string {
    return this.#emit('commandCompleted', payload, 'public', { commandName: payload.commandName });
  }

  public emitOperationRegistered(payload: IOperationRegisteredPayload): string {
    return this.#emit('operationRegistered', payload, 'public', {
      operationId: payload.operationId,
      ...(payload.projectName === undefined ? {} : { projectName: payload.projectName }),
      ...(payload.phaseName === undefined ? {} : { phaseName: payload.phaseName })
    });
  }

  public emitOperationStatusChanged(payload: IOperationStatusChangedPayload): string {
    return this.#emit('operationStatusChanged', payload, 'public', {
      operationId: payload.operationId
    });
  }

  public emitCommandResult(payload: ICommandResultPayload): string {
    return this.#emit('commandResult', payload, 'public', { commandName: payload.commandName });
  }

  public emitWatchCycleCompleted(payload: IWatchCycleCompletedPayload): string {
    return this.#emit('watchCycleCompleted', payload, 'public');
  }

  /**
   * Emits a structured diagnostic alongside the existing legacy rendering.
   */
  public emitDiagnostic(diagnostic: IRushDiagnostic): string {
    const classifications: ReadonlyArray<'public' | 'local-sensitive' | 'secret'> = diagnostic.parameters
      ? Object.values(diagnostic.parameters).map((value) => value.privacy)
      : [];
    return this.#emit('diagnosticEmitted', diagnostic, computeEnvelopePrivacyFloor(classifications));
  }

  #emit(
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
      this.#scope || scopeOverride ? { ...this.#scope, ...scopeOverride } : undefined;
    return this.#sink.emit({
      protocolVersion: this.#protocolVersion,
      sessionId: this.#sessionId,
      source: this.#source,
      scope,
      privacy,
      type,
      payload
    });
  }
}
