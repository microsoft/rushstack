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

const WINDOWS_PLATFORM: string = 'win32';
const CARRIAGE_RETURN: string = '\r';
const LF: string = '\n';

// Normalize lone-LF newlines to the OS default (the engine's pipeline emits OS
// newlines to the real console). Already-CRLF sequences are left intact so we
// never produce CRCRLF on Windows.
function toOsNewlines(text: string): string {
  if (process.platform !== WINDOWS_PLATFORM) {
    return text;
  }
  return text.split(LF).map(appendCarriageReturnUnlessPresent).join(LF);
}

function appendCarriageReturnUnlessPresent(part: string): string {
  return part.endsWith(CARRIAGE_RETURN) ? part : `${part}${CARRIAGE_RETURN}`;
}

function collectByKind(chunks: readonly ITerminalChunk[], kind: TerminalChunkKind): string {
  return toOsNewlines(
    chunks
      .filter((chunk: ITerminalChunk) => chunk.kind === kind)
      .map((chunk: ITerminalChunk) => chunk.text)
      .join('')
  );
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
