// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import {
  buildCommonArgs,
  buildFixArgs,
  resolveLintPaths,
  filterChangedFilePaths,
  formatDiagnosticMessage,
  createFileErrorForDiagnostic,
  extractDiagnosticsFromSarif,
  batchLintPaths,
  mergeSarifLogs,
  type IOxlintPluginOptions,
  type IOxlintDiagnostic,
  type IOxlintSarifLog
} from '../OxlintHelpers';

describe('buildCommonArgs', () => {
  it('returns no arguments when options are undefined', () => {
    expect(buildCommonArgs(undefined)).toEqual([]);
  });

  it('returns no arguments when options are empty', () => {
    expect(buildCommonArgs({})).toEqual([]);
  });

  it('maps config and tsconfig paths', () => {
    const options: IOxlintPluginOptions = {
      configFilePath: '.oxlintrc.json',
      tsConfigFilePath: 'tsconfig.json'
    };
    expect(buildCommonArgs(options)).toEqual(['--config', '.oxlintrc.json', '--tsconfig', 'tsconfig.json']);
  });

  it('maps allow, warn, and deny lists in order', () => {
    const options: IOxlintPluginOptions = {
      allow: ['no-debugger'],
      warn: ['no-console', 'correctness'],
      deny: ['no-unused-vars']
    };
    expect(buildCommonArgs(options)).toEqual([
      '--allow',
      'no-debugger',
      '--warn',
      'no-console',
      '--warn',
      'correctness',
      '--deny',
      'no-unused-vars'
    ]);
  });

  it('maps boolean flags only when truthy', () => {
    const options: IOxlintPluginOptions = {
      disableTypeScriptPlugin: true,
      importPlugin: true,
      reactPlugin: false,
      quiet: true
    };
    expect(buildCommonArgs(options)).toEqual(['--disable-typescript-plugin', '--import-plugin', '--quiet']);
  });

  it('maps numeric and severity options', () => {
    const options: IOxlintPluginOptions = {
      maxWarnings: 5,
      threads: 1,
      reportUnusedDisableDirectivesSeverity: 'error'
    };
    expect(buildCommonArgs(options)).toEqual([
      '--max-warnings',
      '5',
      '--threads',
      '1',
      '--report-unused-disable-directives-severity',
      'error'
    ]);
  });

  it('emits --max-warnings 0 when maxWarnings is 0', () => {
    expect(buildCommonArgs({ maxWarnings: 0 })).toEqual(['--max-warnings', '0']);
  });

  it('maps ignore options', () => {
    const options: IOxlintPluginOptions = {
      ignorePath: '.eslintignore',
      ignorePattern: ['**/dist/**', '**/temp/**'],
      noIgnore: true
    };
    expect(buildCommonArgs(options)).toEqual([
      '--no-ignore',
      '--ignore-path',
      '.eslintignore',
      '--ignore-pattern',
      '**/dist/**',
      '--ignore-pattern',
      '**/temp/**'
    ]);
  });
});

describe('buildFixArgs', () => {
  it('returns no arguments when fix is disabled', () => {
    expect(buildFixArgs(false, { fixSuggestions: true, fixDangerously: true })).toEqual([]);
  });

  it('returns --fix when fix is enabled with no extra options', () => {
    expect(buildFixArgs(true, undefined)).toEqual(['--fix']);
  });

  it('appends suggestion and dangerous flags when enabled', () => {
    expect(buildFixArgs(true, { fixSuggestions: true, fixDangerously: true })).toEqual([
      '--fix',
      '--fix-suggestions',
      '--fix-dangerously'
    ]);
  });
});

describe('resolveLintPaths', () => {
  it('defaults to ["src"] when no paths are provided', () => {
    expect(resolveLintPaths(undefined)).toEqual(['src']);
    expect(resolveLintPaths({})).toEqual(['src']);
    expect(resolveLintPaths({ paths: [] })).toEqual(['src']);
  });

  it('uses custom paths when provided', () => {
    expect(resolveLintPaths({ paths: ['lib', 'scripts'] })).toEqual(['lib', 'scripts']);
  });
});

