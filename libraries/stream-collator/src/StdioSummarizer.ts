// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ITerminalChunk, StreamKind } from './ITerminalChunk';
import { TerminalWriter } from './TerminalWriter';

/** @beta */
export interface IStdioSummarizerOptions {
  leadingLines?: number;
  trailingLines?: number;
}

/** @beta */
export class StdioSummarizer extends TerminalWriter {
  // Capture up to this many leading lines
  private _leadingLines: number;

  // Capture up to this many trailing lines
  private _trailingLines: number;

  private readonly _abridgedLeading: string[];
  private readonly _abridgedTrailing: string[];
  private _abridgedOmittedLines: number = 0;
  private _abridgedStderr: boolean;

  public constructor(options?: IStdioSummarizerOptions) {
    super();

    if (!options) {
      options = {};
    }

    this._leadingLines = options.leadingLines !== undefined ? options.leadingLines : 10;
    this._trailingLines = options.trailingLines !== undefined ? options.trailingLines : 10;

    this._abridgedLeading = [];
    this._abridgedTrailing = [];
    this._abridgedStderr = false;
  }

  public getReport(): string[] {
    if (this.isOpen) {
      throw new Error('The summary cannot be prepared until after close() is called.');
    }
    const report: string[] = [...this._abridgedLeading];
    if (this._abridgedOmittedLines > 0) {
      report.push(`(${this._abridgedOmittedLines} lines omitted)`);
    }
    report.push(...this._abridgedTrailing);
    return report;
  }

  public onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.stream === StreamKind.Stderr && !this._abridgedStderr) {
      // The first time we see stderr, switch to capturing stderr
      this._abridgedStderr = true;
      this._abridgedLeading.length = 0;
      this._abridgedTrailing.length = 0;
      this._abridgedOmittedLines = 0;
    } else if (this._abridgedStderr && chunk.stream !== StreamKind.Stderr) {
      // If we're capturing stderr, then ignore non-stderr input
      return;
    }

    // Did we capture enough leading lines?
    if (this._abridgedLeading.length < this._leadingLines) {
      this._abridgedLeading.push(chunk.text);
      return;
    }

    this._abridgedTrailing.push(chunk.text);

    // If we captured to many trailing lines, omit the extras
    while (this._abridgedTrailing.length > this._trailingLines) {
      this._abridgedTrailing.shift();
      ++this._abridgedOmittedLines;
    }
  }
}
