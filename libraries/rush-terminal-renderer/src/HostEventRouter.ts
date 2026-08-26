// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type DaemonVerbosity,
  type IDaemonEventEnvelope,
  type IDaemonExtensionEventPayload,
  type IDaemonOperationHeaderPayload,
  type IDaemonOperationRegisteredPayload,
  type IDaemonOperationStreamClosedPayload,
  RUSHD_OPERATION_HEADER,
  RUSHD_OPERATION_STREAM_CLOSED,
  shouldSerializeDaemonEvent
} from '@rushstack/rush-daemon-protocol';
import { TerminalChunkKind } from '@rushstack/terminal';

import type { IDaemonRenderer } from './DaemonRenderer';
import type { OperationStreamRegistry } from './OperationStreamRegistry';

function readScopeOperationId(envelope: IDaemonEventEnvelope): string | undefined {
  const scope: IDaemonEventEnvelope['scope'] = envelope.scope;
  return scope === undefined ? undefined : scope.operationId;
}

/** Routes decoded events between the operation collator and renderer. @internal */
export class HostEventRouter {
  private readonly _streams: OperationStreamRegistry;
  private readonly _renderer: IDaemonRenderer;
  private readonly _verbosity: DaemonVerbosity;

  public constructor(
    streams: OperationStreamRegistry,
    renderer: IDaemonRenderer,
    verbosity: DaemonVerbosity
  ) {
    this._streams = streams;
    this._renderer = renderer;
    this._verbosity = verbosity;
  }

  public routeEvent(envelope: IDaemonEventEnvelope): void {
    this._trackOperationLifecycle(envelope);
    if (this._routeScopedActivity(envelope)) {
      return;
    }
    if (shouldSerializeDaemonEvent(this._verbosity, envelope)) {
      this._renderer.report(envelope);
    }
  }

  private _trackOperationLifecycle(envelope: IDaemonEventEnvelope): void {
    if (envelope.type === 'operationRegistered') {
      this._trackRegistered(envelope.payload as IDaemonOperationRegisteredPayload);
    }
    if (envelope.type === 'extension') {
      this._trackExtension(envelope.payload as IDaemonExtensionEventPayload);
    }
  }

  private _trackRegistered(payload: IDaemonOperationRegisteredPayload): void {
    if (!payload.silent) {
      this._streams.registerOperation();
    }
  }

  private _trackExtension(payload: IDaemonExtensionEventPayload): void {
    if (payload.name === RUSHD_OPERATION_HEADER) {
      this._streams.setOperationHeader(payload.data as IDaemonOperationHeaderPayload);
      return;
    }
    if (payload.name === RUSHD_OPERATION_STREAM_CLOSED) {
      const data: IDaemonOperationStreamClosedPayload =
        payload.data as IDaemonOperationStreamClosedPayload;
      this._streams.closeOperation(data.operationId);
    }
  }

  private _routeScopedActivity(envelope: IDaemonEventEnvelope): boolean {
    const operationId: string | undefined = readScopeOperationId(envelope);
    if (envelope.type !== 'activityChanged' || operationId === undefined) {
      return false;
    }
    this._writeActivityLine(operationId, envelope.payload);
    return true;
  }

  private _writeActivityLine(operationId: string, payload: unknown): void {
    const activity: unknown = payload;
    const text: unknown = (activity as { text?: unknown }).text;
    const stream: unknown = (activity as { stream?: unknown }).stream;
    if (typeof text === 'string') {
      this._streams.writeChunk(operationId, {
        kind: stream === 'stderr' ? TerminalChunkKind.Stderr : TerminalChunkKind.Stdout,
        text: `${text}\n`
      });
    }
  }
}
