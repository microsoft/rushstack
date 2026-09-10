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
  readonly #sink: IReporterEventSink;
  readonly #sessionId: string;
  readonly #source: IReporterEventSource;
  readonly #scope: IReporterEventScope | undefined;
  readonly #protocolVersion: IReporterProtocolVersion;
  readonly #maxChunkBytes: number;

  public constructor(options: IOperationStreamEmitterOptions) {
    this.#sink = options.sink;
    this.#sessionId = options.sessionId;
    this.#source = options.source;
    this.#scope = options.scope;
    this.#protocolVersion = options.protocolVersion ?? REPORTER_PROTOCOL_VERSION;
    const maxChunkBytes: number = options.maxChunkBytes ?? REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes;
    if (
      !Number.isInteger(maxChunkBytes) ||
      maxChunkBytes < 4 ||
      maxChunkBytes > REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes
    ) {
      throw new RangeError(
        `maxChunkBytes must be an integer between 4 and ${REPORTER_PROTOCOL_LIMITS.externalOutputChunkBytes}`
      );
    }
    this.#maxChunkBytes = maxChunkBytes;
  }

  /**
   * Emits an operation registration event.
   */
  public registerOperation(operationId: string, projectName?: string, phaseName?: string): string {
    return this.#emit(
      'operationRegistered',
      { operationId, projectName, phaseName },
      { operationId, projectName, phaseName },
      'public'
    );
  }

  /**
   * Emits an operation status transition.
   */
  public changeStatus(operationId: string, status: OperationStatus, durationMs?: number): string {
    return this.#emit(
      'operationStatusChanged',
      { operationId, status, durationMs },
      { operationId },
      'public'
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
      let end: number = offset;
      let byteLength: number = 0;
      while (end < text.length) {
        const codePoint: number = text.codePointAt(end)!;
        const codeUnitCount: number = codePoint > 0xffff ? 2 : 1;
        const codePointByteLength: number =
          codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
        if (end > offset && byteLength + codePointByteLength > this.#maxChunkBytes) {
          break;
        }
        byteLength += codePointByteLength;
        end += codeUnitCount;
        if (byteLength >= this.#maxChunkBytes) {
          break;
        }
      }
      const chunk: string = text.slice(offset, end);
      eventIds.push(
        this.#emit('externalOutput', { stream, text: chunk }, { operationId }, 'local-sensitive')
      );
      offset = end;
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
    return this.#emit(
      'commandResult',
      { commandName, succeeded, exitCode, operationCounts },
      { commandName },
      'public'
    );
  }

  #emit(
    type: 'operationRegistered' | 'operationStatusChanged' | 'externalOutput' | 'commandResult',
    payload: unknown,
    scopeOverride: IReporterEventScope,
    privacy: 'public' | 'local-sensitive' | 'secret'
  ): string {
    const scope: IReporterEventScope = { ...this.#scope, ...scopeOverride };
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
