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
  type IOxlintPluginOptions,
  type IOxlintDiagnostic
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
