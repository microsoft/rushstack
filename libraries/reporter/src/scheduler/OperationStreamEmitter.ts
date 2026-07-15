// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterProtocolVersion } from '../events/ReporterProtocolVersion';
import type { IReporterEventScope, IReporterEventSource } from '../events/IReporterEventEnvelope';
import type { IReporterEventSink } from '../producers/IReporterEventSink';
import type { OperationStatus } from '../lifecycle/LifecycleEvents';
import { REPORTER_PROTOCOL_VERSION, REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';

/**
 * Options for constructing an {@link OperationStreamEmitter}.
 *
 * @beta
 */
export interface IOperationStreamEmitterOptions {
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
   * The base command scope merged into every emitted event.
   */
  readonly scope?: IReporterEventScope;

  /**
   * The protocol version stamped onto emitted events.
   */
  readonly protocolVersion?: IReporterProtocolVersion;

  /**
   * The maximum external-output chunk size in bytes. Defaults to 64 KiB.
   */
  readonly maxChunkBytes?: number;
}

/**
 * Emits the raw, uncollated semantic events that replace StreamCollator.
 *
 * @remarks
 * The operation scheduler uses this to publish operation registration, status
 * transitions, raw output chunks, and the aggregate command result. Output
 * chunks are emitted immediately in call order and are never collated, so the
 * concise reporter can derive activity without buffering, the detailed and file
 * reporters can own grouping, and problem matchers can consume the same
 * uncollated source stream.
 *
 * @beta
 */
export class OperationStreamEmitter {
  private readonly _sink: IReporterEventSink;
  private readonly _sessionId: string;
  private readonly _source: IReporterEventSource;
  private readonly _scope: IReporterEventScope | undefined;
  private readonly _protocolVersion: IReporterProtocolVersion;
  private readonly _maxChunkBytes: number;

  public constructor(options: IOperationStreamEmitterOptions) {
    this._sink = options.sink;
    this._sessionId = options.sessionId;
    this._source = options.source;
    this._scope = options.scope;
    this._protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    this._maxChunkBytes = options.maxChunkBytes ?? REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes;
  }

  /**
   * Emits an operation registration event.
   */
  public registerOperation(operationId: string, projectName?: string, phaseName?: string): string {
    return this._emit(
      'operationRegistered',
      { operationId, projectName, phaseName },
      { operationId, projectName, phaseName },
      'public',
      true
    );
  }

  /**
   * Emits an operation status transition.
   */
  public changeStatus(operationId: string, status: OperationStatus, durationMs?: number): string {
    return this._emit(
      'operationStatusChanged',
      { operationId, status, durationMs },
      { operationId },
      'public',
      true
    );
  }

  /**
   * Emits raw operation output as one or more uncollated `externalOutput` chunks.
   *
   * @param operationId - the originating operation
   * @param stream - the originating stream
   * @param text - the raw output text
   * @returns the emitted event ids
   */
  public writeOutput(operationId: string, stream: 'stdout' | 'stderr', text: string): string[] {
    const eventIds: string[] = [];
    let offset: number = 0;
    while (offset < text.length) {
      let end: number = text.length;
      while (Buffer.byteLength(text.slice(offset, end), 'utf8') > this._maxChunkBytes) {
        end = offset + Math.floor((end - offset) / 2);
      }
      const chunk: string = text.slice(offset, end === offset ? offset + 1 : end);
      eventIds.push(
        this._emit('externalOutput', { stream, text: chunk }, { operationId }, 'local-sensitive', false)
      );
      offset += chunk.length;
    }
    return eventIds;
  }

  /**
   * Emits the aggregate command result.
   */
  public completeCommand(
    commandName: string,
    succeeded: boolean,
    exitCode: number,
    operationCounts?: { readonly [status: string]: number }
  ): string {
    return this._emit(
      'commandResult',
      { commandName, succeeded, exitCode, operationCounts },
      { commandName },
      'public',
      true
    );
  }

  private _emit(
    type: 'operationRegistered' | 'operationStatusChanged' | 'externalOutput' | 'commandResult',
    payload: unknown,
    scopeOverride: IReporterEventScope,
    privacy: 'public' | 'local-sensitive' | 'secret',
    required: boolean
  ): string {
    const scope: IReporterEventScope = { ...this._scope, ...scopeOverride };
    return this._sink.emit({
      protocolVersion: this._protocolVersion,
      sessionId: this._sessionId,
      source: this._source,
      scope,
      privacy,
      required,
      type,
      payload
    });
  }
}
