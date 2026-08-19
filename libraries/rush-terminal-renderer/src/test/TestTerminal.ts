// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalChunkKind, TerminalWritable } from '@rushstack/terminal';

import type { DaemonRenderStream, IDaemonRendererTerminal } from '../DaemonRendererTerminal';

const DEFAULT_TEST_COLUMNS: number = 80;

/** A terminal writable capturing chunk text per stream kind. */
export class CollectingWritable extends TerminalWritable {
  public readonly chunks: ITerminalChunk[] = [];

  public constructor() {
    super({ preventAutoclose: true });
  }

  public onWriteChunk(chunk: ITerminalChunk): void {
    this.chunks.push(chunk);
  }

  /** The concatenated text of all stdout chunks. */
  public get stdout(): string {
    return this._collect(TerminalChunkKind.Stdout);
  }

  /** The concatenated text of all stderr chunks. */
  public get stderr(): string {
    return this._collect(TerminalChunkKind.Stderr);
  }

  private _collect(kind: TerminalChunkKind): string {
    return this.chunks
      .filter((chunk: ITerminalChunk) => chunk.kind === kind)
      .map((chunk: ITerminalChunk) => chunk.text)
      .join('');
  }
}

/** An in-memory renderer terminal capturing stdout and stderr separately. */
export class TestTerminal implements IDaemonRendererTerminal {
  public readonly columns: number = DEFAULT_TEST_COLUMNS;
  public readonly isTTY: boolean = false;
  readonly #writes: [DaemonRenderStream, string][] = [];

  public write(text: string, stream: DaemonRenderStream): void {
    this.#writes.push([stream, text]);
  }

  /** All stdout text written so far, concatenated. */
  public get stdout(): string {
    return this._collect('stdout');
  }

  /** All stderr text written so far, concatenated. */
  public get stderr(): string {
    return this._collect('stderr');
  }

  private _collect(stream: DaemonRenderStream): string {
    return this.#writes
      .filter(([s]: [DaemonRenderStream, string]) => s === stream)
      .map(([, text]: [DaemonRenderStream, string]) => text)
      .join('');
  }
}
