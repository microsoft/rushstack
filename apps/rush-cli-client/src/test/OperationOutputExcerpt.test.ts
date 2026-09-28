// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  OperationOutputExcerpt,
  clipLine,
  isErrorLine,
  normalizeExcerptLine
} from '../OperationOutputExcerpt';

const ESC: string = String.fromCharCode(27);

// Shaped like a Heft plugin that fails to load: the cause is on one line, followed by a long require stack.
const REQUIRE_STACK_FAILURE: string = [
  '',
  'Internal Error: Could not load plugin from "/repo/tools/example-plugin/lib/ExamplePlugin.js": ' +
    "Error: Cannot find module '/repo/tools/example-plugin/lib/ExamplePlugin.js'",
  'Require stack:',
  ...Array.from(
    { length: 8 },
    (unused, i) =>
      `- /repo/common/temp/node_modules/.pnpm/@rushstack+heft@1.2.3/node_modules/@rushstack/heft/lib/m${i}.js`
  ),
  '',
  'You have encountered a software defect. Please consider reporting the issue to the maintainers of this application.',
  ''
].join('\n');

// Shaped like Heft's Jest plugin output: prefixed lines, a message, a code frame and stack frames per test.
function jestFailure(testNames: ReadonlyArray<string>): string {
  const lines: string[] = [];
  for (const [index, testName] of testNames.entries()) {
    lines.push(
      `[test:jest]   ● ${testName}`,
      '[test:jest] ',
      '[test:jest]     1',
      '[test:jest] ',
      '[test:jest]     ERROR: The following environment variables were found with the "RUSH_" prefix,',
      '[test:jest]     but they are not recognized by this version of Rush: RUSH_EXAMPLE',
      '[test:jest] ',
      '[test:jest]       11 |   if (result.status !== 0) {',
      '[test:jest]     > 12 |     throw new Error(`${result.status}`);',
      '[test:jest]          |           ^',
      '[test:jest]       13 |   }',
      '[test:jest] ',
      `[test:jest]       at runStep (src/test/example.test.ts:12:11)`,
      `[test:jest]       at Object.runStep (src/test/example.test.ts:${40 + index}:3)`,
      '[test:jest] '
    );
  }
  lines.push(`[test:jest] Error: ${testNames.length} Jest tests failed`, 'Encountered 1 error', '');
  return lines.join('\n');
}

describe(normalizeExcerptLine.name, () => {
  it('removes colors, carriage-return overwrites and the whitespace after a task prefix', () => {
    expect(normalizeExcerptLine(`${ESC}[31merror${ESC}[39m TS2304: x`)).toBe('error TS2304: x');
    expect(normalizeExcerptLine('progress 10%\rprogress 100%\r')).toBe('progress 100%');
    expect(normalizeExcerptLine('[build:lint]     Warning: src/x.ts:1:1')).toBe(
      '[build:lint] Warning: src/x.ts:1:1'
    );
    expect(normalizeExcerptLine(`${ESC}]8;;https://example.com${String.fromCharCode(7)}link`)).toBe('link');
  });

  it('drops empty, prefix-only and noise lines', () => {
    for (const line of [
      '',
      '   ',
      '[test:jest] ',
      '    at Object.<anonymous> (src/x.test.ts:12:19)',
      '    at async Promise.all (index 0)',
      '    at new Promise (<anonymous>)',
      'Require stack:',
      '- /repo/node_modules/x/lib/index.js',
      '- C:\\repo\\node_modules\\x\\lib\\index.js',
      '[test:jest]     > 12 |     throw new Error();',
      '[test:jest]          |           ^',
      ' ---- build started ---- ',
      '-------------------- Finished (12.407s) --------------------',
      'Invoking: heft run --only build -- --clean ',
      'Invoking (incremental): heft run --only build --',
      'This project was not found in the build cache.',
      'Build cache hit.',
      'Caching build output folders: lib, lib-commonjs',
      'Successfully set cache entry.'
    ]) {
      expect(normalizeExcerptLine(line)).toBeUndefined();
    }
  });

  it('keeps English lines that merely start with "at"', () => {
    expect(normalizeExcerptLine('at least one project failed')).toBe('at least one project failed');
  });

  it('clips very long lines, keeping their start and end', () => {
    const line: string | undefined = normalizeExcerptLine(
      `start ${'x'.repeat(10000)} Cannot find module 'y'`
    );
    expect(line?.length).toBe(300);
    expect(line?.startsWith('start ')).toBe(true);
    expect(line?.endsWith("Cannot find module 'y'")).toBe(true);
  });
});

describe(isErrorLine.name, () => {
  it.each([
    'src/x.ts(1,1): error TS1005: expected',
    'src/x.ts:1:1 - error TS2304: Cannot find name',
    '[test:jest]   ● suite › test',
    'Error: 3 Jest tests failed',
    'npm ERR! code ELIFECYCLE',
    'ERR_PNPM_FETCH_401 GET https://registry.example/pkg: Unauthorized',
    'Encountered 1 error',
    'FAIL src/x.test.ts',
    'Could not load plugin'
  ])('recognizes %s', (line) => {
    expect(isErrorLine(line)).toBe(true);
  });

  it.each([
    'Found 0 errors. Watching for file changes.',
    'Linting finished with no errors',
    'Compiling 12 files'
  ])('ignores %s', (line) => {
    expect(isErrorLine(line)).toBe(false);
  });
});

