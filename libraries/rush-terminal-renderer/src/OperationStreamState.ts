// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NewlineKind } from '@rushstack/node-core-library';
import type { IDaemonOperationHeaderPayload } from '@rushstack/rush-daemon-protocol';
import { CollatedTerminal, StreamCollator } from '@rushstack/stream-collator';
import type { CollatedWriter } from '@rushstack/stream-collator';
import { TerminalChunkKind, TextRewriterTransform } from '@rushstack/terminal';
import type { ITerminalChunk } from '@rushstack/terminal';

import { OperationHeaderTracker } from './OperationHeaderTracker';
import { OperationOutputBuffer } from './OperationOutputBuffer';
import type { IOperationStreamRegistryOptions } from './OperationStreamRegistryOptions';
import { formatDaemonOperationHeader } from './RendererHeader';
const EMPTY_CHUNK: ITerminalChunk = { kind: TerminalChunkKind.Stdout, text: '' };
const NO_CHUNKS: number = 0;

export class OperationStreamState {
  private readonly _closedOperations: Set<string> = new Set();
  private readonly _collator: StreamCollator;
  private readonly _headers: OperationHeaderTracker = new OperationHeaderTracker();
  private readonly _output: OperationOutputBuffer = new OperationOutputBuffer();
  private readonly _quiet: boolean;
  private readonly _terminal: CollatedTerminal;
  private readonly _writers: Map<string, CollatedWriter> = new Map();
  public constructor(options: IOperationStreamRegistryOptions) {
    this._quiet = options.quiet;
    const transform: TextRewriterTransform = new TextRewriterTransform({
      destination: options.destination,
      normalizeNewlines: NewlineKind.OsDefault,
      removeColors: options.removeColors
    });
    this._terminal = new CollatedTerminal(transform);
    this._collator = new StreamCollator({
      destination: transform,
      onWriterActive: (writer: CollatedWriter | undefined) => this._onWriterActive(writer)
    });
  }
  public registerOperation(): void {
    this._headers.registerOperation();
  }
  public setOperationHeader(header: IDaemonOperationHeaderPayload): void {
    this._headers.setOperationHeader(header);
    const chunks: ReadonlyArray<ITerminalChunk> = this._output.take(header.operationId);
    this._activate(header.operationId, chunks.length === NO_CHUNKS ? [EMPTY_CHUNK] : chunks);
  }
  public writeChunk(operationId: string, chunk: ITerminalChunk): void {
    const writer: CollatedWriter | undefined = this._writers.get(operationId);
    if (writer !== undefined) {
      writer.writeChunk(chunk);
    } else if (this._headers.hasOperationHeader(operationId)) {
      this._activate(operationId, [chunk]);
    } else {
      this._output.add(operationId, chunk);
    }
  }
  public closeOperation(operationId: string): void {
    this._closedOperations.add(operationId);
    const chunks: ReadonlyArray<ITerminalChunk> = this._output.take(operationId);
    if (chunks.length > NO_CHUNKS) {
      this._activate(operationId, chunks);
    }
    this._closeWriter(operationId);
  }
  private _activate(operationId: string, chunks: ReadonlyArray<ITerminalChunk>): void {
    if (this._writers.has(operationId)) {
      return;
    }
    const writer: CollatedWriter = this._collator.registerTask(operationId);
    this._writers.set(operationId, writer);
    for (const chunk of chunks) {
      writer.writeChunk(chunk);
    }
    this._closeWriter(operationId);
  }
  private _closeWriter(operationId: string): void {
    const writer: CollatedWriter | undefined = this._writers.get(operationId);
    if (writer === undefined || !this._closedOperations.delete(operationId)) {
      return;
    }
    writer.close();
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
    this._terminal.writeStdoutLine(`\n${header}`);
    if (!this._quiet) {
      this._terminal.writeStdoutLine('');
    }
  }
}
