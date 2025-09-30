// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseProblemMatchersJson } from '@rushstack/problem-matcher';
import type { IProblemMatcher, IProblemMatcherJson, IProblem } from '@rushstack/problem-matcher';

import type { ITerminalChunk } from './ITerminalChunk';
import { type ITerminalWritableOptions, TerminalWritable } from './TerminalWritable';
import type { IProblemCollector } from './IProblemCollector';

/**
 * Constructor options for {@link ProblemCollector}.
 * @beta
 */
export interface IProblemCollectorOptions extends ITerminalWritableOptions {
  /**
   * The set of matchers that will be applied to each incoming line. Must contain at least one item.
   */
  matchers?: IProblemMatcher[];
  /**
   * VS Code style problem matcher definitions. These will be converted to
   * {@link @rushstack/problem-matcher#IProblemMatcher | IProblemMatcher} definitions.
   */
  matcherJson?: IProblemMatcherJson[];
  /**
   * Optional callback invoked immediately whenever a problem is produced.
   */
  onProblem?: (problem: IProblem) => void;
}

/**
 * A {@link TerminalWritable} that consumes line-oriented terminal output and extracts structured
 * problems using one or more {@link @rushstack/problem-matcher#IProblemMatcher | IProblemMatcher} instances.
 *
 * @remarks
 * This collector expects that each incoming {@link ITerminalChunk} represents a single line terminated
 * by a `"\n"` character (for example when preceded by {@link StderrLineTransform} / `StdioLineTransform`).
 * If a chunk does not end with a newline an error is thrown to surface incorrect pipeline wiring early.
 *
 * @beta
 */
export class ProblemCollector extends TerminalWritable implements IProblemCollector {
  private readonly _matchers: IProblemMatcher[];
  private readonly _problems: Set<IProblem> = new Set();
  private readonly _onProblem: ((problem: IProblem) => void) | undefined;

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
    this._onProblem = options.onProblem;
  }

  /**
   * {@inheritdoc IProblemCollector}
   */
  public get problems(): ReadonlySet<IProblem> {
    return this._problems;
  }

  /**
   * {@inheritdoc TerminalWritable}
   */
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
      const problem: IProblem | false = matcher.exec(text);
      if (problem) {
        const finalized: IProblem = {
          ...problem,
          matcherName: matcher.name
        };
        this._problems.add(finalized);
        this._onProblem?.(finalized);
      }
    }
  }

  /**
   * {@inheritdoc TerminalWritable}
   */
  protected onClose(): void {
    for (const matcher of this._matchers) {
      if (matcher.flush) {
        const flushed: IProblem[] = matcher.flush();
        if (flushed && flushed.length > 0) {
          for (const problem of flushed) {
            const finalized: IProblem = {
              ...problem,
              matcherName: matcher.name
            };
            this._problems.add(finalized);
            this._onProblem?.(finalized);
          }
        }
      }
    }
  }
}
