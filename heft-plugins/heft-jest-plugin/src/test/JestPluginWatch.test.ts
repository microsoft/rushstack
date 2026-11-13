// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock('@jest/core', () => ({
  getVersion: () => '30.0.0',
  runCLI: jest.fn()
}));
jest.mock('jest-config', () => ({
  readConfigs: jest.fn()
}));

import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  CommandLineParameter,
  HeftConfiguration,
  IHeftTaskRunIncrementalHookOptions,
  IHeftTaskSession,
  IScopedLogger
} from '@rushstack/heft';
import { FileSystem } from '@rushstack/node-core-library';

import JestPlugin from '../JestPlugin';

const TEST_FOLDER_PATH: string = path.resolve(__dirname, '../../temp/jest-plugin-watch-test');
const TEST_FILE_PATH: string = path.join(TEST_FOLDER_PATH, 'lib', 'a.test.js');

const { runCLI: mockRunCLI } = jest.requireMock('@jest/core') as { runCLI: jest.Mock };
const { readConfigs: mockReadConfigs } = jest.requireMock('jest-config') as { readConfigs: jest.Mock };

interface IWatchTestContext {
  runIncrementalAsync: () => Promise<void>;
  logger: { terminal: { writeLine: jest.Mock }; emitError: jest.Mock; emitWarning: jest.Mock };
}

function createWatchTestContext(): IWatchTestContext {
  let runIncrementalHook: ((options: IHeftTaskRunIncrementalHookOptions) => Promise<void>) | undefined;
  const logger: IWatchTestContext['logger'] = {
    terminal: { writeLine: jest.fn() },
    emitError: jest.fn(),
    emitWarning: jest.fn()
  };

  function getParameter<T extends CommandLineParameter>(): T {
    return { value: undefined, values: [] } as unknown as T;
  }
  const taskSession: IHeftTaskSession = {
    logger: logger as unknown as IScopedLogger,
    tempFolderPath: path.join(TEST_FOLDER_PATH, 'temp', 'test'),
    parameters: {
      verbose: false,
      debug: false,
      getChoiceParameter: getParameter,
      getChoiceListParameter: getParameter,
      getFlagParameter: getParameter,
      getIntegerParameter: getParameter,
      getIntegerListParameter: getParameter,
      getStringParameter: getParameter,
      getStringListParameter: getParameter
    },
    hooks: {
      run: { tapPromise: () => {} },
      runIncremental: {
        tapPromise: (name: string, hook: (options: IHeftTaskRunIncrementalHookOptions) => Promise<void>) => {
          runIncrementalHook = hook;
        }
      }
    }
  } as unknown as IHeftTaskSession;
  const heftConfiguration: HeftConfiguration = {
    buildFolderPath: TEST_FOLDER_PATH,
    tempFolderPath: path.join(TEST_FOLDER_PATH, 'temp'),
    projectPackageJson: { name: 'test-project' }
  } as unknown as HeftConfiguration;

  new JestPlugin().apply(taskSession, heftConfiguration, {
    disableConfigurationModuleResolution: true,
    debugHeftReporter: true
  });

  const runIncrementalOptions: IHeftTaskRunIncrementalHookOptions = {
    watchFs: {
      readdirSync: (folderPath: string) => fs.readdirSync(folderPath),
      statSync: (filePath: string) => fs.statSync(filePath)
    },
    requestRun: () => {}
  } as unknown as IHeftTaskRunIncrementalHookOptions;

  return {
    runIncrementalAsync: () => runIncrementalHook!(runIncrementalOptions),
    logger
  };
}

function mockJestResults(numFailedTests: number): void {
  mockRunCLI.mockImplementation(async () => ({
    globalConfig: {},
    results: { numFailedTests, numFailedTestSuites: 0 }
  }));
}

function getErrorMessages(context: IWatchTestContext): string[] {
  return context.logger.emitError.mock.calls.map(([error]: [Error]) => error.message);
}

describe('JestPlugin watch mode', () => {
  const originalNodeEnv: string | undefined = process.env.NODE_ENV;

  beforeEach(() => {
    FileSystem.ensureEmptyFolder(TEST_FOLDER_PATH);
    FileSystem.writeFile(path.join(TEST_FOLDER_PATH, 'config', 'jest.config.json'), '{}', {
      ensureFolderExists: true
    });
    FileSystem.writeFile(TEST_FILE_PATH, '', { ensureFolderExists: true });

    mockRunCLI.mockReset();
    mockReadConfigs.mockReset();
    mockReadConfigs.mockImplementation(async () => ({
      globalConfig: { coverageDirectory: path.join(TEST_FOLDER_PATH, 'coverage') },
      configs: [
        {
          roots: [path.join(TEST_FOLDER_PATH, 'lib')],
          cacheDirectory: path.join(TEST_FOLDER_PATH, 'temp', 'test'),
          modulePathIgnorePatterns: [],
          watchPathIgnorePatterns: []
        }
      ]
    }));
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  afterAll(() => {
    FileSystem.deleteFolder(TEST_FOLDER_PATH);
  });

  it('runs the tests only when a test input changed', async () => {
    mockJestResults(0);
    const context: IWatchTestContext = createWatchTestContext();

    await context.runIncrementalAsync();
    expect(mockRunCLI).toHaveBeenCalledTimes(1);

    await context.runIncrementalAsync();
    expect(mockRunCLI).toHaveBeenCalledTimes(1);
    expect(context.logger.terminal.writeLine).toHaveBeenCalledWith('No pending test runs.');

    const futureTime: Date = new Date(Date.now() + 60000);
    fs.utimesSync(TEST_FILE_PATH, futureTime, futureTime);
    await context.runIncrementalAsync();
    expect(mockRunCLI).toHaveBeenCalledTimes(2);
    expect(getErrorMessages(context)).toEqual([]);
  });

  it('reports the failure of the previous run again when no test inputs changed', async () => {
    mockJestResults(1);
    const context: IWatchTestContext = createWatchTestContext();

    await context.runIncrementalAsync();
    await context.runIncrementalAsync();

    expect(mockRunCLI).toHaveBeenCalledTimes(1);
    expect(getErrorMessages(context)).toEqual([
      '1 Jest test failed',
      '1 Jest test failed in the previous run, and no test inputs have changed since'
    ]);
  });

  it('sets NODE_ENV while reading the configuration, and restores it and reruns after Jest throws', async () => {
    delete process.env.NODE_ENV;
    const nodeEnvValues: (string | undefined)[] = [];
    const readConfigsImplementation: (...args: unknown[]) => unknown =
      mockReadConfigs.getMockImplementation()!;
    mockReadConfigs.mockImplementation(async (...args: unknown[]) => {
      nodeEnvValues.push(process.env.NODE_ENV);
      return readConfigsImplementation(...args);
    });
    mockRunCLI.mockRejectedValueOnce(new Error('Jest failed to start'));
    const context: IWatchTestContext = createWatchTestContext();

    await expect(context.runIncrementalAsync()).rejects.toThrow('Jest failed to start');
    expect(process.env.NODE_ENV).toBeUndefined();

    mockJestResults(0);
    await context.runIncrementalAsync();

    expect(mockRunCLI).toHaveBeenCalledTimes(2);
    expect(nodeEnvValues).toEqual(['test', 'test']);
    expect(process.env.NODE_ENV).toBeUndefined();
  });
});
