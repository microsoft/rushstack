// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { DaemonRenderStream, IDaemonRendererTerminal } from '@rushstack/rush-terminal-renderer';
import { type ITerminalChunk, TerminalChunkKind, TerminalWritable } from '@rushstack/terminal';


const TEST_COLUMNS: number = 80;

/** A `TerminalWritable` collecting chunk text per stream (engine side). */
export class TestWritable extends TerminalWritable {
  public readonly chunks: ITerminalChunk[] = [];

  public constructor() {
    super({ preventAutoclose: true });
  }

  public onWriteChunk(chunk: ITerminalChunk): void {
    this.chunks.push(chunk);
  }

  public get stdout(): string {
    return collectByKind(this.chunks, TerminalChunkKind.Stdout);
  }

  public get stderr(): string {
    return collectByKind(this.chunks, TerminalChunkKind.Stderr);
  }
}

const OS_NEWLINE: string = process.platform === 'win32' ? '\r\n' : '\n';
const LF: string = '\n';

function collectByKind(chunks: readonly ITerminalChunk[], kind: TerminalChunkKind): string {
  return chunks
    .filter((chunk: ITerminalChunk) => chunk.kind === kind)
    .map((chunk: ITerminalChunk) => chunk.text)
    .join('')
    .split(LF)
    .join(OS_NEWLINE);
}

/** An in-memory renderer terminal (client side). */
export class CollectingTerminal implements IDaemonRendererTerminal {
  public readonly columns: number = TEST_COLUMNS;
  public readonly isTTY: boolean = false;
  private readonly _writes: [DaemonRenderStream, string][] = [];

  public write(text: string, stream: DaemonRenderStream): void {
    this._writes.push([stream, text]);
  }

  public get stdout(): string {
    return collectWrites(this._writes, 'stdout');
  }

  public get stderr(): string {
    return collectWrites(this._writes, 'stderr');
  }
}

function collectWrites(writes: readonly [DaemonRenderStream, string][], stream: DaemonRenderStream): string {
  return writes
    .filter(([s]: [DaemonRenderStream, string]) => s === stream)
    .map(([, text]: [DaemonRenderStream, string]) => text)
    .join('');
}
