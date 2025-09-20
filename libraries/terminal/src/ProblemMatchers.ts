// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

export type ProblemSeverity = 'error' | 'warning' | 'info';

/**
 * Represents a problem (generally an error or warning) detected in the console output.
 *
 * @public
 */
export interface IProblem {
  readonly matcherName: string;
  readonly message: string;
  readonly severity?: ProblemSeverity;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
  readonly endColumn?: number;
  readonly code?: string;
  readonly fullText: string;
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
   * @returns A problem if recognized, otherwise `undefined`.
   */
  match(line: string): IProblemMatchResult | undefined;
  /**
   * Flush any buffered state and return additional problems. Optional.
   */
  flush?(): IProblemMatchResult[];
}

/**
 * @public
 */
export type IProblemMatchResult = Omit<IProblem, 'matcherName' | 'fullText'> & {
  fullText?: string;
};

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
  regexp: string;
  file?: number;
  location?: number;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
  severity?: number;
  code?: number;
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
  name: string;
  severity?: 'error' | 'warning' | 'info';
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
    const patternList: IProblemPattern[] = Array.isArray(matcher.pattern)
      ? matcher.pattern
      : [matcher.pattern];
    if (patternList.length === 0) {
      continue; // skip invalid
    }

    const name: string = matcher.name;
    const defaultSeverity: ProblemSeverity | undefined = matcher.severity;

    // Precompile regex list
    const compiled: { re: RegExp; spec: IProblemPattern }[] = patternList.map((p) => {
      // The schema's regexp is the pattern without delimiters. Our collector provides each line including the trailing
      // "\n" (see onWriteChunk). VS Code's problem matchers operate on logical lines without the newline terminator.
      // To preserve intuitive authoring of patterns (which generally do not include an explicit newline), we make the
      // pattern tolerant of a trailing CR/LF. If the author already accounted for a newline explicitly we skip this.
      let source: string = p.regexp;
      // Heuristic: if the pattern already matches a newline at the end ("\\n" or "\\r?\\n" before the string end
      // anchor) then do not modify. Otherwise optionally allow a single line terminator produced by the chunk.
      if (/\\r?\\n\$/.test(source) || /\\n\$/.test(source)) {
        // already newline aware
      } else if (source.length > 0 && source.charAt(source.length - 1) === '$') {
        // Replace terminal $ with optional CRLF
        source = source.slice(0, -1) + '\\r?\\n$';
      } else {
        // No end anchor provided; just make the newline optional at the end.
        source = source + '(?:\\r?\\n)';
      }
      const re: RegExp = new RegExp(source);
      // keep loop flag if present
      const spec: IProblemPattern = Object.assign({}, p);
      return { re, spec };
    });

    if (compiled.length === 1) {
      // Single-line matcher
      const { re, spec } = compiled[0];
      result.push({
        name,
        match(line: string): IProblemMatchResult | undefined {
          const match: RegExpExecArray | null = re.exec(line);
          if (!match) return undefined;
          const file: string | undefined = spec.file ? match[spec.file] : undefined;
          let lineNumber: number | undefined;
          let columnNumber: number | undefined;
          let endLineNumber: number | undefined;
          let endColumnNumber: number | undefined;
          if (spec.location && match[spec.location]) {
            // VS Code allows several location formats: line, line:column, line,column,
            // or a full range like startLine,startColumn,endLine,endColumn
            const loc: string = match[spec.location];
            const parts: string[] = loc.split(/[,.:]/).filter((s) => s.length > 0);
            if (parts.length === 1) {
              lineNumber = toNumber(parts[0]);
            } else if (parts.length === 2) {
              lineNumber = toNumber(parts[0]);
              columnNumber = toNumber(parts[1]);
            } else if (parts.length === 4) {
              lineNumber = toNumber(parts[0]);
              columnNumber = toNumber(parts[1]);
              endLineNumber = toNumber(parts[2]);
              endColumnNumber = toNumber(parts[3]);
            }
          } else {
            lineNumber = spec.line ? toNumber(match[spec.line]) : undefined;
            columnNumber = spec.column ? toNumber(match[spec.column]) : undefined;
          }
          // If explicit endLine/endColumn groups are provided in the spec, prefer them when present
          if (spec.endLine && match[spec.endLine]) endLineNumber = toNumber(match[spec.endLine]);
          if (spec.endColumn && match[spec.endColumn]) endColumnNumber = toNumber(match[spec.endColumn]);
          const severity: ProblemSeverity | undefined = spec.severity
            ? normalizeSeverity(match[spec.severity])
            : defaultSeverity;
          const code: string | undefined = spec.code ? match[spec.code] : undefined;
          const message: string = match[spec.message] || '';
          return {
            file,
            line: lineNumber,
            column: columnNumber,
            endLine: endLineNumber,
            endColumn: endColumnNumber,
            severity,
            code,
            message
          };
        }
      });
    } else {
      // Multi-line matcher: we store progress index and collected captures
      result.push(createMultiLineMatcher(name, compiled, defaultSeverity));
    }
  }

  return result;
}

function toNumber(text: string | undefined): number | undefined {
  if (!text) return undefined;
  const n: number = parseInt(text, 10);
  return isNaN(n) ? undefined : n;
}

function normalizeSeverity(raw: string | undefined): ProblemSeverity | undefined {
  if (!raw) return undefined;
  const lowered: string = raw.toLowerCase();
  if (lowered.indexOf('err') === 0) return 'error';
  if (lowered.indexOf('warn') === 0) return 'warning';
  if (lowered.indexOf('info') === 0) return 'info';
  return undefined;
}

