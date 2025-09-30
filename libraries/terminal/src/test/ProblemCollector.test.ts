// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProblemCollector } from '../ProblemCollector';
import {
  parseProblemMatchersJson,
  type IProblemMatcher,
  type IProblem,
  type IProblemMatcherJson
} from '@rushstack/problem-matcher/lib/ProblemMatcher';
import { TerminalChunkKind } from '../ITerminalChunk';

class ErrorLineMatcher implements IProblemMatcher {
  public readonly name: string = 'errorLine';
  private readonly _regex: RegExp = /^ERROR:\s*(.*)\n$/;
  public exec(line: string): IProblem | false {
    const match: RegExpExecArray | null = this._regex.exec(line);
    if (match) {
      return {
        matcherName: this.name,
        message: match[1],
        severity: 'error'
      };
    }
    return false;
  }
}

describe('ProblemCollector', () => {
  it('collects a simple error line', () => {
    const collector: ProblemCollector = new ProblemCollector({
      matchers: [new ErrorLineMatcher()]
    });

    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'hello world\n' });
    collector.writeChunk({
      kind: TerminalChunkKind.Stdout,
      text: 'ERROR: something bad happened in stdout\n'
    });
    collector.writeChunk({
      kind: TerminalChunkKind.Stderr,
      text: 'ERROR: something bad happened in stderr\n'
    });
    collector.close();

    const { problems } = collector;
    expect(problems.size).toBe(2);
    const [firstProblem, secondProblem] = Array.from(problems);
    expect(firstProblem.message).toBe('something bad happened in stdout');
    expect(firstProblem.severity).toBe('error');
    expect(firstProblem.matcherName).toBe('errorLine');
    expect(secondProblem.message).toBe('something bad happened in stderr');
    expect(secondProblem.severity).toBe('error');
    expect(secondProblem.matcherName).toBe('errorLine');
  });
});

describe('VSCodeProblemMatcherAdapter - additional location formats', () => {
  it('parses a location group like "line,column" in a single group', () => {
    const matcherPattern = {
      name: 'loc-group',
      pattern: {
        // Example: src/file.ts(10,5): message
        // NOTE: Escape \\d so the RegExp sees the digit character class
        regexp: '^(.*)\\((\\d+,\\d+)\\): (.*)$',
        file: 1,
        location: 2,
        message: 3
      }
    } satisfies IProblemMatcherJson;

    const matchers = parseProblemMatchersJson([matcherPattern]);
    const collector = new ProblemCollector({ matchers });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'src/a.c(10,5): something happened\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    const [firstProblem] = Array.from(problems);
    expect(firstProblem.file).toBe('src/a.c');
    expect(firstProblem.line).toBe(10);
    expect(firstProblem.column).toBe(5);
    expect(firstProblem.message).toContain('something happened');
  });

  it('parses explicit endLine and endColumn groups', () => {
    const matcherPattern = {
      name: 'end-range',
      pattern: {
        // Example: file(10,5,12,20): message
        regexp: '^(.*)\\((\\d+),(\\d+),(\\d+),(\\d+)\\): (.*)$',
        file: 1,
        // We intentionally do NOT use "location" here; use explicit groups
        line: 2,
        column: 3,
        endLine: 4,
        endColumn: 5,
        message: 6
      }
    } satisfies IProblemMatcherJson;

    const matchers = parseProblemMatchersJson([matcherPattern]);
    const collector = new ProblemCollector({ matchers });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'lib/x.c(10,5,12,20): multi-line issue\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    const [firstProblem] = Array.from(problems);
    expect(firstProblem.file).toBe('lib/x.c');
    expect(firstProblem.line).toBe(10);
    expect(firstProblem.column).toBe(5);
    expect(firstProblem.endLine).toBe(12);
    expect(firstProblem.endColumn).toBe(20);
    expect(firstProblem.message).toContain('multi-line issue');
  });
});

