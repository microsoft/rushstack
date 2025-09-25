// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/**
 * Represents the severity level of a problem.
 *
 * @public
 */
export type ProblemSeverity = 'error' | 'warning' | 'info';

/**
 * Represents a problem (generally an error or warning) detected in the console output.
 *
 * @public
 */
export interface IProblem {
  /** The name of the matcher that detected the problem. */
  readonly matcherName: string;
  /** Parsed message from the problem matcher */
  readonly message: string;
  /** Parsed severity level from the problem matcher */
  readonly severity?: ProblemSeverity;
  /** Parsed file path from the problem matcher */
  readonly file?: string;
  /** Parsed line number from the problem matcher */
  readonly line?: number;
  /** Parsed column number from the problem matcher */
  readonly column?: number;
  /** Parsed ending line number from the problem matcher */
  readonly endLine?: number;
  /** Parsed ending column number from the problem matcher */
  readonly endColumn?: number;
  /** Parsed error or warning code from the problem matcher */
  readonly code?: string;
}

/**
 * A problem matcher processes one line at a time and returns an {@link IProblem} if a match occurs.
 *
 * @remarks
 * Multi-line matchers may keep internal state and emit on a later line; they can also optionally
 * implement `flush()` to emit any buffered problems when the stream closes.
 *
 * @public
 */
export interface IProblemMatcher {
  /** A friendly (and stable) name identifying the matcher. */
  readonly name: string;
  /**
   * Attempt to match a problem for the provided line of console output.
   *
   * @param line - A single line of text, always terminated with a newline character (\\n).
   * @returns A problem if recognized, otherwise `false`.
   */
  match(line: string): IProblem | false;
  /**
   * Flush any buffered state and return additional problems. Optional.
   */
  flush?(): IProblem[];
}

/**
 * VS Code style problem matcher pattern definition.
 *
 * @remarks
 * This mirrors the shape used in VS Code's `problemMatcher.pattern` entries.
 * Reference: https://code.visualstudio.com/docs/editor/tasks#_defining-a-problem-matcher
 *
 * @public
 */
export interface IProblemPattern {
  /** A regular expression used to match the problem. */
  regexp: string;
  /** Match index for the file path. */
  file?: number;
  /** Match index for the location. */
  location?: number;
  /** Match index for the starting line number. */
  line?: number;
  /** Match index for the starting column number. */
  column?: number;
  /** Match index for the ending line number. */
  endLine?: number;
  /** Match index for the ending column number. */
  endColumn?: number;
  /** Match index for the severity level. */
  severity?: number;
  /** Match index for the problem code. */
  code?: number;
  /** Match index for the problem message. */
  message: number;
  /** If true, the last pattern in a multi-line matcher may repeat (loop) producing multiple problems */
  loop?: boolean;
}

/**
 * Minimal VS Code problem matcher definition.
 *
 * @public
 */
export interface IProblemMatcherJson {
  /** A friendly (and stable) name identifying the matcher. */
  name: string;
  /** An optional default severity to apply if the pattern does not capture one. */
  severity?: ProblemSeverity;
  /** A single pattern or an array of patterns to match. */
  pattern: IProblemPattern | IProblemPattern[];
}

/**
 * Parse VS Code problem matcher JSON definitions into {@link IProblemMatcher} objects.
 *
 * @public
 */
export function parseProblemMatchersJson(problemMatchers: IProblemMatcherJson[]): IProblemMatcher[] {
  const result: IProblemMatcher[] = [];

  for (const matcher of problemMatchers) {
    const problemPatterns: IProblemPattern[] = Array.isArray(matcher.pattern)
      ? matcher.pattern
      : [matcher.pattern];
    if (problemPatterns.length === 0) {
      continue;
    }

    const name: string = matcher.name;
    const defaultSeverity: ProblemSeverity | undefined = matcher.severity;
    const compiled: ICompiledProblemPattern[] = compileProblemPatterns(problemPatterns);

    if (compiled.length === 1) {
      result.push(createSingleLineMatcher(name, compiled[0], defaultSeverity));
    } else {
      result.push(createMultiLineMatcher(name, compiled, defaultSeverity));
    }
  }

  return result;
}

