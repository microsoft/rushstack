// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminalChunk } from './ITerminalChunk';
import { parseProblemMatchersJson } from './ProblemMatchers';
import { type ITerminalWritableOptions, TerminalWritable } from './TerminalWritable';
import type { IProblemMatcher, IProblemMatcherJson, IProblem, IProblemMatchResult } from './ProblemMatchers';

// Re-export the problem matcher helpers and types so consumers (including tests)
// can import them from this module for convenience.
export { parseProblemMatchersJson };
export type { IProblemMatcher, IProblemMatcherJson, IProblemMatchResult };

/**
 * Constructor options for {@link ProblemCollector}.
 * @public
 */
export interface IProblemCollectorOptions extends ITerminalWritableOptions {
  /**
   * The set of matchers that will be applied to each incoming line. Must contain at least one item.
   */
  matchers?: IProblemMatcher[];
  /**
   * VS Code style problem matcher definitions. These will be converted to {@link IProblemMatcher}
   */
  matcherJson?: IProblemMatcherJson[];
}

/**
 * A {@link TerminalWritable} that consumes line-oriented terminal output and extracts structured
 * problems using one or more {@link IProblemMatcher}s.
 *
 * @remarks
 * This collector expects that each incoming {@link ITerminalChunk} represents a single line terminated
 * by a `"\n"` character (for example when preceded by {@link StderrLineTransform} / `StdioLineTransform`).
 * If a chunk does not end with a newline an error is thrown to surface incorrect pipeline wiring early.
 *
 * Call `close()` before retrieving results via @see getProblems. Similar to other collectors, attempting
 * to read results before closure throws.
 *
 * @public
 */
export class ProblemCollector extends TerminalWritable {
  private readonly _matchers: IProblemMatcher[];
  private readonly _problems: IProblem[] = [];

  public constructor(options: IProblemCollectorOptions) {
    super(options);

    if (
      !options ||
      ((!options.matchers || options.matchers.length === 0) &&
        (!options.matcherJson || options.matcherJson.length === 0))
    ) {
      throw new Error('ProblemCollector requires at least one problem matcher.');
    }

    const fromJson: IProblemMatcher[] = options.matcherJson
      ? parseProblemMatchersJson(options.matcherJson)
      : [];
    this._matchers = [...(options.matchers || []), ...fromJson];
    if (this._matchers.length === 0) {
      throw new Error('ProblemCollector requires at least one problem matcher.');
    }
  }

  public getProblems(): ReadonlyArray<IProblem> {
    if (this.isOpen) {
      throw new Error('Problems cannot be retrieved until after close() is called.');
    }
    return this._problems;
  }

  protected onWriteChunk(chunk: ITerminalChunk): void {
    const text: string = chunk.text;
    if (text.length === 0 || text[text.length - 1] !== '\n') {
      throw new Error(
        'ProblemCollector expects chunks that were split into newline terminated lines. ' +
          'Invalid input: ' +
          JSON.stringify(text)
      );
    }

    for (const matcher of this._matchers) {
      const problem: IProblemMatchResult | false = matcher.match(text);
      if (problem) {
        this._problems.push({
          ...problem,
          matcherName: matcher.name,
          fullText: problem.fullText || text
        });
      }
    }
  }

  protected onClose(): void {
    for (const matcher of this._matchers) {
      if (matcher.flush) {
        const flushed: IProblemMatchResult[] = matcher.flush();
        if (flushed && flushed.length > 0) {
          for (const problem of flushed) {
            this._problems.push({
              ...problem,
              matcherName: matcher.name,
              fullText: problem.fullText || '(no line captured)\n'
            });
          }
        }
      }
    }
  }
}