describe('filterChangedFilePaths', () => {
  const buildFolderPath: string = path.resolve('/repo/project');

  it('returns an empty array when nothing is provided', () => {
    expect(filterChangedFilePaths([], buildFolderPath)).toEqual([]);
  });

  it('keeps lintable files inside the build folder as sorted relative paths', () => {
    const changed: string[] = [
      path.resolve(buildFolderPath, 'src/b.ts'),
      path.resolve(buildFolderPath, 'src/a.tsx'),
      path.resolve(buildFolderPath, 'src/nested/c.js')
    ];
    expect(filterChangedFilePaths(changed, buildFolderPath)).toEqual([
      path.join('src', 'a.tsx'),
      path.join('src', 'b.ts'),
      path.join('src', 'nested', 'c.js')
    ]);
  });

  it('excludes files outside the build folder', () => {
    const changed: string[] = [
      path.resolve('/repo/other/src/a.ts'),
      path.resolve(buildFolderPath, '../sibling/b.ts')
    ];
    expect(filterChangedFilePaths(changed, buildFolderPath)).toEqual([]);
  });

  it('excludes node_modules, declaration files, and non-lintable extensions', () => {
    const changed: string[] = [
      path.resolve(buildFolderPath, 'node_modules/pkg/index.ts'),
      path.resolve(buildFolderPath, 'src/types.d.ts'),
      path.resolve(buildFolderPath, 'src/styles.css'),
      path.resolve(buildFolderPath, 'src/data.json'),
      path.resolve(buildFolderPath, 'src/keep.ts')
    ];
    expect(filterChangedFilePaths(changed, buildFolderPath)).toEqual([path.join('src', 'keep.ts')]);
  });

  it('de-duplicates repeated paths', () => {
    const changed: string[] = [
      path.resolve(buildFolderPath, 'src/a.ts'),
      path.resolve(buildFolderPath, 'src/a.ts')
    ];
    expect(filterChangedFilePaths(changed, buildFolderPath)).toEqual([path.join('src', 'a.ts')]);
  });
});

describe('formatDiagnosticMessage', () => {
  it('prefixes the rule code when present', () => {
    const diagnostic: IOxlintDiagnostic = {
      message: "'x' is never used",
      code: 'eslint(no-unused-vars)',
      severity: 'error',
      filename: 'src/file.ts'
    };
    expect(formatDiagnosticMessage(diagnostic)).toBe("(eslint(no-unused-vars)) 'x' is never used");
  });

  it('returns the message unchanged when no code is present', () => {
    const diagnostic: IOxlintDiagnostic = {
      message: 'something went wrong',
      severity: 'warning',
      filename: 'src/file.ts'
    };
    expect(formatDiagnosticMessage(diagnostic)).toBe('something went wrong');
  });
});

describe('createFileErrorForDiagnostic', () => {
  const buildFolderPath: string = path.resolve('/repo/project');

  it('resolves the absolute path and uses line/column from the first label span', () => {
    const diagnostic: IOxlintDiagnostic = {
      message: "'x' is never used",
      code: 'eslint(no-unused-vars)',
      severity: 'error',
      filename: 'src/file.ts',
      labels: [
        {
          span: { offset: 10, length: 1, line: 3, column: 7 }
        }
      ]
    };
    const fileError: ReturnType<typeof createFileErrorForDiagnostic> = createFileErrorForDiagnostic(
      diagnostic,
      buildFolderPath
    );
    expect(fileError.absolutePath).toBe(path.resolve(buildFolderPath, 'src/file.ts'));
    expect(fileError.line).toBe(3);
    expect(fileError.column).toBe(7);
    expect(fileError.message).toBe("(eslint(no-unused-vars)) 'x' is never used");
  });

  it('omits line/column when no labels are present', () => {
    const diagnostic: IOxlintDiagnostic = {
      message: 'broken',
      severity: 'warning',
      filename: 'src/other.ts'
    };
    const fileError: ReturnType<typeof createFileErrorForDiagnostic> = createFileErrorForDiagnostic(
      diagnostic,
      buildFolderPath
    );
    expect(fileError.absolutePath).toBe(path.resolve(buildFolderPath, 'src/other.ts'));
    expect(fileError.line).toBeUndefined();
    expect(fileError.column).toBeUndefined();
  });
});

