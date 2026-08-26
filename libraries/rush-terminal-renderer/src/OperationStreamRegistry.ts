// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NewlineKind } from '@rushstack/node-core-library';
import type { IDaemonOperationHeaderPayload } from '@rushstack/rush-daemon-protocol';
import { CollatedTerminal, StreamCollator } from '@rushstack/stream-collator';
import type { CollatedWriter } from '@rushstack/stream-collator';
import { TextRewriterTransform } from '@rushstack/terminal';
import type { ITerminalChunk, TerminalWritable } from '@rushstack/terminal';

import { OperationHeaderTracker } from './OperationHeaderTracker';
import { formatDaemonOperationHeader } from './RendererHeader';

/** Options for {@link OperationStreamRegistry}. @beta */
export interface IOperationStreamRegistryOptions {
  /** The sink the collated output flows to. */
  readonly destination: TerminalWritable;
  /** Whether to strip ANSI colors from the collated output. */
  readonly removeColors: boolean;
  /** Whether to suppress the blank line after each operation header. */
  readonly quiet: boolean;
}

/**
 * Hosts the `StreamCollator` for faithful per-operation collation on the
 * client, reproducing the legacy in-process pipeline (including the
 * `==[ name ]===[ x of y ]==` headers) from id-tagged raw streams.
 *
 * @beta
 */
export class OperationStreamRegistry {
  private readonly _collator: StreamCollator;
  private readonly _collatedTerminal: CollatedTerminal;
  private readonly _headers: OperationHeaderTracker = new OperationHeaderTracker();
  private readonly _writers: Map<string, CollatedWriter> = new Map();
  private readonly _quiet: boolean;

  public constructor(options: IOperationStreamRegistryOptions) {
    this._quiet = options.quiet;
    const transform: TextRewriterTransform = new TextRewriterTransform({
      destination: options.destination,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: options.removeColors
    });
    this._collatedTerminal = new CollatedTerminal(transform);
    this._collator = new StreamCollator({
      destination: transform,
      onWriterActive: (writer: CollatedWriter | undefined) => this._onWriterActive(writer)
    });
  }

  /** Increments the total-operation count shown in headers. */
  public registerOperation(): void {
    this._headers.registerOperation();
  }

  /** Records engine-authoritative counters before an operation's stream activates. */
  public setOperationHeader(header: IDaemonOperationHeaderPayload): void {
    this._headers.setOperationHeader(header);
  }

  /** Writes one raw chunk to the operation's collated stream. */
  public writeChunk(operationId: string, chunk: ITerminalChunk): void {
    let writer: CollatedWriter | undefined = this._writers.get(operationId);
    if (writer === undefined) {
      writer = this._collator.registerTask(operationId);
      this._writers.set(operationId, writer);
    }
    writer.writeChunk(chunk);
  }

  /** Closes the operation's stream, flushing its collated output. */
  public closeOperation(operationId: string): void {
    const writer: CollatedWriter | undefined = this._writers.get(operationId);
    if (writer !== undefined && writer.isOpen) {
      writer.close();
    }
  }

  private _onWriterActive(writer: CollatedWriter | undefined): void {
    if (writer === undefined) {
      return;
    }
    const counters: IDaemonOperationHeaderPayload = this._headers.takeOperationHeader(
      writer.taskName
    );
    const header: string = formatDaemonOperationHeader(
      writer.taskName,
      counters.completedOperations,
      counters.totalOperations
    );
    this._collatedTerminal.writeStdoutLine(`\n${header}`);
    if (!this._quiet) {
      this._collatedTerminal.writeStdoutLine('');
    }
  }
}