function toNumber(text: string | undefined): number | undefined {
  if (!text) {
    return undefined;
  }
  const n: number = parseInt(text, 10);
  return isNaN(n) ? undefined : n;
}

function normalizeSeverity(raw: string | undefined): ProblemSeverity | undefined {
  if (!raw) {
    return undefined;
  }
  const lowered: string = raw.toLowerCase();
  // Support full words as well as common abbreviations (e.g. single-letter tokens)
  if (lowered.indexOf('err') === 0) return 'error';
  if (lowered.indexOf('warn') === 0) return 'warning';
  if (lowered.indexOf('info') === 0) return 'info';
  return undefined;
}

interface ICompiledProblemPattern {
  re: RegExp;
  spec: IProblemPattern;
}

function compileProblemPatterns(problemPatterns: IProblemPattern[]): ICompiledProblemPattern[] {
  return problemPatterns.map((problemPattern) => {
    let reStr: string = problemPattern.regexp;
    if (/\\r?\\n\$/.test(reStr) || /\\n\$/.test(reStr)) {
      // already newline aware
    } else if (reStr.length > 0 && reStr.charAt(reStr.length - 1) === '$') {
      reStr = reStr.slice(0, -1) + '\\r?\\n$';
    } else {
      reStr = reStr + '(?:\\r?\\n)';
    }
    const re: RegExp = new RegExp(reStr);
    return { re, spec: problemPattern };
  });
}

/**
 * Shared capture structure used by both single-line and multi-line implementations.
 */
interface ICapturesMutable {
  file?: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity?: ProblemSeverity;
  code?: string;
  messageParts: string[];
}

function createEmptyCaptures(): ICapturesMutable {
  return { messageParts: [] };
}

/**
 * Apply one pattern's regex match to the (possibly accumulating) captures.
 */
function applyPatternCaptures(
  spec: IProblemPattern,
  reMatch: RegExpExecArray,
  captures: ICapturesMutable,
  defaultSeverity: ProblemSeverity | undefined
): void {
  if (spec.file && reMatch[spec.file]) {
    captures.file = reMatch[spec.file];
  }

  if (spec.location && reMatch[spec.location]) {
    const loc: string = reMatch[spec.location];
    const parts: string[] = loc.split(/[,.:]/).filter((s) => s.length > 0);
    if (parts.length === 1) {
      captures.line = toNumber(parts[0]);
    } else if (parts.length === 2) {
      captures.line = toNumber(parts[0]);
      captures.column = toNumber(parts[1]);
    } else if (parts.length === 4) {
      captures.line = toNumber(parts[0]);
      captures.column = toNumber(parts[1]);
      captures.endLine = toNumber(parts[2]);
      captures.endColumn = toNumber(parts[3]);
    }
  } else {
    if (spec.line && reMatch[spec.line]) {
      captures.line = toNumber(reMatch[spec.line]);
    }
    if (spec.column && reMatch[spec.column]) {
      captures.column = toNumber(reMatch[spec.column]);
    }
  }

  if (spec.endLine && reMatch[spec.endLine]) {
    captures.endLine = toNumber(reMatch[spec.endLine]);
  }
  if (spec.endColumn && reMatch[spec.endColumn]) {
    captures.endColumn = toNumber(reMatch[spec.endColumn]);
  }

  if (spec.severity && reMatch[spec.severity]) {
    captures.severity = normalizeSeverity(reMatch[spec.severity]) || defaultSeverity;
  } else if (!captures.severity && defaultSeverity) {
    captures.severity = defaultSeverity;
  }

  if (spec.code && reMatch[spec.code]) {
    captures.code = reMatch[spec.code];
  }

  if (spec.message && reMatch[spec.message]) {
    captures.messageParts.push(reMatch[spec.message]);
  }
}

function finalizeProblem(
  matcherName: string,
  captures: ICapturesMutable,
  defaultSeverity: ProblemSeverity | undefined
): IProblem {
  return {
    matcherName,
    file: captures.file,
    line: captures.line,
    column: captures.column,
    endLine: captures.endLine,
    endColumn: captures.endColumn,
    severity: captures.severity || defaultSeverity,
    code: captures.code,
    message: captures.messageParts.join('\n')
  };
}