describe(clipLine.name, () => {
  it('leaves short lines alone', () => {
    expect(clipLine('short', 10)).toBe('short');
  });

  it('keeps the start and end of long lines', () => {
    expect(clipLine('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdef…xyz');
  });
});

describe(OperationOutputExcerpt.name, () => {
  it('shows the cause of a plugin load failure instead of its require stack', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append(REQUIRE_STACK_FAILURE, 'stderr');
    const lines: string[] = excerpt.getExcerpt(8);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^Internal Error: Could not load plugin/);
    expect(lines[0]).toContain("Cannot find module '");
    expect(lines[1]).toMatch(/^You have encountered a software defect/);
  });

  it('shows the failing tests, the message and the summary of a Jest failure', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append('[test:jest] PASS src/test/other.test.ts\n', 'stdout');
    excerpt.append(jestFailure(['test one', 'test two', 'test three']), 'stderr');
    expect(excerpt.getExcerpt(8)).toEqual([
      '[test:jest] ● test one',
      '[test:jest] ERROR: The following environment variables were found with the "RUSH_" prefix,',
      '[test:jest] but they are not recognized by this version of Rush: RUSH_EXAMPLE',
      '[test:jest] ● test two',
      '[test:jest] ● test three',
      '[test:jest] Error: 3 Jest tests failed',
      'Encountered 1 error'
    ]);
    expect(excerpt.getExcerpt(3)).toEqual([
      '[test:jest] ● test one',
      '[test:jest] Error: 3 Jest tests failed',
      'Encountered 1 error'
    ]);
  });

  it('finds errors that tools report on stdout', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append('[build:typescript] Using TypeScript version 5.8.2\n', 'stdout');
    excerpt.append('[build:typescript] src/x.ts:1:1 - error TS2304: Cannot find name "y".\n', 'stdout');
    excerpt.append('[build:typescript] Encountered 1 error\n', 'stderr');
    expect(excerpt.getExcerpt(8)).toEqual([
      '[build:typescript] src/x.ts:1:1 - error TS2304: Cannot find name "y".',
      '[build:typescript] Encountered 1 error'
    ]);
  });

  it("does not spend the error lines of a short excerpt on Rush's own cache and invocation lines", () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append('This project was not found in the build cache.\n', 'stdout');
    excerpt.append('Invoking (initial): heft run --only build -- --clean \n', 'stdout');
    excerpt.append('[build:typescript] Using TypeScript version 5.8.2\n', 'stdout');
    excerpt.append('[build:typescript] src/x.ts:1:1 - error TS2304: Cannot find name "y".\n', 'stderr');
    excerpt.append('[build:lint] Using ESLint version 9.37.0\n', 'stdout');
    excerpt.append('Error: Encountered 1 error\n', 'stderr');
    expect(excerpt.getExcerpt(3)).toEqual([
      '[build:typescript] src/x.ts:1:1 - error TS2304: Cannot find name "y".',
      'Error: Encountered 1 error'
    ]);
  });

  it('takes the line after an error from the same stream, not from the interleaved other stream', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append(
      "src/x.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.\n",
      'stderr'
    );
    excerpt.append('[build:lint] still linting file 4\n', 'stdout');
    excerpt.append('  The expected type comes from property "x".\n', 'stderr');
    excerpt.append("src/y.ts(1,1): error TS2304: Cannot find name 'z'.\n", 'stderr');
    excerpt.append('[build:lint] still linting file 5\n', 'stdout');
    excerpt.append('  Did you mean "y"?\n', 'stderr');
    excerpt.append('Encountered 2 errors\n', 'stderr');
    expect(excerpt.getExcerpt(5)).toEqual([
      "src/x.ts(3,7): error TS2322: Type 'string' is not assignable to type 'number'.",
      'The expected type comes from property "x".',
      "src/y.ts(1,1): error TS2304: Cannot find name 'z'.",
      'Did you mean "y"?',
      'Encountered 2 errors'
    ]);
  });

  it('always keeps the last line, which usually is the tool summary', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    for (let i: number = 0; i < 20; i++) {
      excerpt.append(`error ${i}\n`, 'stderr');
    }
    const lines: string[] = excerpt.getExcerpt(8);
    expect(lines).toHaveLength(8);
    expect(lines[0]).toBe('error 0');
    expect(lines[lines.length - 1]).toBe('error 19');
  });

  it('joins lines split across chunks and records an unterminated last line', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append('src/x.ts(1,1): err', 'stdout');
    excerpt.append('or TS1005: expected\nlast line without newline', 'stdout');
    expect(excerpt.getExcerpt(8)).toEqual([
      'src/x.ts(1,1): error TS1005: expected',
      'last line without newline'
    ]);
  });

  it('does not repeat a line that was written to both streams', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    excerpt.append('Error: boom\n', 'stdout');
    excerpt.append('Error: boom\n', 'stderr');
    expect(excerpt.getExcerpt(8)).toEqual(['Error: boom']);
  });

  it('keeps memory use flat for huge output', () => {
    const excerpt: OperationOutputExcerpt = new OperationOutputExcerpt();
    for (let i: number = 0; i < 100000; i++) {
      excerpt.append(`line ${i} ${'x'.repeat(100)}\n`, 'stdout');
    }
    excerpt.append('x'.repeat(200000), 'stdout');
    expect(excerpt.lineCount).toBe(100001);
    const lines: string[] = excerpt.getExcerpt(8);
    expect(lines).toHaveLength(8);
    expect(lines[lines.length - 1]).toMatch(/^x+…x+$/);
  });
});