describe('extractDiagnosticsFromSarif', () => {
  it('returns an empty array for an empty log', () => {
    expect(extractDiagnosticsFromSarif({})).toEqual([]);
    expect(extractDiagnosticsFromSarif({ runs: [] })).toEqual([]);
    expect(extractDiagnosticsFromSarif({ runs: [{ results: [] }] })).toEqual([]);
  });

  it('maps SARIF levels to diagnostic severities and reads location data', () => {
    const sarifLog: IOxlintSarifLog = {
      runs: [
        {
          results: [
            {
              level: 'error',
              ruleId: 'no-unused-vars',
              message: { text: "'x' is never used" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: 'src/a.ts' },
                    region: { startLine: 3, startColumn: 7 }
                  }
                }
              ]
            },
            {
              level: 'warning',
              message: { text: 'be careful' },
              locations: [{ physicalLocation: { artifactLocation: { uri: 'src/b.ts' } } }]
            },
            {
              level: 'note',
              message: { text: 'just advice' }
            }
          ]
        }
      ]
    };

    const diagnostics: IOxlintDiagnostic[] = extractDiagnosticsFromSarif(sarifLog);
    expect(diagnostics).toHaveLength(3);

    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      code: 'no-unused-vars',
      message: "'x' is never used",
      filename: 'src/a.ts'
    });
    expect(diagnostics[0].labels?.[0]?.span).toMatchObject({ line: 3, column: 7 });

    expect(diagnostics[1]).toMatchObject({
      severity: 'warning',
      message: 'be careful',
      filename: 'src/b.ts'
    });
    expect(diagnostics[2]).toMatchObject({ severity: 'advice', message: 'just advice', filename: '' });
  });
});

describe('batchLintPaths', () => {
  it('returns a single batch when everything fits', () => {
    const paths: string[] = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    expect(batchLintPaths(['node', 'oxlint', '--format=json'], paths)).toEqual([paths]);
  });

  it('always returns at least one batch, even with no paths', () => {
    expect(batchLintPaths(['node', 'oxlint'], [])).toEqual([[]]);
  });

  it('splits paths into multiple batches when the command line would be too long', () => {
    const paths: string[] = ['aaaa', 'bbbb', 'cccc', 'dddd'];
    // prefix "node oxlint" contributes 5 + 7 = 12; each 4-char path contributes 5.
    // With a limit of 22, prefix(12) + one path(5) = 17 fits, two paths = 22 fits, three = 27 does not.
    const batches: string[][] = batchLintPaths(['node', 'oxlint'], paths, 22);
    expect(batches).toEqual([
      ['aaaa', 'bbbb'],
      ['cccc', 'dddd']
    ]);
  });

  it('places an oversized single path in its own batch rather than dropping it', () => {
    const longPath: string = 'x'.repeat(100);
    const batches: string[][] = batchLintPaths(['node'], ['a', longPath, 'b'], 20);
    expect(batches).toEqual([['a'], [longPath], ['b']]);
  });

  it('preserves every path across the produced batches', () => {
    const paths: string[] = [];
    for (let index: number = 0; index < 50; ++index) {
      paths.push(`src/file-${index}.ts`);
    }
    const batches: string[][] = batchLintPaths(['node', 'oxlint', '--format=sarif'], paths, 80);
    expect(batches.flat()).toEqual(paths);
    expect(batches.length).toBeGreaterThan(1);
  });
});

describe('mergeSarifLogs', () => {
  it('returns the original text unchanged for a single log', () => {
    const raw: string = '{"runs":[{"results":[]}]}';
    expect(mergeSarifLogs([raw])).toBe(raw);
  });

  it('concatenates the runs from multiple logs', () => {
    const first: string = JSON.stringify({ $schema: 'sarif', version: '2.1.0', runs: [{ results: [1] }] });
    const second: string = JSON.stringify({ version: '2.1.0', runs: [{ results: [2] }] });
    const merged: IOxlintSarifLog & { $schema?: string } = JSON.parse(mergeSarifLogs([first, second]));
    expect(merged.$schema).toBe('sarif');
    expect(merged.runs).toHaveLength(2);
    expect(merged.runs?.[0]?.results).toEqual([1]);
    expect(merged.runs?.[1]?.results).toEqual([2]);
  });
});