function createMultiLineMatcher(
  name: string,
  compiled: { re: RegExp; spec: IProblemPattern }[],
  defaultSeverity: ProblemSeverity | undefined
): IProblemMatcher {
  let currentIndex: number = 0;
  // If the last pattern is marked loop, we will allow repeated matches of the
  // last pattern. We track whether the last pattern is looping and whether
  // we've completed the non-looping prefix.
  const lastSpec: IProblemPattern = compiled[compiled.length - 1].spec;
  const lastIsLoop: boolean = !!lastSpec.loop;
  interface ICapturesMutable {
    file?: string;
    line?: number;
    column?: number;
    endLine?: number;
    endColumn?: number;
    severity?: ProblemSeverity;
    code?: string;
    messageParts?: string[];
  }
  const captures: ICapturesMutable = {};
  return {
    name,
    match(line: string): IProblemMatchResult | undefined {
      const { re, spec } = compiled[currentIndex];
      const reMatch: RegExpExecArray | null = re.exec(line);
      if (!reMatch) {
        // If we're in the middle of matching and the last pattern was looping,
        // a non-match on the loop should terminate the loop but we may want to
        // attempt to see if this line starts a fresh match from the beginning.
        if (currentIndex > 0 && lastIsLoop && currentIndex === compiled.length) {
          // We had completed the sequence including at least one loop iteration,
          // but current line didn't match the loop again. Reset index and try
          // to match this line as the start of a new sequence.
          currentIndex = 0;
          // fall-through to try matching from index 0 below
        } else {
          currentIndex = 0;
          return undefined;
        }
      }

      // If reMatch was null and we fell through to re-run from start, we need
      // to try matching compiled[0] against the current line. Compute again.
      let effectiveMatch: RegExpExecArray | null = reMatch;
      let effectiveSpec: IProblemPattern = spec;
      if (!effectiveMatch && currentIndex === 0) {
        const { re: re0, spec: spec0 } = compiled[0];
        effectiveMatch = re0.exec(line);
        if (!effectiveMatch) {
          return undefined;
        }
        effectiveSpec = spec0;
        // set currentIndex to 1 if there are multiple patterns, otherwise to length
        if (compiled.length > 1) {
          currentIndex = 1;
        } else {
          currentIndex = compiled.length;
        }
      } else if (effectiveMatch) {
        // Normal advance
        currentIndex++;
      }

      const reMatchUsed: RegExpExecArray = effectiveMatch as RegExpExecArray;
      const usedSpec: IProblemPattern = effectiveSpec as IProblemPattern;

      // Capture fields from this line
      if (usedSpec.file && reMatchUsed[usedSpec.file]) captures.file = reMatchUsed[usedSpec.file];
      if (usedSpec.location && reMatchUsed[usedSpec.location]) {
        const loc: string = reMatchUsed[usedSpec.location];
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
        if (usedSpec.line && reMatchUsed[usedSpec.line]) captures.line = toNumber(reMatchUsed[usedSpec.line]);
        if (usedSpec.column && reMatchUsed[usedSpec.column])
          captures.column = toNumber(reMatchUsed[usedSpec.column]);
      }
      // Respect explicit endLine/endColumn spec if provided
      if (usedSpec.endLine && reMatchUsed[usedSpec.endLine])
        captures.endLine = toNumber(reMatchUsed[usedSpec.endLine]);
      if (usedSpec.endColumn && reMatchUsed[usedSpec.endColumn])
        captures.endColumn = toNumber(reMatchUsed[usedSpec.endColumn]);
      if (usedSpec.severity && reMatchUsed[usedSpec.severity]) {
        captures.severity = normalizeSeverity(reMatchUsed[usedSpec.severity]) || defaultSeverity;
      } else if (!captures.severity && defaultSeverity) {
        captures.severity = defaultSeverity;
      }
      if (usedSpec.code && reMatchUsed[usedSpec.code]) captures.code = reMatchUsed[usedSpec.code];
      if (usedSpec.message && reMatchUsed[usedSpec.message]) {
        if (!captures.messageParts) captures.messageParts = [];
        captures.messageParts.push(reMatchUsed[usedSpec.message]);
      }

      // If we still need more lines (haven't reached final pattern), continue
      if (currentIndex < compiled.length) {
        return undefined; // Need more lines
      }

      // Completed sequence (we matched through the final pattern at least once)
      const message: string = (captures.messageParts || []).join('\n');
      const problem: IProblemMatchResult = {
        file: captures.file,
        line: captures.line,
        column: captures.column,
        endLine: captures.endLine,
        endColumn: captures.endColumn,
        severity: captures.severity || defaultSeverity,
        code: captures.code,
        message
      };
      // If last pattern loops, we should remain ready to match the last pattern again.
      // Otherwise, reset state for the next match.
      if (lastIsLoop) {
        // Keep the captures (messageParts cleared) and set index to compiled.length (meaning last matched)
        currentIndex = compiled.length;
      } else {
        currentIndex = 0;
        captures.file = undefined;
        captures.line = undefined;
        captures.column = undefined;
        captures.endLine = undefined;
        captures.endColumn = undefined;
        captures.severity = undefined;
        captures.code = undefined;
        captures.messageParts = [];
      }
      return problem;
    }
  };
}