describe('VSCodeProblemMatcherAdapter', () => {
  it('converts and matches a single-line pattern', () => {
    const matcherPattern = {
      name: 'tsc-like',
      pattern: {
        // Example: src/file.ts(10,5): error TS1005: ';' expected
        regexp: '^(.*)\\((\\d+),(\\d+)\\): (error|warning) (TS\\d+): (.*)$',
        file: 1,
        line: 2,
        column: 3,
        severity: 4,
        code: 5,
        message: 6
      }
    } satisfies IProblemMatcherJson;

    const matchers = parseProblemMatchersJson([matcherPattern]);
    const collector = new ProblemCollector({ matchers });
    collector.writeChunk({
      kind: TerminalChunkKind.Stderr,
      text: "src/file.ts(10,5): error TS1005: ' ; ' expected\n"
    });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    const [firstProblem] = Array.from(problems);
    expect(firstProblem.file).toBe('src/file.ts');
    expect(firstProblem.line).toBe(10);
    expect(firstProblem.column).toBe(5);
    expect(firstProblem.code).toBe('TS1005');
    expect(firstProblem.severity).toBe('error');
  });

  it('converts and matches a multi-line pattern', () => {
    const matcherPattern = {
      name: 'multi',
      pattern: [
        {
          // First line: File path
          regexp: '^In file (.*)$',
          file: 1,
          message: 1 // placeholder, will collect below as well
        },
        {
          // Second line: location
          regexp: '^Line (\\d+), Col (\\d+)$',
          line: 1,
          column: 2,
          message: 1
        },
        {
          // Third line: severity and message
          regexp: '^(error|warning): (.*)$',
          severity: 1,
          message: 2
        }
      ]
    } satisfies IProblemMatcherJson;
    const matchers = parseProblemMatchersJson([matcherPattern]);
    const collector = new ProblemCollector({ matchers });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'In file src/foo.c\n' });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'Line 42, Col 7\n' });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'error: something bad happened\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    const [firstProblem] = Array.from(problems);
    expect(firstProblem.file).toBe('src/foo.c');
    expect(firstProblem.line).toBe(42);
    expect(firstProblem.column).toBe(7);
    expect(firstProblem.severity).toBe('error');
    expect(firstProblem.message).toContain('something bad');
  });

  it('handles a multi-line pattern whose last pattern loops producing multiple problems', () => {
    // Simulate a tool summary line followed by multiple TypeScript style error lines.
    // The last pattern uses `loop: true` so each subsequent matching line yields a problem.
    const matcherPattern = {
      name: 'ts-loop-errors',
      severity: 'error',
      pattern: [
        {
          // Summary line: Encountered 6 errors
          regexp: '^Encountered (\\d+) errors$',
          // Must supply a message group per interface; we capture the count but don't rely on it.
          message: 1
        },
        {
          // Error detail lines (one per problem):
          //   [build:typescript] path/to/file.ts:9:3 - (TS2578) Message text
          regexp: '^\\s+\\[build:typescript\\]\\s+(.*):(\\d+):(\\d+) - \\((TS\\d+)\\) (.*)$',
          file: 1,
          line: 2,
          column: 3,
          code: 4,
          message: 5,
          loop: true
        }
      ]
    } satisfies IProblemMatcherJson;

    const errorLines: string[] = [
      'Encountered 6 errors',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:9:3 - (TS2578) Unused @ts-expect-error directive.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:11:3 - (TS2578) Unused @ts-expect-error directive.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:19:3 - (TS2578) Unused @ts-expect-error directive.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:24:3 - (TS2578) Unused @ts-expect-error directive.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:26:3 - (TS2578) Unused @ts-expect-error directive.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:34:3 - (TS2578) Unused @ts-expect-error directive.'
    ];

    const matchers = parseProblemMatchersJson([matcherPattern]);
    const collector = new ProblemCollector({ matchers });
    for (const line of errorLines) {
      collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: line + '\n' });
    }
    collector.close();

    const { problems } = collector;
    expect(problems.size).toBe(6);

    const problemLineNumbers: number[] = [9, 11, 19, 24, 26, 34];
    const problemsArray = Array.from(problems);
    for (let i = 0; i < 6; i++) {
      const p = problemsArray[i];
      expect(p.file).toContain(
        'vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts'
      );
      expect(p.line).toBe(problemLineNumbers[i]);
      expect(p.column).toBe(3); // All sample lines have column 3
      expect(p.code).toBe('TS2578');
      expect(p.severity).toBe('error');
      expect(p.message).toContain('Unused @ts-expect-error directive.');
    }
  });

  it('handles looped pattern with per-line severity token', () => {
    const matcherPattern = {
      name: 'loop-with-severity',
      pattern: [
        {
          regexp: '^Start Problems$',
          message: 0 // we will just push empty placeholder
        },
        {
          // e.g. "Error path/file.ts(10,5): code123: Something happened"
          regexp: '^(Error|Warning|Info) (.*)\\((\\d+),(\\d+)\\): (\\w+): (.*)$',
          severity: 1, // E -> error, W -> warning (normalization should map)
          file: 2,
          line: 3,
          column: 4,
          code: 5,
          message: 6,
          loop: true
        }
      ]
    } satisfies IProblemMatcherJson;

    const lines = [
      'Error lib/a.ts(10,5): CODE100: First thing',
      'Warning lib/b.ts(20,1): CODE200: Second thing',
      'Error lib/c.ts(30,9): CODE300: Third thing',
      'Info lib/d.ts(40,2): CODE400: Fourth thing'
    ];

    const matchers = parseProblemMatchersJson([matcherPattern]);
    const collector = new ProblemCollector({ matchers });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'Start Problems\n' });
    for (const l of lines) collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: l + '\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(4);

    const problemsArray = Array.from(problems);
    expect(problemsArray.map((p) => p.severity)).toEqual(['error', 'warning', 'error', 'info']);
    expect(problemsArray.map((p) => p.code)).toEqual(['CODE100', 'CODE200', 'CODE300', 'CODE400']);
    expect(problemsArray[0].file).toBe('lib/a.ts');
    expect(problemsArray[1].file).toBe('lib/b.ts');
    expect(problemsArray[2].file).toBe('lib/c.ts');
    expect(problemsArray[3].file).toBe('lib/d.ts');
  });
});
