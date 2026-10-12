// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';
import { REPORTER_PROTOCOL_LIMITS } from '../protocol/ReporterProtocol';
import { normalizeAnsi } from './AnsiNormalization';
import type { IProblemMatcher, IProblemMatch } from './ProblemMatcher';

const DEFAULT_MAX_DUPLICATES: number = 3;

interface IPartialLine {
  text: string;
  byteLength: number;
  overflowed: boolean;
  operationId: string | undefined;
}

/**
 * Options for {@link ProblemMatcherRunner} and {@link runProblemMatchers}.
 *
 * @beta
 */
export interface IRunProblemMatchersOptions {
  /**
   * The maximum number of identical diagnostics to emit. Defaults to 3.
   */
  readonly maxDuplicates?: number;

  /**
   * The maximum number of bytes retained for a partial line. Longer lines are
   * counted as unmatched and discarded through their next newline.
   *
   * @defaultValue The reporter protocol NDJSON record limit.
   */
  readonly maxPartialLineBytes?: number;
}

/**
 * The result of running problem matchers over an event stream.
 *
 * @beta
 */
export interface IProblemMatcherResult {
  /**
   * The linked diagnostics recovered from the output.
   */
  readonly diagnostics: readonly IRushDiagnostic[];

  /**
   * The number of matched lines.
   */
  readonly matchedLineCount: number;

  /**
   * The number of lines that no matcher recognized. The raw text is preserved.
   */
  readonly unmatchedLineCount: number;

  /**
   * The number of duplicate diagnostics suppressed by the cap.
   */
  readonly suppressedDuplicateCount: number;
}

/**
 * Incrementally runs problem matchers over uncollated external output.
 *
 * @remarks
 * Only `externalOutput` events are inspected. Raw events are never modified or
 * reordered: matchers receive ANSI-normalized copies of complete lines, with
 * partial lines retained independently per operation under a fixed byte cap.
 * Callers can skip this runner entirely after structured child negotiation.
 *
 * @beta
 */
export class ProblemMatcherRunner {
  private readonly _matchers: readonly IProblemMatcher[];
  private readonly _maxDuplicates: number;
  private readonly _maxPartialLineBytes: number;
  private readonly _diagnostics: IRushDiagnostic[] = [];
  private readonly _duplicateCounts: Map<string, number> = new Map();
  private readonly _partialLines: Map<string, IPartialLine> = new Map();
  private _matchedLineCount: number = 0;
  private _unmatchedLineCount: number = 0;
  private _suppressedDuplicateCount: number = 0;
  private _flushed: boolean = false;

  public constructor(matchers: readonly IProblemMatcher[], options: IRunProblemMatchersOptions = {}) {
    const maxDuplicates: number = options.maxDuplicates ?? DEFAULT_MAX_DUPLICATES;
    if (!Number.isSafeInteger(maxDuplicates) || maxDuplicates < 0) {
      throw new RangeError('maxDuplicates must be a nonnegative safe integer.');
    }
    const maxPartialLineBytes: number =
      options.maxPartialLineBytes ?? REPORTER_PROTOCOL_LIMITS.ndjsonRecordBytes;
    if (!Number.isSafeInteger(maxPartialLineBytes) || maxPartialLineBytes < 1) {
      throw new RangeError('maxPartialLineBytes must be a positive safe integer.');
    }

    this._matchers = [...matchers];
    this._maxDuplicates = maxDuplicates;
    this._maxPartialLineBytes = maxPartialLineBytes;
  }

  /**
   * The diagnostics and counters observed so far.
   */
  public get result(): IProblemMatcherResult {
    return {
      diagnostics: [...this._diagnostics],
      matchedLineCount: this._matchedLineCount,
      unmatchedLineCount: this._unmatchedLineCount,
      suppressedDuplicateCount: this._suppressedDuplicateCount
    };
  }

  /**
   * The number of matched lines observed so far.
   */
  public get matchedLineCount(): number {
    return this._matchedLineCount;
  }

  /**
   * The number of unmatched lines observed so far.
   */
  public get unmatchedLineCount(): number {
    return this._unmatchedLineCount;
  }

  /**
   * The number of duplicate diagnostics suppressed so far.
   */
  public get suppressedDuplicateCount(): number {
    return this._suppressedDuplicateCount;
  }

  /**
   * Processes one event and returns diagnostics recovered by that event.
   */
  public write(event: IReporterEventEnvelope<unknown>): readonly IRushDiagnostic[] {
    if (this._flushed) {
      throw new Error('Cannot write problem matcher events after flush().');
    }
    if (event.type !== 'externalOutput') {
      return [];
    }

    const payload: { stream?: unknown; text?: unknown } = event.payload as {
      stream?: unknown;
      text?: unknown;
    };
    const text: string = typeof payload.text === 'string' ? payload.text : '';
    const stream: string = typeof payload.stream === 'string' ? payload.stream : 'stdout';
    return this.writeOutput(text, event.scope?.operationId, stream);
  }

