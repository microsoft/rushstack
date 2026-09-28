// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// Keep this module free of heavy imports: start.ts loads it (through AgentProgressRenderer) before
// @microsoft/rush-lib.

const ESC: string = String.fromCharCode(27);
const BEL: string = String.fromCharCode(7);
/** Matches ANSI CSI sequences (colors, cursor movement) and OSC sequences (hyperlinks, titles). */
const ANSI_ESCAPE_PATTERN: RegExp = new RegExp(
  `${ESC}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${BEL}${ESC}]*(?:${BEL}|${ESC}\\\\))`,
  'g'
);
/** A Heft task prefix such as `[build:typescript]`, followed by the line's content. */
const TASK_PREFIX_PATTERN: RegExp = /^(\[[^\]\s]+\])\s*(.*)$/;
/**
 * Lines that carry no diagnostic value in a short excerpt: JavaScript stack frames, `Require stack:` and its
 * module paths, code frames (`> 113 | code`, `    |   ^`), decorative banners (`---- build finished ----`),
 * and the lines Rush itself writes into every operation's output (the command it invokes and the build cache
 * status). A failed operation is always a cache miss, and "not found" would otherwise make that line look
 * like an error.
 */
const NOISE_PATTERNS: ReadonlyArray<RegExp> = [
  /^at\s.*(?::\d+(?::\d+)?\)?|\((?:index \d+|native|<anonymous>)\))$/,
  /^Require stack:$/,
  /^-\s+(?:\/|[A-Za-z]:[\\/]|\\\\)\S*$/,
  /^(?:>\s*)?\d*\s*\|/,
  /^[-=]{3,}(?:\s.*\s[-=]{3,})?$/,
  /^Invoking(?: \((?:initial|incremental)\))?: /,
  /^(?:This project was not found in the build cache|Build cache hit|Successfully set cache entry)\.$/,
  /^Caching build output folders: /
];
const ERROR_PATTERN: RegExp =
  /\b(?:errors?|exception|fatal|failed|failure|FAIL|cannot|could not|unable to|not found|TS\d{4,5})\b|\bERR(?:!|_[A-Z0-9_]+)|[●✖✕]/i;
const NO_ERRORS_PATTERN: RegExp = /\b(?:0|no) errors?\b/i;
/** Lines without any letter (bare exit codes, progress percentages, caret markers) explain nothing. */
const LETTER_PATTERN: RegExp = /\p{L}/u;

/** Lines longer than this keep their start and end, joined by an ellipsis. */
const MAX_LINE_LENGTH: number = 300;
const CLIPPED_LINE_TAIL_LENGTH: number = 80;
/** Raw lines are clipped to this length before they are classified, so huge lines cost little. */
const MAX_RAW_LINE_LENGTH: number = 4096;
/** A partial line longer than this (for example a progress bar without newlines) is recorded as a line. */
const MAX_PARTIAL_LINE_LENGTH: number = 65536;
const HEAD_LINES: number = 8;
const TAIL_LINES: number = 3;
const ERROR_LINES: number = 8;
/** Excerpt rows reserved for the last lines, which usually contain a tool's own error summary. */
const TAIL_RESERVE: number = 2;

type OutputStream = 'stdout' | 'stderr';

interface IExcerptLine {
  /** The arrival order across both streams, used to print the excerpt in output order. */
  readonly index: number;
  readonly text: string;
}

interface IErrorLine extends IExcerptLine {
  /** The line that followed this error line, which often continues its message. */
  context?: IExcerptLine;
}

interface IStreamLines {
  readonly head: IExcerptLine[];
  readonly tail: IExcerptLine[];
  partial: string;
}

/**
 * Normalizes one line of operation output for an excerpt: removes ANSI escapes and carriage-return overwrites,
 * and collapses whitespace after a Heft task prefix. Returns undefined for lines that are empty or noise.
 */
export function normalizeExcerptLine(rawLine: string): string | undefined {
  let line: string = clipLine(rawLine, MAX_RAW_LINE_LENGTH);
  if (line.includes(ESC)) {
    line = line.replace(ANSI_ESCAPE_PATTERN, '');
  }
  if (line.endsWith('\r')) {
    line = line.slice(0, -1);
  }
  line = line.slice(line.lastIndexOf('\r') + 1).trim();
  const prefixMatch: RegExpMatchArray | null = TASK_PREFIX_PATTERN.exec(line);
  const content: string = prefixMatch ? prefixMatch[2].trim() : line;
  if (!LETTER_PATTERN.test(content) || NOISE_PATTERNS.some((pattern) => pattern.test(content))) {
    return undefined;
  }
  return clipLine(prefixMatch ? `${prefixMatch[1]} ${content}` : content, MAX_LINE_LENGTH);
}

/** Returns whether a normalized line looks like an error message. */
export function isErrorLine(line: string): boolean {
  return ERROR_PATTERN.test(line) && !NO_ERRORS_PATTERN.test(line);
}

