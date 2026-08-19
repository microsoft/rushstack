// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NewlineKind } from '@rushstack/node-core-library';
import { CollatedTerminal, StreamCollator } from '@rushstack/stream-collator';
import type { CollatedWriter } from '@rushstack/stream-collator';
import { TextRewriterTransform } from '@rushstack/terminal';
import type { ITerminalChunk, TerminalWritable } from '@rushstack/terminal';

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
  readonly #collator: StreamCollator;
  readonly #collatedTerminal: CollatedTerminal;
  readonly #writers: Map<string, CollatedWriter>;
  readonly #quiet: boolean;
  #completedOperations: number;
  #totalOperations: number;

  public constructor(options: IOperationStreamRegistryOptions) {
    this.#writers = new Map();
    this.#quiet = options.quiet;
    this.#completedOperations = 0;
    this.#totalOperations = 0;
    const transform: TextRewriterTransform = new TextRewriterTransform({
      destination: options.destination,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: options.removeColors
    });
    this.#collatedTerminal = new CollatedTerminal(transform);
    this.#collator = new StreamCollator({
      destination: transform,
      onWriterActive: (writer: CollatedWriter | undefined) => this._onWriterActive(writer)
    });
  }

  /** Increments the total-operation count shown in headers. */
  public registerOperation(): void {
    this.#totalOperations += 1;
  }

  /** Writes one raw chunk to the operation's collated stream. */
  public writeChunk(operationId: string, chunk: ITerminalChunk): void {
    let writer: CollatedWriter | undefined = this.#writers.get(operationId);
    if (writer === undefined) {
      writer = this.#collator.registerTask(operationId);
      this.#writers.set(operationId, writer);
    }
    writer.writeChunk(chunk);
  }

  /** Closes the operation's stream, flushing its collated output. */
  public closeOperation(operationId: string): void {
    const writer: CollatedWriter | undefined = this.#writers.get(operationId);
    if (writer !== undefined && writer.isOpen) {
      writer.close();
    }
  }

  private _onWriterActive(writer: CollatedWriter | undefined): void {
    if (writer === undefined) {
      return;
    }
    this.#completedOperations += 1;
    const header: string = formatDaemonOperationHeader(
      writer.taskName,
      this.#completedOperations,
      this.#totalOperations
    );
    this.#collatedTerminal.writeStdoutLine(`\n${header}`);
    if (!this.#quiet) {
      this.#collatedTerminal.writeStdoutLine('');
    }
  }
}
