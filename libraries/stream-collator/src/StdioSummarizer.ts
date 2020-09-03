// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Text } from '@rushstack/node-core-library';
import { ICollatedChunk, StreamKind } from './CollatedChunk';

/**
 * @public
 */
export interface IStdioSummarizerOptions {
  leadingLines?: number;
  trailingLines?: number;
}

/**
 * An writable interface for managing output of simultaneous processes.
 *
 * @public
 */
export class StdioSummarizer {
  // Capture up to this many leading lines
  private _leadingLines: number;

  // Capture up to this many trailing lines
  private _trailingLines: number;

  private _open: boolean;

  private _accumulatedLine: string;
  private _accumulatedStderr: boolean;

  private readonly _abridgedLeading: string[];
  private readonly _abridgedTrailing: string[];
  private _abridgedOmittedLines: number = 0;
  private _abridgedStderr: boolean;

  public constructor(options?: IStdioSummarizerOptions) {
    if (!options) {
      options = {};
    }

    this._leadingLines = options.leadingLines !== undefined ? options.leadingLines : 10;
    this._trailingLines = options.trailingLines !== undefined ? options.trailingLines : 10;

    this._open = true;

    this._accumulatedLine = '';
    this._accumulatedStderr = false;

    this._abridgedLeading = [];
    this._abridgedTrailing = [];
    this._abridgedStderr = false;
  }

  public close(): void {
    if (this._open) {
      this._open = false;

      // Is there a partial accumulated line?
      if (this._accumulatedLine.length > 0) {
        // close it off
        this._processAccumulatedLine(this._accumulatedLine, this._accumulatedStderr);
        this._accumulatedLine = '';
        this._accumulatedStderr = false;
      }
    }
  }

  public getReport(): string[] {
    if (this._open) {
      throw new Error('The summary cannot be prepared until after close() is called.');
    }
    const report: string[] = [...this._abridgedLeading];
    if (this._abridgedOmittedLines > 0) {
      report.push(`(${this._abridgedOmittedLines} lines omitted)`);
    }
    report.push(...this._abridgedTrailing);
    return report;
  }

  public writeChunk(chunk: ICollatedChunk): void {
    const text: string = Text.convertToLf(chunk.text);
    let startIndex: number = 0;

    while (startIndex < text.length) {
      if (chunk.stream === StreamKind.Stderr) {
        this._accumulatedStderr = true;
      }

      const endIndex: number = text.indexOf('\n', startIndex);
      if (endIndex < 0) {
        // we did not find \n, so simply append
        this._accumulatedLine += text.substring(startIndex);
        break;
      }

      // append everything up to \n
      this._accumulatedLine += text.substring(startIndex, endIndex);

      // process the line
      this._processAccumulatedLine(this._accumulatedLine, this._accumulatedStderr);
      this._accumulatedLine = '';
      this._accumulatedStderr = false;

      // skip the \n
      startIndex = endIndex + 1;
    }
  }

  private _processAccumulatedLine(line: string, includesStderr: boolean): void {
    if (includesStderr && !this._abridgedStderr) {
      // The first time we see stderr, switch to capturing stderr
      this._abridgedStderr = true;
      this._abridgedLeading.length = 0;
      this._abridgedTrailing.length = 0;
      this._abridgedOmittedLines = 0;
    } else if (this._abridgedStderr && !includesStderr) {
      // If we're capturing stderr, then ignore non-stderr input
      return;
    }

    // Did we capture enough leading lines?
    if (this._abridgedLeading.length < this._leadingLines) {
      this._abridgedLeading.push(line);
      return;
    }

    this._abridgedTrailing.push(line);

    // If we captured to many trailing lines, omit the extras
    while (this._abridgedTrailing.length > this._trailingLines) {
      this._abridgedTrailing.shift();
      ++this._abridgedOmittedLines;
    }
  }
}
