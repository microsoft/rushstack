// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { ProblemCollector } from '../ProblemCollector';
import {
  parseProblemMatchersJson,
  type IProblemMatcher,
  type IProblemMatchResult,
  type IProblemMatcherJson
} from '../ProblemMatchers';
import { TerminalChunkKind } from '../ITerminalChunk';

class ErrorLineMatcher implements IProblemMatcher {
  public readonly name: string = 'errorLine';
  private readonly _regex: RegExp = /^ERROR:\s*(.*)\n$/;
  public match(line: string): IProblemMatchResult | undefined {
    const match: RegExpExecArray | null = this._regex.exec(line);
    if (match) {
      return {
        message: match[1],
        severity: 'error'
      };
    }
    return undefined;
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

    const problems = collector.getProblems();
    expect(problems.length).toBe(2);
    expect(problems[0].message).toBe('something bad happened in stdout');
    expect(problems[0].severity).toBe('error');
    expect(problems[0].matcherName).toBe('errorLine');
    expect(problems[1].message).toBe('something bad happened in stderr');
    expect(problems[1].severity).toBe('error');
    expect(problems[1].matcherName).toBe('errorLine');
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
    const problems = collector.getProblems();
    expect(problems.length).toBe(1);
    expect(problems[0].file).toBe('src/a.c');
    expect(problems[0].line).toBe(10);
    expect(problems[0].column).toBe(5);
    expect(problems[0].message).toContain('something happened');
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
    const problems = collector.getProblems();
    expect(problems.length).toBe(1);
    expect(problems[0].file).toBe('lib/x.c');
    expect(problems[0].line).toBe(10);
    expect(problems[0].column).toBe(5);
    expect(problems[0].endLine).toBe(12);
    expect(problems[0].endColumn).toBe(20);
    expect(problems[0].message).toContain('multi-line issue');
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
    const probs = collector.getProblems();
    expect(probs.length).toBe(1);
    expect(probs[0].file).toBe('src/file.ts');
    expect(probs[0].line).toBe(10);
    expect(probs[0].column).toBe(5);
    expect(probs[0].code).toBe('TS1005');
    expect(probs[0].severity).toBe('error');
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
    const problems = collector.getProblems();
    expect(problems.length).toBe(1);
    expect(problems[0].file).toBe('src/foo.c');
    expect(problems[0].line).toBe(42);
    expect(problems[0].column).toBe(7);
    expect(problems[0].severity).toBe('error');
    expect(problems[0].message).toContain('something bad');
  });
});
