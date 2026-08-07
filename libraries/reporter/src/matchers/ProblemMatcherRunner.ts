// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IReporterEventEnvelope } from '../events/IReporterEventEnvelope';
import type { IRushDiagnostic } from '../diagnostics/IRushDiagnostic';
import { createRushDiagnostic } from '../diagnostics/createRushDiagnostic';
import { iterateExternalOutput, type IExternalOutputChunk } from '../scheduler/OperationOutputGrouping';
import { normalizeAnsi } from './AnsiNormalization';
import type { IProblemMatcher, IProblemMatch } from './ProblemMatcher';

const DEFAULT_MAX_DUPLICATES: number = 3;

/**
 * Options for {@link runProblemMatchers}.
 *
 * @beta
 */
export interface IRunProblemMatchersOptions {
  /**
   * The maximum number of identical diagnostics to emit. Defaults to 3.
   */
  readonly maxDuplicates?: number;
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
 * Runs problem matchers over the uncollated external-output stream.
 *
 * @remarks
 * The raw output events are never modified: matchers process an ANSI-normalized
 * copy, reassembling lines split across chunks per operation. Recovered
 * diagnostics link back to the operation and source location without replacing
 * the evidence, unmatched text is preserved, and identical diagnostics are
 * capped.
 *
 * @param events - the event stream carrying external output
 * @param matchers - the active matchers
 * @param options - duplicate cap options
 *
 * @beta
 */
export function runProblemMatchers(
  events: readonly IReporterEventEnvelope<unknown>[],
  matchers: readonly IProblemMatcher[],
  options: IRunProblemMatchersOptions = {}
): IProblemMatcherResult {
  const maxDuplicates: number = options.maxDuplicates ?? DEFAULT_MAX_DUPLICATES;
  const diagnostics: IRushDiagnostic[] = [];
  const duplicateCounts: Map<string, number> = new Map();
  const partialLines: Map<string, string> = new Map();
  let matchedLineCount: number = 0;
  let unmatchedLineCount: number = 0;
  let suppressedDuplicateCount: number = 0;

  const processLine = (line: string, operationId: string | undefined): void => {
    if (line.length === 0) {
      return;
    }
    for (const matcher of matchers) {
      const match: RegExpMatchArray | null = line.match(matcher.pattern);
      if (match) {
        matchedLineCount++;
        const problem: IProblemMatch = matcher.extract(match);
        const key: string = `${matcher.tool}|${problem.code ?? ''}|${problem.file ?? ''}|${problem.line ?? ''}|${problem.message}`;
        const seen: number = duplicateCounts.get(key) ?? 0;
        duplicateCounts.set(key, seen + 1);
        if (seen >= maxDuplicates) {
          suppressedDuplicateCount++;
          return;
        }
        diagnostics.push(buildDiagnostic(matcher, problem, operationId));
        return;
      }
    }
    unmatchedLineCount++;
  };

  const chunks: IExternalOutputChunk[] = iterateExternalOutput(events);
  for (const chunk of chunks) {
    const key: string = chunk.operationId ?? '';
    const buffered: string = (partialLines.get(key) ?? '') + normalizeAnsi(chunk.text);
    const lines: string[] = buffered.split('\n');
    const remainder: string = lines.pop() ?? '';
    for (const line of lines) {
      processLine(line, chunk.operationId);
    }
    partialLines.set(key, remainder);
  }
  for (const [key, remainder] of partialLines) {
    processLine(remainder, key.length > 0 ? key : undefined);
  }

  return { diagnostics, matchedLineCount, unmatchedLineCount, suppressedDuplicateCount };
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
    source: {
      file: problem.file,
      line: problem.line,
      column: problem.column,
      toolName: matcher.tool
    },
    relatedArtifactIds: operationId !== undefined ? [operationId] : undefined
  });
}
