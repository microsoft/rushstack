// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import type { IScopedReporter, IScopedMessageOptions } from '../producers/IScopedReporter';
import { isReporterExtensionEventName } from '../producers/ReporterExtensionEventName';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { computeEnvelopePrivacyFloor } from '../diagnostics/DiagnosticPrivacy';
import { REPORTER_PROTOCOL_VERSION } from '../protocol/ReporterProtocol';

/**
 * Options for {@link createScopedReporter}.
 *
 * @beta
 */
export interface ICreateScopedReporterOptions {
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
   * The scope bound to every emitted event.
   */
  readonly scope?: IReporterEventScope;

  /**
   * The protocol version stamped onto emitted events. Defaults to
   * {@link REPORTER_PROTOCOL_VERSION}.
   */
  readonly protocolVersion?: IReporterProtocolVersion;
}

/**
 * Creates a scoped reporter bound to a scope and backed by a sink.
 *
 * @remarks
 * The returned reporter exposes only emit methods. It never exposes reporter
 * instances, destinations, active modes, or thresholds, so producers and plugins
 * cannot inspect them. Human messages are carried on the `activityChanged`
 * channel; warning and error messages are marked required so they are never
 * coalesced.
 *
 * @param options - the sink, identity, and scope to bind
 *
 * @beta
 */
export function createScopedReporter(options: ICreateScopedReporterOptions): IScopedReporter {
  const protocolVersion: IReporterProtocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
  const sink: IReporterEventSink = options.sink;
  const sessionId: string = options.sessionId;
  const source: IReporterEventSource = options.source;
  const scope: IReporterEventScope | undefined = options.scope;

  return {
    emitMessage(messageOptions: IScopedMessageOptions): string {
      const required: boolean = messageOptions.severity === 'warning' || messageOptions.severity === 'error';
      return sink.emit({
        protocolVersion,
        sessionId,
        source,
        scope,
        privacy: messageOptions.privacy ?? 'public',
        required,
        type: 'activityChanged',
        payload: { kind: 'message', severity: messageOptions.severity, text: messageOptions.text }
      });
    },

    emitDiagnostic(diagnostic: IRushDiagnostic): string {
      const classifications: ReadonlyArray<'public' | 'local-sensitive' | 'secret'> = diagnostic.parameters
        ? Object.values(diagnostic.parameters).map((value) => value.privacy)
        : [];
      return sink.emit({
        protocolVersion,
        sessionId,
        source,
        scope,
        privacy: computeEnvelopePrivacyFloor(classifications),
        required: diagnostic.severity === 'error',
        type: 'diagnosticEmitted',
        payload: diagnostic
      });
    },

    emitExtension<TPayload>(name: string, payload: TPayload): string {
      if (!isReporterExtensionEventName(name)) {
        throw new Error(`Invalid extension event name: ${JSON.stringify(name)}`);
      }
      return sink.emit({
        protocolVersion,
        sessionId,
        source,
        scope,
        privacy: 'public',
        required: false,
        type: 'extension',
        payload: { name, payload }
      });
    }
  };
}