/** Shortens a line to at most `maxLength` characters, keeping its start and its end. */
export function clipLine(line: string, maxLength: number): string {
  if (line.length <= maxLength) {
    return line;
  }
  const tailLength: number = Math.min(CLIPPED_LINE_TAIL_LENGTH, Math.floor(maxLength / 3));
  return `${line.slice(0, maxLength - tailLength - 1)}…${line.slice(line.length - tailLength)}`;
}

/**
 * Keeps a short excerpt of one operation's output, to explain a failure in a few lines.
 *
 * @remarks
 * Memory use does not grow with the output: only the first and last lines of each stream are kept, plus the
 * first distinct error-looking lines of either stream, each with the next line of the same stream. The
 * excerpt prefers error lines, then the end of the output (where tools print their error summary), then its
 * beginning. Like the native `StdioSummarizer`, head and tail lines come from stderr when the operation wrote
 * any, otherwise from stdout; error lines come from both, because tools such as tsc and eslint report errors
 * on stdout. Stack frames, `Require stack:` paths and code frames are dropped, so they cannot crowd out the
 * cause.
 */
export class OperationOutputExcerpt {
  readonly #streams: Record<OutputStream, IStreamLines> = {
    stdout: { head: [], tail: [], partial: '' },
    stderr: { head: [], tail: [], partial: '' }
  };
  readonly #errors: IErrorLine[] = [];
  readonly #errorTexts: Set<string> = new Set();
  /**
   * Per stream, the error line whose context is the stream's next line. The streams are separate pipes, so the
   * next line of the other stream is unrelated to the error.
   */
  readonly #pendingContext: Record<OutputStream, IErrorLine | undefined> = {
    stdout: undefined,
    stderr: undefined
  };
  #lineCount: number = 0;

  /** The number of non-empty, non-noise lines seen so far. */
  public get lineCount(): number {
    return this.#lineCount;
  }

  /** Records a chunk of output; a line split across chunks is joined. */
  public append(text: string, stream: OutputStream): void {
    const lines: IStreamLines = this.#streams[stream];
    const pieces: string[] = (lines.partial + text).split('\n');
    lines.partial = pieces.pop() ?? '';
    if (lines.partial.length > MAX_PARTIAL_LINE_LENGTH) {
      pieces.push(lines.partial);
      lines.partial = '';
    }
    for (const piece of pieces) {
      this.#addLine(piece, stream);
    }
  }

  /** Records any unterminated last lines. Further output is still accepted. */
  public flush(): void {
    for (const stream of ['stdout', 'stderr'] as const) {
      const lines: IStreamLines = this.#streams[stream];
      if (lines.partial) {
        const partial: string = lines.partial;
        lines.partial = '';
        this.#addLine(partial, stream);
      }
    }
  }

  /** Returns at most `maxLines` lines that best explain the output, in output order. */
  public getExcerpt(maxLines: number): string[] {
    this.flush();
    const preferred: IStreamLines = this.#streams.stderr.head.length
      ? this.#streams.stderr
      : this.#streams.stdout;
    const chosen: Map<number, IExcerptLine> = new Map();
    const texts: Set<string> = new Set();
    const add = (line: IExcerptLine | undefined, limit: number): void => {
      if (line && chosen.size < limit && !chosen.has(line.index) && !texts.has(line.text)) {
        chosen.set(line.index, line);
        texts.add(line.text);
      }
    };
    const errorLimit: number = Math.max(1, maxLines - TAIL_RESERVE);
    for (const errorLine of this.#errors) {
      add(errorLine, errorLimit);
      add(errorLine.context, errorLimit);
    }
    // Newest first, so the last line (often the tool's own error summary) is always kept.
    for (let i: number = preferred.tail.length - 1; i >= 0; i--) {
      add(preferred.tail[i], maxLines);
    }
    for (const errorLine of this.#errors) {
      add(errorLine, maxLines);
    }
    for (const line of preferred.head) {
      add(line, maxLines);
    }
    return [...chosen.values()].sort((a, b) => a.index - b.index).map((line) => line.text);
  }

  #addLine(rawLine: string, stream: OutputStream): void {
    const text: string | undefined = normalizeExcerptLine(rawLine);
    if (text === undefined) {
      return;
    }
    const line: IExcerptLine = { index: this.#lineCount++, text };
    const lines: IStreamLines = this.#streams[stream];
    if (lines.head.length < HEAD_LINES) {
      lines.head.push(line);
    }
    lines.tail.push(line);
    if (lines.tail.length > TAIL_LINES) {
      lines.tail.shift();
    }
    const pendingContext: IErrorLine | undefined = this.#pendingContext[stream];
    if (pendingContext) {
      pendingContext.context = line;
      this.#pendingContext[stream] = undefined;
    }
    if (this.#errors.length < ERROR_LINES && !this.#errorTexts.has(text) && isErrorLine(text)) {
      const errorLine: IErrorLine = { ...line };
      this.#errors.push(errorLine);
      this.#errorTexts.add(text);
      this.#pendingContext[stream] = errorLine;
    }
  }
}
