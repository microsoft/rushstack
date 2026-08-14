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
const CRLF: string = '\r\n';
const LF: string = '\n';

// The engine's pipeline normalizes to OS newlines on the way to the real
// console; on Windows that is CRLF. Normalize the captured golden the same way
// (collapse any existing CRLF first so we never produce CRCRLF).
function toOsNewlines(text: string): string {
  if (process.platform !== WINDOWS_PLATFORM) {
    return text;
  }
  return text.split(CRLF).join(LF).split(LF).join(CRLF);
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
