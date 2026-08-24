// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
// Adapts the rush-lib engine's dual-emit sink into wire frames (the WS2 daemon mapping).

import type { IOperationExecutionResult } from '@microsoft/rush-lib/lib/logic/operations/IOperationExecutionResult';
import type { IOperationGraphEventSink } from '@microsoft/rush-lib/lib/logic/operations/OperationEventSink';
import type { OperationStatus } from '@microsoft/rush-lib/lib/logic/operations/OperationStatus';
import {
  DaemonFrameType,
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED,
  encodeDaemonEventFrame,
  encodeDaemonLogChunk
} from '@rushstack/rush-daemon-protocol';
import type { DaemonEventType, IDaemonFrame } from '@rushstack/rush-daemon-protocol';
import { TerminalChunkKind } from '@rushstack/terminal';
import type { ITerminalChunk } from '@rushstack/terminal';


import { buildWireEnvelope } from './WireEnvelope';
import type { IWireEnvelopeOptions } from './WireEnvelope';

const FIRST_SEQUENCE: number = 1;
const UTF8: BufferEncoding = 'utf8';

function toActivityStream(options?: { stderr?: boolean }): 'stdout' | 'stderr' {
  return options?.stderr === true ? 'stderr' : 'stdout';
}

/** Converts engine dual-emit callbacks into an ordered wire frame stream. */
export class WireAdapter implements IOperationGraphEventSink {
  public readonly frames: IDaemonFrame[] = [];
  private _sequence: number = FIRST_SEQUENCE;

  public onOperationRegistered(operationId: string, silent: boolean): void {
    this._pushEvent('operationRegistered', { operationId, silent });
  }

  public onOperationStatusChanged(
    result: IOperationExecutionResult,
    previousStatus: OperationStatus
  ): void {
    this._pushEvent('operationStatusChanged', {
      operationId: result.operation.name,
      status: result.status,
      previousStatus
    });
  }

  public onOperationHeader(operationId: string, completed: number, total: number): void {
    this._pushEvent('extension', {
      name: RUSHD_OPERATION_HEADER,
      data: { operationId, completedOperations: completed, totalOperations: total }
    });
  }

  public onOperationChunk(operationId: string, chunk: ITerminalChunk): void {
    const kind: DaemonFrameType =
      chunk.kind === TerminalChunkKind.Stderr ? DaemonFrameType.logStderr : DaemonFrameType.logStdout;
    this.frames.push({
      kind,
      payload: encodeDaemonLogChunk({ operationId, chunk: Buffer.from(chunk.text, UTF8) })
    });
  }

  public onActivity(text: string, options?: { operationId?: string; stderr?: boolean }): void {
    const stream: 'stdout' | 'stderr' = toActivityStream(options);
    const operationId: string | undefined = options?.operationId;
    if (operationId === undefined) {
      this._pushEvent('activityChanged', { text, stream });
      return;
    }
    // Operation-scoped status lines are part of the operation's output block:
    // scope the event and mark it required so it is never verbosity-filtered.
    this._pushEvent(
      'activityChanged',
      { text, stream },
      { scope: { operationId }, required: true }
    );
  }

  public onOperationStreamClosed(operationId: string): void {
    this._pushEvent('extension', {
      name: RUSHD_OPERATION_STREAM_CLOSED,
      data: { operationId }
    });
  }

  private _pushEvent(type: DaemonEventType, payload: unknown, options?: IWireEnvelopeOptions): void {
    const envelope: ReturnType<typeof buildWireEnvelope> = buildWireEnvelope(
      type,
      payload,
      this._sequence,
      options
    );
    this._sequence += 1;
    this.frames.push({ kind: DaemonFrameType.event, payload: encodeDaemonEventFrame(envelope) });
  }
}
