// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { parseProblemMatchersJson, type IProblemMatcherJson } from '../ProblemMatcher';

describe('parseProblemMatchersJson - single line', () => {
  it('matches a tsc style line', () => {
    const matcher: IProblemMatcherJson = {
      name: 'tsc-single',
      pattern: {
        regexp: '^(.*)\\((\\d+),(\\d+)\\): (error|warning) (TS\\d+): (.*)$',
        file: 1,
        line: 2,
        column: 3,
        severity: 4,
        code: 5,
        message: 6
      }
    };

    const [compiled] = parseProblemMatchersJson([matcher]);
    const line = 'src/example.ts(12,34): error TS1000: Something bad happened\n';
    const prob = compiled.exec(line);
    expect(prob).toBeTruthy();
    if (prob !== false) {
      expect(prob.file).toBe('src/example.ts');
      expect(prob.line).toBe(12);
      expect(prob.column).toBe(34);
      expect(prob.code).toBe('TS1000');
      expect(prob.severity).toBe('error');
      expect(prob.message).toBe('Something bad happened');
    }
  });

  it('returns false for non-matching line', () => {
    const matcher: IProblemMatcherJson = {
      name: 'simple',
      pattern: {
        regexp: '^(.*)\\((\\d+),(\\d+)\\): error (E\\d+): (.*)$',
        file: 1,
        line: 2,
        column: 3,
        code: 4,
        message: 5
      }
    };
    const [compiled] = parseProblemMatchersJson([matcher]);
    const notMatched = compiled.exec('This will not match\n');
    expect(notMatched).toBe(false);
  });
});

describe('parseProblemMatchersJson - default severity', () => {
  it('applies default severity when group absent', () => {
    const matcher: IProblemMatcherJson = {
      name: 'default-sev',
      severity: 'warning',
      pattern: {
        regexp: '^(.*):(\\d+):(\\d+): (W\\d+): (.*)$',
        file: 1,
        line: 2,
        column: 3,
        code: 4,
        message: 5
      }
    };
    const [compiled] = parseProblemMatchersJson([matcher]);
    const prob = compiled.exec('lib/z.c:5:7: W123: Be careful\n');
    if (prob === false) throw new Error('Expected match');
    expect(prob.severity).toBe('warning');
    expect(prob.code).toBe('W123');
  });
});

describe('parseProblemMatchersJson - multi line', () => {
  it('accumulates message parts and resets after emit', () => {
    const matcher: IProblemMatcherJson = {
      name: 'multi-basic',
      pattern: [
        { regexp: '^File: (.*)$', file: 1, message: 0 },
        { regexp: '^Pos: (\\d+),(\\d+)$', line: 1, column: 2, message: 0 },
        { regexp: '^Severity: (error|warning)$', severity: 1, message: 0 },
        { regexp: '^Msg: (.*)$', message: 1 }
      ]
    };
    const [compiled] = parseProblemMatchersJson([matcher]);
    // Feed lines
    expect(compiled.exec('File: src/a.c\n')).toBe(false);
    expect(compiled.exec('Pos: 10,20\n')).toBe(false);
    expect(compiled.exec('Severity: error\n')).toBe(false);
    const final = compiled.exec('Msg: Something broke\n');
    if (final === false) throw new Error('Expected final match');
    expect(final.file).toBe('src/a.c');
    expect(final.line).toBe(10);
    expect(final.column).toBe(20);
    expect(final.severity).toBe('error');
    // Ensure message assembled (empty placeholders filtered, only last part meaningful)
    expect(final.message).toBe('Something broke');

    // Next unrelated line should not erroneously reuse old state
    const no = compiled.exec('Msg: stray\n');
    expect(no).toBe(false);
  });
});

describe('parseProblemMatchersJson - looping last pattern', () => {
  it('emits multiple problems after first sequence completion', () => {
    const matcher: IProblemMatcherJson = {
      name: 'looping',
      severity: 'error',
      pattern: [
        { regexp: '^Summary with (\\d+) issues$', message: 1 },
        {
          regexp: '^(.*)\\((\\d+),(\\d+)\\): (E\\d+): (.*)$',
          file: 1,
          line: 2,
          column: 3,
          code: 4,
          message: 5,
          loop: true
        }
      ]
    };
    const [compiled] = parseProblemMatchersJson([matcher]);
    // Start sequence
    expect(compiled.exec('Summary with 2 issues\n')).toBe(false);
    const first = compiled.exec('src/a.c(1,2): E001: First\n');
    const second = compiled.exec('src/b.c(3,4): E002: Second\n');
    if (first === false || second === false) throw new Error('Expected loop matches');
    expect(first.file).toBe('src/a.c');
    expect(second.file).toBe('src/b.c');
    expect(first.code).toBe('E001');
    expect(second.code).toBe('E002');
    expect(first.severity).toBe('error');
    expect(second.severity).toBe('error');
    // Exiting loop with unrelated line resets state
    expect(compiled.exec('Unrelated line\n')).toBe(false);
  });
});

describe('parseProblemMatchersJson - location parsing variants', () => {
  it('parses (line,column) location group', () => {
    const matcher: IProblemMatcherJson = {
      name: 'loc-group',
      pattern: {
        regexp: '^(.*)\\((\\d+),(\\d+)\\): (.*)$',
        file: 1,
        line: 2,
        column: 3,
        message: 4
      }
    };
    const [compiled] = parseProblemMatchersJson([matcher]);
    const prob = compiled.exec('path/file.c(10,5): details here\n');
    if (prob === false) throw new Error('Expected match');
    expect(prob.file).toBe('path/file.c');
    expect(prob.line).toBe(10);
    expect(prob.column).toBe(5);
  });

  it('parses explicit endLine/endColumn groups', () => {
    const matcher: IProblemMatcherJson = {
      name: 'end-range',
      pattern: {
        regexp: '^(.*)\\((\\d+),(\\d+),(\\d+),(\\d+)\\): (.*)$',
        file: 1,
        line: 2,
        column: 3,
        endLine: 4,
        endColumn: 5,
        message: 6
      }
    };
    const [compiled] = parseProblemMatchersJson([matcher]);
    const prob = compiled.exec('lib/x.c(1,2,3,4): thing\n');
    if (prob === false) throw new Error('Expected match');
    expect(prob.endLine).toBe(3);
    expect(prob.endColumn).toBe(4);
  });
});