  /**
   * Processes one raw source chunk and returns diagnostics recovered by it.
   *
   * @remarks
   * This is the direct integration surface for process runners that publish
   * the raw event independently before invoking the matcher.
   */
  public writeOutput(
    text: string,
    operationId?: string,
    stream: string = 'stdout'
  ): readonly IRushDiagnostic[] {
    if (this._flushed) {
      throw new Error('Cannot write problem matcher output after flush().');
    }
    const key: string = `${operationId ?? ''}\0${stream}`;
    const partial: IPartialLine = this._partialLines.get(key) ?? {
      text: '',
      byteLength: 0,
      overflowed: false,
      operationId
    };
    const diagnosticStart: number = this._diagnostics.length;

    let offset: number = 0;
    let newlineIndex: number = text.indexOf('\n');
    while (newlineIndex >= 0) {
      this._appendLineFragment(partial, text.slice(offset, newlineIndex));
      this._finishLine(partial);
      offset = newlineIndex + 1;
      newlineIndex = text.indexOf('\n', offset);
    }
    this._appendLineFragment(partial, text.slice(offset));
    this._partialLines.set(key, partial);

    return this._diagnostics.slice(diagnosticStart);
  }

  /**
   * Processes all remaining partial lines and returns diagnostics recovered by them.
   */
  public flush(): readonly IRushDiagnostic[] {
    if (this._flushed) {
      return [];
    }
    this._flushed = true;
    const diagnosticStart: number = this._diagnostics.length;
    for (const partial of this._partialLines.values()) {
      this._finishLine(partial);
    }
    this._partialLines.clear();
    return this._diagnostics.slice(diagnosticStart);
  }

  private _appendLineFragment(partial: IPartialLine, fragment: string): void {
    if (fragment.length === 0 || partial.overflowed) {
      return;
    }
    const fragmentBytes: number = Buffer.byteLength(fragment, 'utf8');
    if (partial.byteLength + fragmentBytes > this._maxPartialLineBytes) {
      partial.text = '';
      partial.byteLength = 0;
      partial.overflowed = true;
      return;
    }
    partial.text += fragment;
    partial.byteLength += fragmentBytes;
  }

  private _finishLine(partial: IPartialLine): void {
    if (partial.overflowed) {
      this._unmatchedLineCount++;
    } else {
      this._processLine(
        partial.text.endsWith('\r') ? partial.text.slice(0, -1) : partial.text,
        partial.operationId
      );
    }
    partial.text = '';
    partial.byteLength = 0;
    partial.overflowed = false;
  }

  private _processLine(line: string, operationId: string | undefined): void {
    const normalizedLine: string = normalizeAnsi(line);
    if (normalizedLine.length === 0) {
      return;
    }
    for (const matcher of this._matchers) {
      const match: RegExpMatchArray | null = normalizedLine.match(matcher.pattern);
      if (match) {
        this._matchedLineCount++;
        const problem: IProblemMatch = matcher.extract(match);
        const key: string =
          `${operationId ?? ''}|${matcher.tool}|${problem.code ?? ''}|${problem.file ?? ''}|` +
          `${problem.line ?? ''}|${problem.column ?? ''}|${problem.message}`;
        const seen: number = this._duplicateCounts.get(key) ?? 0;
        this._duplicateCounts.set(key, seen + 1);
        if (seen >= this._maxDuplicates) {
          this._suppressedDuplicateCount++;
          return;
        }
        this._diagnostics.push(buildDiagnostic(matcher, problem, operationId));
        return;
      }
    }
    this._unmatchedLineCount++;
  }
}

/**
 * Runs problem matchers over the uncollated external-output stream.
 *
 * @remarks
 * This convenience batch API delegates to {@link ProblemMatcherRunner}.
 *
 * @param events - the event stream carrying external output
 * @param matchers - the active matchers
 * @param options - duplicate and buffering cap options
 *
 * @beta
 */
export function runProblemMatchers(
  events: readonly IReporterEventEnvelope<unknown>[],
  matchers: readonly IProblemMatcher[],
  options: IRunProblemMatchersOptions = {}
): IProblemMatcherResult {
  const runner: ProblemMatcherRunner = new ProblemMatcherRunner(matchers, options);
  for (const event of events) {
    runner.write(event);
  }
  runner.flush();
  return runner.result;
}

function buildDiagnostic(
  matcher: IProblemMatcher,
  problem: IProblemMatch,
  operationId: string | undefined
): IRushDiagnostic {
  return createRushDiagnostic('RUSH_EXTERNAL_TOOL_PROBLEM', {
    severity: matcher.severity,
    parameters: {
      tool: { value: matcher.tool, privacy: 'public' },
      code: { value: problem.code ?? '', privacy: 'public' },
      message: { value: problem.message, privacy: 'local-sensitive' }
    },
    source:
      problem.file !== undefined
        ? {
            kind: 'file',
            file: problem.file,
            line: problem.line,
            column: problem.column,
            toolName: matcher.tool
          }
        : { kind: 'tool', toolName: matcher.tool },
    relatedArtifactIds: operationId !== undefined ? [operationId] : undefined
  });
}
