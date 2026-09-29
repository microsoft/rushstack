// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

// ESLint 9 loads its configuration with a dynamic import, which Jest doesn't support without
// --experimental-vm-modules. This linter reports every file that contains "debugger" instead, and it keeps the
// real LinterBase, which decides which files to lint.
jest.mock('../Eslint', () => {
  const { LinterBase } = jest.requireActual<{ LinterBase: typeof LinterBaseType }>('../LinterBase');

  class MockEslint extends LinterBase<string> {
    public constructor(options: ILinterBaseOptions) {
      super('eslint', options);
    }

    public static async resolveEslintConfigFilePathAsync(
      heftConfiguration: HeftConfiguration
    ): Promise<string> {
      return `${heftConfiguration.buildFolderPath}/eslint.config.js`;
    }

    public static async initializeAsync(options: ILinterBaseOptions): Promise<MockEslint> {
      return new MockEslint(options);
    }

    public printVersionHeader(): void {
      // Nothing to print
    }

    protected async getCacheVersionAsync(): Promise<string> {
      return 'mock';
    }

    protected async lintFileAsync(sourceFile: IExtendedSourceFile | ISourceFileToLint): Promise<string[]> {
      return sourceFile.text.includes('debugger') ? [sourceFile.fileName] : [];
    }

    protected async lintingFinishedAsync(lintResults: string[]): Promise<void> {
      for (const fileName of lintResults) {
        this._scopedLogger.emitError(new Error(`(no-debugger) ${fileName}`));
      }
    }

    protected hasLintFailures(lintResults: string[]): boolean {
      return lintResults.length > 0;
    }

    protected async isFileExcludedAsync(): Promise<boolean> {
      return false;
    }
  }

  return { Eslint: MockEslint };
});

import path from 'node:path';

import * as ts from 'typescript';

import type {
  HeftConfiguration,
  IHeftTaskRunHookOptions,
  IHeftTaskSession,
  IScopedLogger
} from '@rushstack/heft';
import type { IChangedFilesHookOptions, ITypeScriptPluginAccessor } from '@rushstack/heft-typescript-plugin';
import { AlreadyReportedError, FileSystem } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import LintPlugin from '../LintPlugin';
import type { ILinterBaseOptions, ISourceFileToLint, LinterBase as LinterBaseType } from '../LinterBase';
import type { IExtendedProgram, IExtendedSourceFile } from '../internalTypings/TypeScriptInternals';

const PROJECT_FOLDER: string = path.resolve(__dirname, '../..');
const FIXTURE_FOLDER: string = `${PROJECT_FOLDER}/temp/test/lint-plugin-watch`;
const FAILING_SOURCE: string = 'export function a() {\n  debugger;\n}\n';
const PASSING_SOURCE: string = 'export function a() {\n  return;\n}\n';

interface IWatchSession {
  readonly taskSession: IHeftTaskSession;
  readonly heftConfiguration: HeftConfiguration;
  readonly terminalProvider: StringBufferTerminalProvider;
  readonly errors: Error[];
  readonly requestedPluginNames: string[];
  reportProgram(program: IExtendedProgram, changedFileNames: string[]): void;
  runAsync(): Promise<void>;
}

function createWatchSession(): IWatchSession {
  const terminalProvider: StringBufferTerminalProvider = new StringBufferTerminalProvider();
  const terminal: Terminal = new Terminal(terminalProvider);
  const errors: Error[] = [];
  const logger: Partial<IScopedLogger> = {
    terminal,
    get hasErrors(): boolean {
      return errors.length > 0;
    },
    emitError: (error: Error) => errors.push(error),
    emitWarning: () => undefined,
    resetErrorsAndWarnings: () => {
      errors.length = 0;
    }
  };

  const runHooks: ((options: IHeftTaskRunHookOptions) => Promise<void>)[] = [];
  const changedFilesListeners: ((options: IChangedFilesHookOptions) => void)[] = [];
  const requestedPluginNames: string[] = [];
  const taskSession: Partial<IHeftTaskSession> = {
    logger: logger as IScopedLogger,
    tempFolderPath: `${FIXTURE_FOLDER}/temp/lint`,
    parameters: {
      watch: true,
      production: false,
      getFlagParameter: () => ({ value: false })
    } as unknown as IHeftTaskSession['parameters'],
    hooks: {
      run: {
        tapPromise: (name: string, fn: (options: IHeftTaskRunHookOptions) => Promise<void>) => {
          runHooks.push(fn);
        }
      }
    } as unknown as IHeftTaskSession['hooks'],
    requestAccessToPluginByName: ((
      pluginPackageName: string,
      pluginName: string,
      callback: (accessor: ITypeScriptPluginAccessor) => void
    ) => {
      requestedPluginNames.push(pluginName);
      callback({
        onChangedFilesHook: {
          tap: (name: string, fn: (options: IChangedFilesHookOptions) => void) => {
            changedFilesListeners.push(fn);
          }
        }
      } as unknown as ITypeScriptPluginAccessor);
    }) as IHeftTaskSession['requestAccessToPluginByName']
  };

  const heftConfiguration: Partial<HeftConfiguration> = {
    buildFolderPath: FIXTURE_FOLDER,
    rigPackageResolver: {
      resolvePackageAsync: async (packageName: string) => `${FIXTURE_FOLDER}/node_modules/${packageName}`
    } as unknown as HeftConfiguration['rigPackageResolver']
  };

  return {
    taskSession: taskSession as IHeftTaskSession,
    heftConfiguration: heftConfiguration as HeftConfiguration,
    terminalProvider,
    errors,
    requestedPluginNames,
    reportProgram: (program: IExtendedProgram, changedFileNames: string[]) => {
      const changedFiles: Set<ts.SourceFile> = new Set(
        changedFileNames.map((fileName: string) => program.getSourceFile(fileName)!)
      );
      for (const listener of changedFilesListeners) {
        listener({ program, changedFiles } as IChangedFilesHookOptions);
      }
    },
    // Like Heft's task runner: reset the logger, then run the task's run hooks.
    runAsync: async () => {
      logger.resetErrorsAndWarnings!();
      const options: IHeftTaskRunHookOptions = {
        abortSignal: new AbortController().signal
      } as IHeftTaskRunHookOptions;
      await Promise.all(runHooks.map((runHook) => runHook(options)));
    }
  };
}

