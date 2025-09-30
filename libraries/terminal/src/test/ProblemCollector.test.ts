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
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector: ProblemCollector = new ProblemCollector({
      matchers: [new ErrorLineMatcher()],
      onProblem: onProblemSpy
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
    expect(onProblemSpy).toHaveBeenCalledTimes(2);
    expect(onProblemSpy).toHaveBeenNthCalledWith(1, {
      matcherName: 'errorLine',
      message: 'something bad happened in stdout',
      severity: 'error'
    });
    expect(onProblemSpy).toHaveBeenNthCalledWith(2, {
      matcherName: 'errorLine',
      message: 'something bad happened in stderr',
      severity: 'error'
    });
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
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector = new ProblemCollector({ matchers, onProblem: onProblemSpy });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'src/a.c(10,5): something happened\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    expect(onProblemSpy).toHaveBeenCalledTimes(1);
    expect(onProblemSpy).toHaveBeenNthCalledWith(1, {
      matcherName: 'loc-group',
      file: 'src/a.c',
      line: 10,
      column: 5,
      message: 'something happened',
      code: undefined,
      endColumn: undefined,
      endLine: undefined,
      severity: undefined
    } satisfies IProblem);
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
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector = new ProblemCollector({ matchers, onProblem: onProblemSpy });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'lib/x.c(10,5,12,20): multi-line issue\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    expect(onProblemSpy).toHaveBeenCalledTimes(1);
    expect(onProblemSpy).toHaveBeenNthCalledWith(1, {
      matcherName: 'end-range',
      file: 'lib/x.c',
      line: 10,
      column: 5,
      endLine: 12,
      endColumn: 20,
      message: 'multi-line issue',
      code: undefined,
      severity: undefined
    } satisfies IProblem);
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
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector = new ProblemCollector({ matchers, onProblem: onProblemSpy });
    collector.writeChunk({
      kind: TerminalChunkKind.Stderr,
      text: "src/file.ts(10,5): error TS1005: ' ; ' expected\n"
    });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    expect(onProblemSpy).toHaveBeenCalledTimes(1);
    expect(onProblemSpy).toHaveBeenNthCalledWith(1, {
      matcherName: 'tsc-like',
      file: 'src/file.ts',
      line: 10,
      column: 5,
      code: 'TS1005',
      severity: 'error',
      message: "' ; ' expected",
      endColumn: undefined,
      endLine: undefined
    } satisfies IProblem);
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
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector = new ProblemCollector({ matchers, onProblem: onProblemSpy });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'In file src/foo.c\n' });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'Line 42, Col 7\n' });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'error: something bad happened\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(1);
    expect(onProblemSpy).toHaveBeenCalledTimes(1);
    expect(onProblemSpy).toHaveBeenNthCalledWith(1, {
      matcherName: 'multi',
      file: 'src/foo.c',
      line: 42,
      column: 7,
      severity: 'error',
      message: 'something bad happened',
      code: undefined,
      endColumn: undefined,
      endLine: undefined
    } satisfies IProblem);
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
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:9:3 - (TS2578) Unused @ts-expect-error directive 1.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:11:3 - (TS2578) Unused @ts-expect-error directive 2.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:19:3 - (TS2578) Unused @ts-expect-error directive 3.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:24:3 - (TS2578) Unused @ts-expect-error directive 4.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:26:3 - (TS2578) Unused @ts-expect-error directive 5.',
      '  [build:typescript] vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts:34:3 - (TS2578) Unused @ts-expect-error directive 6.'
    ];

    const matchers = parseProblemMatchersJson([matcherPattern]);
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector = new ProblemCollector({ matchers, onProblem: onProblemSpy });
    for (const line of errorLines) {
      collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: line + '\n' });
    }
    collector.close();

    const { problems } = collector;
    expect(problems.size).toBe(6);
    expect(onProblemSpy).toHaveBeenCalledTimes(6);

    const problemLineNumbers: number[] = [9, 11, 19, 24, 26, 34];
    for (let i = 0; i < 6; i++) {
      expect(onProblemSpy).toHaveBeenNthCalledWith(i + 1, {
        matcherName: 'ts-loop-errors',
        file: 'vscode-extensions/debug-certificate-manager-vscode-extension/src/certificates.ts',
        line: problemLineNumbers[i],
        column: 3,
        code: 'TS2578',
        severity: 'error',
        message: `Unused @ts-expect-error directive ${i + 1}.`,
        endColumn: undefined,
        endLine: undefined
      } satisfies IProblem);
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
    const onProblemSpy = jest.fn<void, [IProblem]>();
    const collector = new ProblemCollector({ matchers, onProblem: onProblemSpy });
    collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: 'Start Problems\n' });
    for (const l of lines) collector.writeChunk({ kind: TerminalChunkKind.Stdout, text: l + '\n' });
    collector.close();
    const { problems } = collector;
    expect(problems.size).toBe(4);
    expect(onProblemSpy).toHaveBeenCalledTimes(4);

    const problemCodes: string[] = ['CODE100', 'CODE200', 'CODE300', 'CODE400'];
    const problemColumns: number[] = [5, 1, 9, 2];
    const problemSeverities: ('error' | 'warning' | 'info')[] = ['error', 'warning', 'error', 'info'];
    const problemMessages: string[] = ['First thing', 'Second thing', 'Third thing', 'Fourth thing'];
    for (let i = 0; i < 4; i++) {
      expect(onProblemSpy).toHaveBeenNthCalledWith(i + 1, {
        matcherName: 'loop-with-severity',
        file: `lib/${String.fromCharCode('a'.charCodeAt(0) + i)}.ts`,
        line: (i + 1) * 10,
        column: problemColumns[i],
        code: problemCodes[i],
        severity: problemSeverities[i],
        message: problemMessages[i],
        endColumn: undefined,
        endLine: undefined
      } satisfies IProblem);
    }
  });
});
