// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import type * as TEslint from 'eslint';
import * as ts from 'typescript';

import type { IScopedLogger } from '@rushstack/heft';
import { FileSystem, Path } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { Eslint } from '../Eslint';
import type { IExtendedProgram, IExtendedSourceFile } from '../internalTypings/TypeScriptInternals';

const PROJECT_FOLDER: string = path.resolve(__dirname, '../..');
const FIXTURE_FOLDER: string = `${PROJECT_FOLDER}/temp/test/eslint-lint-cache`;
// ESLint 9 loads its configuration with a dynamic import, which Jest doesn't support without
// --experimental-vm-modules. So these tests load a stand-in for the ESLint package from a path that doesn't exist.
const FAKE_ESLINT_PATH: string = `${FIXTURE_FOLDER}/node_modules/eslint`;

const SOURCE: string = 'let a: any = 1;\nexport const b = a | 2;\n';

const PREFER_CONST_WARNING: TEslint.Linter.LintMessage = {
  ruleId: 'prefer-const',
  severity: 1,
  message: "'a' is never reassigned. Use 'const' instead.",
  line: 1,
  column: 5
};

const NO_BITWISE_ERROR: TEslint.Linter.LintMessage = {
  ruleId: 'no-bitwise',
  severity: 2,
  message: "Unexpected use of '|'.",
  line: 2,
  column: 18
};

// With ESLint 9.37 or newer, @rushstack/eslint-patch adds a bulk suppression to the problem's suppressions, as an
// eslint-disable comment does. So ESLint reports the problem in `suppressedMessages` instead of `messages`.
const BULK_SUPPRESSED_ERROR: TEslint.Linter.SuppressedLintMessage = {
  ruleId: '@typescript-eslint/no-explicit-any',
  severity: 2,
  message: 'Unexpected any. Specify a different type.',
  line: 1,
  column: 8,
  suppressions: [{ kind: 'bulk', justification: '' }]
};

// The messages that the stand-in reports for every file that it lints.
let fakeMessages: TEslint.Linter.LintMessage[] = [];
let fakeSuppressedMessages: TEslint.Linter.SuppressedLintMessage[] = [];

// The method names are ESLint's, so they don't end in "Async".
/* eslint-disable @typescript-eslint/naming-convention */
class FakeESLint {
  public static readonly version: string = '9.37.0';

  public async lintText(text: string, options: { filePath: string }): Promise<TEslint.ESLint.LintResult[]> {
    // Like ESLint, count only the messages that aren't suppressed.
    return [
      {
        filePath: options.filePath,
        messages: fakeMessages,
        suppressedMessages: fakeSuppressedMessages,
        errorCount: fakeMessages.filter((message) => message.severity === 2).length,
        fatalErrorCount: 0,
        warningCount: fakeMessages.filter((message) => message.severity === 1).length,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
        usedDeprecatedRules: []
      }
    ];
  }

  public async calculateConfigForFile(): Promise<object> {
    return {};
  }

  public async isPathIgnored(): Promise<boolean> {
    return false;
  }
}
/* eslint-enable @typescript-eslint/naming-convention */

jest.doMock(FAKE_ESLINT_PATH, () => ({ ESLint: FakeESLint }), { virtual: true });
// Eslint.initializeAsync() replaces the timer in this module before it loads the package.
jest.doMock(`${FAKE_ESLINT_PATH}/lib/linter/timing`, () => ({ enabled: false }), { virtual: true });

interface ILintRun {
  lintedFileCounts: number[];
  reports: string[];
}

function createProgram(): IExtendedProgram {
  const filePath: string = `${FIXTURE_FOLDER}/src/a.ts`;
  FileSystem.writeFile(filePath, SOURCE, { ensureFolderExists: true });
  return ts.createProgram({
    rootNames: [filePath],
    options: {
      configFilePath: `${FIXTURE_FOLDER}/tsconfig.json`,
      noEmit: true,
      types: []
    }
  }) as IExtendedProgram;
}

// Lints the program as one heft run does: a new linter reads the lint cache that the previous run wrote.
async function lintAsync(
  program: IExtendedProgram,
  changedFiles: readonly IExtendedSourceFile[]
): Promise<ILintRun> {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const reports: string[] = [];
  const logger: Partial<IScopedLogger> = {
    terminal: new Terminal(terminalProvider),
    emitError: (error: Error) => reports.push(`error ${error.message}`),
    emitWarning: (warning: Error) => reports.push(`warning ${warning.message}`)
  };

  const linter: Eslint = await Eslint.initializeAsync({
    scopedLogger: logger as IScopedLogger,
    buildFolderPath: FIXTURE_FOLDER,
    buildMetadataFolderPath: `${FIXTURE_FOLDER}/temp/lint`,
    linterToolPath: FAKE_ESLINT_PATH,
    linterConfigFilePath: `${FIXTURE_FOLDER}/eslint.config.js`,
    tsProgram: program
  });
  const typeScriptFilenames: Set<string> = new Set(
    program
      .getRootFileNames()
      .map((fileName: string) => Path.convertToSlashes(path.resolve(FIXTURE_FOLDER, fileName)))
  );
  await linter.performLintingAsync({
    tsProgram: program,
    typeScriptFilenames,
    allProgramFilenames: typeScriptFilenames,
    changedFiles: new Set(changedFiles)
  });

  const lintedFileCounts: number[] = Array.from(
    terminalProvider.getVerboseOutput().matchAll(/Lint: [\d.]+ms \((\d+) files\)/g),
    (match) => Number(match[1])
  );
  return { lintedFileCounts, reports };
}

describe('Eslint lint cache', () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(FIXTURE_FOLDER);
    fakeMessages = [];
    fakeSuppressedMessages = [];
  });

  it.each([
    {
      failure: 'a warning',
      message: PREFER_CONST_WARNING,
      report: "warning (prefer-const) 'a' is never reassigned. Use 'const' instead."
    },
    {
      failure: 'an error',
      message: NO_BITWISE_ERROR,
      report: "error (no-bitwise) Unexpected use of '|'."
    }
  ])(
    'lints a file again, and reports $failure again, when the file also has a suppressed message',
    async ({ message, report }) => {
      fakeMessages = [message];
      fakeSuppressedMessages = [BULK_SUPPRESSED_ERROR];
      const program: IExtendedProgram = createProgram();

      expect(await lintAsync(program, program.getSourceFiles())).toEqual({
        lintedFileCounts: [1],
        reports: [report]
      });

      // Nothing changed, so TypeScript reports no changed files. The file has a lint failure, so it isn't in the
      // lint cache: it's linted again, and the failure is reported again.
      expect(await lintAsync(program, [])).toEqual({
        lintedFileCounts: [1],
        reports: [report]
      });
    }
  );

  it('caches a file whose messages are all suppressed', async () => {
    fakeSuppressedMessages = [BULK_SUPPRESSED_ERROR];
    const program: IExtendedProgram = createProgram();

    expect(await lintAsync(program, program.getSourceFiles())).toEqual({
      lintedFileCounts: [1],
      reports: []
    });

    expect(await lintAsync(program, [])).toEqual({
      lintedFileCounts: [0],
      reports: []
    });
  });
});
