// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type ITerminalChunk, TerminalChunkKind } from './ITerminalChunk';
import { type ITerminalWritableOptions, TerminalWritable } from './TerminalWritable';

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
  #leadingLines: number;

  // Capture up to this many trailing lines
  #trailingLines: number;

  readonly #abridgedLeading: string[];
  readonly #abridgedTrailing: string[];
  #abridgedOmittedLines: number = 0;
  #abridgedStderr: boolean;

  public constructor(options?: IStdioSummarizerOptions) {
    super(options);

    if (!options) {
      options = {};
    }

    this.#leadingLines = options.leadingLines !== undefined ? options.leadingLines : 10;
    this.#trailingLines = options.trailingLines !== undefined ? options.trailingLines : 10;

    this.#abridgedLeading = [];
    this.#abridgedTrailing = [];
    this.#abridgedStderr = false;
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
    const report: string[] = [...this.#abridgedLeading];
    if (this.#abridgedOmittedLines === 1) {
      report.push(`  ...${this.#abridgedOmittedLines} line omitted...\n`);
    }
    if (this.#abridgedOmittedLines > 1) {
      report.push(`  ...${this.#abridgedOmittedLines} lines omitted...\n`);
    }
    report.push(...this.#abridgedTrailing);
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

    if (chunk.kind === TerminalChunkKind.Stderr && !this.#abridgedStderr) {
      // The first time we see stderr, switch to capturing stderr
      this.#abridgedStderr = true;
      this.#abridgedLeading.length = 0;
      this.#abridgedTrailing.length = 0;
      this.#abridgedOmittedLines = 0;
    } else if (this.#abridgedStderr && chunk.kind !== TerminalChunkKind.Stderr) {
      // If we're capturing stderr, then ignore non-stderr input
      return;
    }

    // Did we capture enough leading lines?
    if (this.#abridgedLeading.length < this.#leadingLines) {
      this.#abridgedLeading.push(chunk.text);
      return;
    }

    this.#abridgedTrailing.push(chunk.text);

    // If we captured to many trailing lines, omit the extras
    while (this.#abridgedTrailing.length > this.#trailingLines) {
      this.#abridgedTrailing.shift();
      ++this.#abridgedOmittedLines;
    }
  }
}
