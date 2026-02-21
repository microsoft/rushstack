// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalChunkKind } from './ITerminalChunk.ts';
import { type ITerminalWritableOptions, TerminalWritable } from './TerminalWritable.ts';

/**
 * Constructor options for {@link StdioSummarizer}.
 * @beta
 */
export interface IStdioSummarizerOptions extends ITerminalWritableOptions {
  /**
   * Specifies the maximum number of leading lines to include in the summary.
   * @defaultValue `10`
   */
  leadingLines?: number;

  /**
   * Specifies the maximum number of trailing lines to include in the summary.
   * @defaultValue `10`
   */
  trailingLines?: number;
}

/**
 * Summarizes the results of a failed build task by returning a subset of `stderr` output not to exceed
 * a specified maximum number of lines.
 *
 * @remarks
 * IMPORTANT: This transform assumes that its input was prepared by {@link StderrLineTransform}, so that each
 * {@link ITerminalChunk.text} item is a single line terminated by a `"\n"` character.
 *
 * The {@link IStdioSummarizerOptions.leadingLines} and {@link IStdioSummarizerOptions.trailingLines}
 * counts specify the maximum number of lines to be returned. Any additional lines will be omitted.
 * For example, if `leadingLines` and `trailingLines` were set to `3`, then the summary of 16 `stderr` lines might
 * look like this:
 *
 * ```
 * Line 1
 * Line 2
 * Line 3
 *   ...10 lines omitted...
 * Line 14
 * Line 15
 * Line 16
 * ```
 *
 * If the `stderr` output is completely empty, then the `stdout` output will be summarized instead.
 *
 * @beta
 */
export class StdioSummarizer extends TerminalWritable {
  // Capture up to this many leading lines
  private _leadingLines: number;

  // Capture up to this many trailing lines
  private _trailingLines: number;

  private readonly _abridgedLeading: string[];
  private readonly _abridgedTrailing: string[];
  private _abridgedOmittedLines: number = 0;
  private _abridgedStderr: boolean;

  public constructor(options?: IStdioSummarizerOptions) {
    super(options);

    if (!options) {
      options = {};
    }

    this._leadingLines = options.leadingLines !== undefined ? options.leadingLines : 10;
    this._trailingLines = options.trailingLines !== undefined ? options.trailingLines : 10;

    this._abridgedLeading = [];
    this._abridgedTrailing = [];
    this._abridgedStderr = false;
  }

  /**
   * Returns the summary report.
   *
   * @remarks
   * The `close()` method must be called before `getReport()` can be used.
   */
  public getReport(): string {
    if (this.isOpen) {
      throw new Error('The summary cannot be prepared until after close() is called.');
    }
    const report: string[] = [...this._abridgedLeading];
    if (this._abridgedOmittedLines === 1) {
      report.push(`  ...${this._abridgedOmittedLines} line omitted...\n`);
    }
    if (this._abridgedOmittedLines > 1) {
      report.push(`  ...${this._abridgedOmittedLines} lines omitted...\n`);
    }
    report.push(...this._abridgedTrailing);
    return report.join('');
  }

  public onWriteChunk(chunk: ITerminalChunk): void {
    if (chunk.text.length === 0 || chunk.text[chunk.text.length - 1] !== '\n') {
      throw new Error(
        'StdioSummarizer expects chunks that were separated parsed into lines by StderrLineTransform\n' +
          ' Invalid input: ' +
          JSON.stringify(chunk.text)
      );
    }

    if (chunk.kind === TerminalChunkKind.Stderr && !this._abridgedStderr) {
      // The first time we see stderr, switch to capturing stderr
      this._abridgedStderr = true;
      this._abridgedLeading.length = 0;
      this._abridgedTrailing.length = 0;
      this._abridgedOmittedLines = 0;
    } else if (this._abridgedStderr && chunk.kind !== TerminalChunkKind.Stderr) {
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