function writeSourceFile(name: string, text: string): string {
  const filePath: string = `${FIXTURE_FOLDER}/src/${name}`;
  FileSystem.writeFile(filePath, text, { ensureFolderExists: true });
  return filePath;
}

function createProgram(rootNames: string[]): IExtendedProgram {
  return ts.createProgram({
    rootNames,
    options: {
      configFilePath: `${FIXTURE_FOLDER}/tsconfig.json`,
      noEmit: true,
      types: []
    }
  }) as IExtendedProgram;
}

function getLintedFileCounts(verboseOutput: string): number[] {
  return Array.from(verboseOutput.matchAll(/Lint: [\d.]+ms \((\d+) files\)/g), (match) => Number(match[1]));
}

describe('LintPlugin in watch mode', () => {
  beforeEach(() => {
    FileSystem.ensureEmptyFolder(FIXTURE_FOLDER);
  });

  it('does not lint unless the lintInWatchMode option is set', async () => {
    const session: IWatchSession = createWatchSession();
    new LintPlugin().apply(session.taskSession, session.heftConfiguration, {});

    await session.runAsync();
    await session.runAsync();

    expect(session.requestedPluginNames).toEqual([]);
    expect(session.terminalProvider.getWarningOutput({ normalizeSpecialCharacters: false })).toBe(
      "Linting isn't currently supported in watch mode\n"
    );
  });

  it('with the lintInWatchMode option, reports lint failures in every run until they are fixed', async () => {
    const session: IWatchSession = createWatchSession();
    new LintPlugin().apply(session.taskSession, session.heftConfiguration, { lintInWatchMode: true });
    expect(session.requestedPluginNames).toEqual(['typescript-plugin']);

    const aPath: string = writeSourceFile('a.ts', FAILING_SOURCE);
    const bPath: string = writeSourceFile('b.ts', 'export const b = 1;\n');

    // The first run lints the files that TypeScript emitted.
    session.reportProgram(createProgram([aPath, bPath]), [aPath, bPath]);
    await expect(session.runAsync()).rejects.toBeInstanceOf(AlreadyReportedError);
    expect(session.errors.map(String)).toEqual([expect.stringContaining('(no-debugger)')]);

    // TypeScript emits nothing, e.g. because only a file that it doesn't compile changed. The file with the
    // lint failure is linted again, and the failure is reported again.
    let verboseOutputLength: number = session.terminalProvider.getVerboseOutput().length;
    await expect(session.runAsync()).rejects.toBeInstanceOf(AlreadyReportedError);
    expect(session.errors.map(String)).toEqual([expect.stringContaining('(no-debugger)')]);
    expect(
      getLintedFileCounts(session.terminalProvider.getVerboseOutput().slice(verboseOutputLength))
    ).toEqual([1]);

    // Fixing the failure makes the next run pass.
    writeSourceFile('a.ts', PASSING_SOURCE);
    session.reportProgram(createProgram([aPath, bPath]), [aPath]);
    await session.runAsync();
    expect(session.errors).toEqual([]);

    // Now every file is in the linter's cache, so a run in which TypeScript emits nothing lints no files.
    verboseOutputLength = session.terminalProvider.getVerboseOutput().length;
    await session.runAsync();
    expect(session.errors).toEqual([]);
    expect(
      getLintedFileCounts(session.terminalProvider.getVerboseOutput().slice(verboseOutputLength))
    ).toEqual([0]);
  }, 60_000);
});
