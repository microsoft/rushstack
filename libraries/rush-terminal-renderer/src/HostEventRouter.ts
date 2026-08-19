// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  type DaemonVerbosity,
  type IDaemonEventEnvelope,
  type IDaemonExtensionEventPayload,
  type IDaemonOperationRegisteredPayload,
  type IDaemonOperationStreamClosedPayload,
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

/**
 * Routes decoded event envelopes between the collator (stream-affecting and
 * operation-scoped events) and the verbosity-filtered renderer.
 * @internal
 */
export class HostEventRouter {
  readonly #streams: OperationStreamRegistry;
  readonly #renderer: IDaemonRenderer;
  readonly #verbosity: DaemonVerbosity;

  public constructor(
    streams: OperationStreamRegistry,
    renderer: IDaemonRenderer,
    verbosity: DaemonVerbosity
  ) {
    this.#streams = streams;
    this.#renderer = renderer;
    this.#verbosity = verbosity;
  }

  /** Routes one decoded `0x05` event envelope. */
  public routeEvent(envelope: IDaemonEventEnvelope): void {
    this.#trackOperationLifecycle(envelope);
    if (this.#routeScopedActivity(envelope)) {
      return;
    }
    if (shouldSerializeDaemonEvent(this.#verbosity, envelope)) {
      this.#renderer.report(envelope);
    }
  }

  #trackOperationLifecycle(envelope: IDaemonEventEnvelope): void {
    if (envelope.type === 'operationRegistered') {
      this.#trackRegistered(envelope.payload as IDaemonOperationRegisteredPayload);
    }
    if (envelope.type === 'extension') {
      this.#trackExtension(envelope.payload as IDaemonExtensionEventPayload);
    }
  }

  #trackRegistered(payload: IDaemonOperationRegisteredPayload): void {
    if (!payload.silent) {
      this.#streams.registerOperation();
    }
  }

  #trackExtension(payload: IDaemonExtensionEventPayload): void {
    if (payload.name === RUSHD_OPERATION_STREAM_CLOSED) {
      const data: IDaemonOperationStreamClosedPayload =
        payload.data as IDaemonOperationStreamClosedPayload;
      this.#streams.closeOperation(data.operationId);
    }
  }

  // Operation-scoped activity lines are part of the operation's output block
  // (legacy writes them to the operation's collated stream, bypassing the
  // quiet-mode stdout discard), so they route to the collator, not the renderer.
  #routeScopedActivity(envelope: IDaemonEventEnvelope): boolean {
    const operationId: string | undefined = readScopeOperationId(envelope);
    if (envelope.type !== 'activityChanged' || operationId === undefined) {
      return false;
    }
    this.#writeActivityLine(operationId, envelope.payload);
    return true;
  }

  #writeActivityLine(operationId: string, payload: unknown): void {
    const activity: unknown = payload;
    const text: unknown = (activity as { text?: unknown }).text;
    const stream: unknown = (activity as { stream?: unknown }).stream;
    if (typeof text === 'string') {
      this.#streams.writeChunk(operationId, {
        kind: stream === 'stderr' ? TerminalChunkKind.Stderr : TerminalChunkKind.Stdout,
        text: `${text}\n`
      });
    }
  }
}