function createSingleLineMatcher(
  name: string,
  compiled: ICompiledProblemPattern,
  defaultSeverity: ProblemSeverity | undefined
): IProblemMatcher {
  const { re, spec } = compiled;
  return {
    name,
    match(line: string): IProblem | false {
      const match: RegExpExecArray | null = re.exec(line);
      if (!match) {
        return false;
      }
      const captures: ICapturesMutable = createEmptyCaptures();
      applyPatternCaptures(spec, match, captures, defaultSeverity);
      return finalizeProblem(name, captures, defaultSeverity);
    }
  };
}

function createMultiLineMatcher(
  name: string,
  compiled: ICompiledProblemPattern[],
  defaultSeverity: ProblemSeverity | undefined
): IProblemMatcher {
  // currentIndex points to the next pattern we expect to match. When it equals compiled.length
  // and the last pattern is a loop, we are in a special "loop state" where additional lines
  // should be attempted against only the last pattern to emit more problems.
  let currentIndex: number = 0;
  const lastSpec: IProblemPattern = compiled[compiled.length - 1].spec;
  const lastIsLoop: boolean = !!lastSpec.loop;

  let captures: ICapturesMutable = createEmptyCaptures();

  return {
    name,
    match(line: string): IProblem | false {
      let effectiveMatch: RegExpExecArray | null = null;
      let effectiveSpec: IProblemPattern | undefined;

      // Determine matching behavior based on current state
      if (currentIndex === compiled.length && lastIsLoop) {
        // Loop state: only try to match the last pattern
        const lastPattern: ICompiledProblemPattern = compiled[compiled.length - 1];
        effectiveMatch = lastPattern.re.exec(line);
        if (!effectiveMatch) {
          // Exit loop state and reset for a potential new sequence
          currentIndex = 0;
          captures = createEmptyCaptures();
          // Attempt to treat this line as a fresh start (pattern 0)
          const first: ICompiledProblemPattern = compiled[0];
          const fresh: RegExpExecArray | null = first.re.exec(line);
          if (!fresh) {
            return false;
          }
          effectiveMatch = fresh;
          effectiveSpec = first.spec;
          currentIndex = compiled.length > 1 ? 1 : compiled.length;
        } else {
          effectiveSpec = lastPattern.spec;
          // currentIndex remains compiled.length (loop state) until we decide to emit
        }
      } else {
        // Normal multi-line progression state
        const active: ICompiledProblemPattern = compiled[currentIndex];
        const reMatch: RegExpExecArray | null = active.re.exec(line);
        if (!reMatch) {
          // Reset and maybe attempt new start
          currentIndex = 0;
          captures = createEmptyCaptures();
          const { re: re0, spec: spec0 } = compiled[0];
          const restartMatch: RegExpExecArray | null = re0.exec(line);
          if (!restartMatch) {
            return false;
          }
          effectiveMatch = restartMatch;
          effectiveSpec = spec0;
          currentIndex = compiled.length > 1 ? 1 : compiled.length;
        } else {
          effectiveMatch = reMatch;
          effectiveSpec = active.spec;
          currentIndex++;
        }
      }

      applyPatternCaptures(
        effectiveSpec as IProblemPattern,
        effectiveMatch as RegExpExecArray,
        captures,
        defaultSeverity
      );

      // If we haven't matched all patterns yet (and not in loop state), wait for more lines
      if (currentIndex < compiled.length) {
        return false;
      }

      // We have matched the full sequence (either first completion or a loop iteration)
      const problem: IProblem = finalizeProblem(name, captures, defaultSeverity);

      if (lastIsLoop) {
        // Stay in loop state; reset fields that accumulate per problem but retain other context (e.g., file if first pattern captured it?)
        // For safety, if the last pattern provided the file each iteration we keep overwriting anyway.
        captures.messageParts = [];
        // Do not clear entire captures to allow preceding pattern data (e.g., summary) to persist if desirable.
      } else {
        currentIndex = 0;
        captures = createEmptyCaptures();
      }

      return problem;
    }
  };
}
