// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// An INDEPENDENT replica of rush-lib OperationGraph's terminal pipeline, used
// as the golden reference. Do not import renderer implementation code here.

import { NewlineKind } from '@rushstack/node-core-library';
import { CollatedTerminal, type CollatedWriter, StreamCollator } from '@rushstack/stream-collator';
import type {
  TerminalWritable} from '@rushstack/terminal';
import {
  Colorize,
  type ITerminalChunk,
  TerminalChunkKind,
  TextRewriterTransform
} from '@rushstack/terminal';

const ASCII_HEADER_WIDTH: number = 79;
const INITIAL_COUNT: number = 0;
// These mirror rush-lib's literal arithmetic in OperationGraph.onWriterActive;
// they are named here to satisfy no-magic-numbers without changing the math.
const LEGACY_LEFT_BRACKET_CHARS: number = 4;
const LEGACY_NAME_PADDING: number = 1;
const LEGACY_COUNT_PADDING: number = 1;
const LEGACY_RIGHT_BRACKET_CHARS: number = 4;
const LEGACY_TWO_BRACKETS: number = 2;
const LEGACY_MIN_MIDDLE: number = 0;

/** Replicates the legacy in-process collated output pipeline. */
export class LegacyPipelineReplica {
  readonly #collator: StreamCollator;
  readonly #terminal: CollatedTerminal;
  readonly #writers: Map<string, CollatedWriter>;
  readonly #quiet: boolean;
  readonly #total: number;
  #completed: number;

  public constructor(destination: TerminalWritable, totalOperations: number, quiet: boolean) {
    this.#writers = new Map();
    this.#quiet = quiet;
    this.#total = totalOperations;
    this.#completed = INITIAL_COUNT;
    const transform: TextRewriterTransform = new TextRewriterTransform({
      destination,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: true
    });
    this.#terminal = new CollatedTerminal(transform);
    this.#collator = new StreamCollator({
      destination: transform,
      onWriterActive: (writer: CollatedWriter | undefined) => this._legacyOnWriterActive(writer)
    });
  }

  public writeChunk(operationId: string, chunk: ITerminalChunk): void {
    // Legacy quiet mode installs a DiscardStdoutTransform upstream of the collator.
    if (this._isDiscarded(chunk)) {
      return;
    }
    let writer: CollatedWriter | undefined = this.#writers.get(operationId);
    if (writer === undefined) {
      writer = this.#collator.registerTask(operationId);
      this.#writers.set(operationId, writer);
    }
    writer.writeChunk(chunk);
  }

  private _isDiscarded(chunk: ITerminalChunk): boolean {
    return this.#quiet && chunk.kind === TerminalChunkKind.Stdout;
  }

  public closeOperation(operationId: string): void {
    const writer: CollatedWriter | undefined = this.#writers.get(operationId);
    if (writer !== undefined && writer.isOpen) {
      writer.close();
    }
  }

  private _legacyOnWriterActive(writer: CollatedWriter | undefined): void {
    if (!writer) {
      return;
    }
    this.#completed += 1;
    const leftPart: string = Colorize.gray('==[') + ' ' + Colorize.cyan(writer.taskName) + ' ';
    const leftPartLength: number =
      LEGACY_LEFT_BRACKET_CHARS + writer.taskName.length + LEGACY_NAME_PADDING;
    const completedOfTotal: string = `${this.#completed} of ${this.#total}`;
    const rightPart: string = ' ' + Colorize.white(completedOfTotal) + ' ' + Colorize.gray(']==');
    const rightPartLength: number = LEGACY_COUNT_PADDING + completedOfTotal.length + LEGACY_RIGHT_BRACKET_CHARS;
    const middleLength: number = Math.max(
      ASCII_HEADER_WIDTH - (leftPartLength + rightPartLength + LEGACY_TWO_BRACKETS),
      LEGACY_MIN_MIDDLE
    );
    const middlePart: string = Colorize.gray(']' + '='.repeat(middleLength) + '[');
    this.#terminal.writeStdoutLine('\n' + leftPart + middlePart + rightPart);
    if (!this.#quiet) {
      this.#terminal.writeStdoutLine('');
    }
  }
}
