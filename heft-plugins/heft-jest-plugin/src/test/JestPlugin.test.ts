// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import type { Config } from '@jest/types';
import type { IHeftTaskSession, HeftConfiguration, CommandLineParameter } from '@rushstack/heft';
import type { ProjectConfigurationFile } from '@rushstack/heft-config-file';
import { Import, JsonFile, Path } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import {
  JEST_CONFIG_JSDOM_PACKAGE_NAME,
  default as JestPlugin,
  type IHeftJestConfiguration
} from '../JestPlugin';

interface IPartialHeftPluginJson {
  taskPlugins?: {
    parameters?: {
      longName: string;
    }[];
  }[];
}

describe('JestPlugin', () => {
  it('loads and requests all specified plugin parameters', async () => {
    const requestedParameters: Set<string> = new Set();
    function mockGetParameter<T extends CommandLineParameter>(parameterLongName: string): T {
      requestedParameters.add(parameterLongName);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { value: undefined, values: [] } as any as T;
    }
    const mockTaskSession: IHeftTaskSession = {
      hooks: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: { tapPromise: () => {} } as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runIncremental: { tapPromise: () => {} } as any
      },
      parameters: {
        getChoiceParameter: mockGetParameter,
        getChoiceListParameter: mockGetParameter,
        getFlagParameter: mockGetParameter,
        getIntegerParameter: mockGetParameter,
        getIntegerListParameter: mockGetParameter,
        getStringParameter: mockGetParameter,
        getStringListParameter: mockGetParameter
      }
    } as IHeftTaskSession;
    const mockHeftConfiguration: HeftConfiguration = {} as HeftConfiguration;

    const plugin = new JestPlugin();
    plugin.apply(mockTaskSession, mockHeftConfiguration, undefined);

    // Load up all the allowed parameters
    const heftPluginJson: IPartialHeftPluginJson = await JsonFile.loadAsync(
      `${__dirname}/../../heft-plugin.json`
    );

    // Verify that all parameters were requested
    expect(requestedParameters.size).toBe(heftPluginJson.taskPlugins![0].parameters!.length);
    for (const parameter of heftPluginJson.taskPlugins![0].parameters!) {
      expect(requestedParameters.has(parameter.longName)).toBe(true);
    }
  });
});

describe('JestConfigLoader', () => {
  let terminalProvider: StringBufferTerminalProvider;
  let terminal: Terminal;

  beforeEach(() => {
    terminalProvider = new StringBufferTerminalProvider(false);
    terminal = new Terminal(terminalProvider);
  });

  it('resolves extended config modules', async () => {
    // Because we require the built modules, we need to set our rootDir to be in the 'lib-commonjs' folder, since transpilation
    // means that we don't run on the built test assets directly
    const rootDir: string = path.resolve(__dirname, '..', '..', 'lib-commonjs', 'test', 'project1');
    const loader: ProjectConfigurationFile<IHeftJestConfiguration> = JestPlugin._getJestConfigurationLoader(
      rootDir,
      'config/jest.config.json'
    );
    const loadedConfig: IHeftJestConfiguration = await loader.loadConfigurationFileForProjectAsync(
      terminal,
      rootDir
    );

    expect(loadedConfig.preset).toBe(undefined);
    expect(loadedConfig.globalSetup).toBe(path.join(rootDir, 'a', 'b', 'globalSetupFile1.js'));

    // Validate string[]
    expect(loadedConfig.setupFiles?.length).toBe(2);
    expect(loadedConfig.setupFiles![0]).toBe(path.join(rootDir, 'a', 'b', 'setupFile2.js'));
    expect(loadedConfig.setupFiles![1]).toBe(path.join(rootDir, 'a', 'b', 'setupFile1.js'));

    // Validate testEnvironment
    expect(loadedConfig.testEnvironment).toBe(require.resolve('jest-environment-node'));

    // Validate watchPlugins
    expect(loadedConfig.watchPlugins?.length).toBe(2);
    expect(loadedConfig.watchPlugins?.[0]).toBe(require.resolve('jest-watch-select-projects'));
    expect(loadedConfig.watchPlugins?.[1]).toBe(path.join(rootDir, 'a', 'b', 'mockWatchPlugin.js'));

    // Validate reporters
    expect(loadedConfig.reporters?.length).toBe(3);
    expect(loadedConfig.reporters![0]).toBe('default');
    expect(loadedConfig.reporters![1]).toBe(path.join(rootDir, 'a', 'c', 'mockReporter1.js'));
    expect((loadedConfig.reporters![2] as Config.ReporterConfig)[0]).toBe(
      path.join(rootDir, 'a', 'c', 'd', 'mockReporter2.js')
    );

    // Validate transformers
    expect(Object.keys(loadedConfig.transform || {}).length).toBe(2);
    expect(loadedConfig.transform!['\\.(xxx)$']).toBe(
      path.join(rootDir, 'a', 'b', 'mockTransformModule2.js')
    );
    expect((loadedConfig.transform!['\\.(yyy)$'] as Config.TransformerConfig)[0]).toBe(
      path.join(rootDir, 'a', 'c', 'mockTransformModule3.js')
    );

    // Validate moduleNameMapper
    expect(Object.keys(loadedConfig.moduleNameMapper || {}).length).toBe(4);
    expect(loadedConfig.moduleNameMapper!['\\.resx$']).toBe(
      // Test overrides
      path.join(rootDir, 'a', 'some', 'path', 'to', 'overridden', 'module.js')
    );
    expect(loadedConfig.moduleNameMapper!['\\.jpg$']).toBe(
      // Test <configDir>
      path.join(rootDir, 'a', 'c', 'some', 'path', 'to', 'module.js')
    );
    expect(loadedConfig.moduleNameMapper!['^!!file-loader']).toBe(
      // Test <packageDir:...>
      path.join(
        Import.resolvePackage({ packageName: '@rushstack/heft', baseFolderPath: __dirname }),
        'some',
        'path',
        'to',
        'module.js'
      )
    );
    expect(loadedConfig.moduleNameMapper!['^@1js/search-dispatcher/lib/(.+)']).toBe(
      // Test unmodified
      '@1js/search-dispatcher/lib-commonjs/$1'
    );

    // Validate globals
    expect(Object.keys(loadedConfig.globals || {}).length).toBe(4);
    expect(loadedConfig.globals!.key1).toBe('value5');
    expect((loadedConfig.globals!.key2 as string[]).length).toBe(4);
    expect((loadedConfig.globals!.key2 as string[])[0]).toBe('value2');
    expect((loadedConfig.globals!.key2 as string[])[1]).toContain('value3');
    expect((loadedConfig.globals!.key2 as string[])[2]).toContain('value2');
    expect((loadedConfig.globals!.key2 as string[])[3]).toContain('value6');
    const key3Obj: any = (loadedConfig.globals as any).key3; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(Object.keys(key3Obj).length).toBe(3);
    expect(key3Obj.key4).toBe('value7');
    expect(key3Obj.key5).toBe('value5');
    expect(key3Obj.key6).toBe('value8');
    expect(loadedConfig.globals!.key7).toBe('value9');
  });

  it('resolves extended package modules', async () => {
    // Because we require the built modules, we need to set our rootDir to be in the 'lib-commonjs' folder, since transpilation
    // means that we don't run on the built test assets directly
    const rootDir: string = path.resolve(__dirname, '..', '..', 'lib-commonjs', 'test', 'project2');
    const loader: ProjectConfigurationFile<IHeftJestConfiguration> = JestPlugin._getJestConfigurationLoader(
      rootDir,
      'config/jest.config.json'
    );
    const loadedConfig: IHeftJestConfiguration = await loader.loadConfigurationFileForProjectAsync(
      terminal,
      rootDir
    );

    expect(loadedConfig.setupFiles?.length).toBe(1);
    expect(loadedConfig.setupFiles![0]).toBe(require.resolve('@jest/core'));

    // Also validate that a test environment that we specified as 'jsdom' (but have not added as a dependency)
    // is resolved, implying it came from Jest directly
    expect(loadedConfig.testEnvironment).toContain('jest-environment-jsdom');
    expect(loadedConfig.testEnvironment).toMatch(/index.js$/);
  });

  it('the default web config const matches the name in the config JSON file', async () => {
    const { testEnvironment } = await JsonFile.loadAsync(`${__dirname}/../../includes/jest-web.config.json`);
    expect(testEnvironment).toEqual(JEST_CONFIG_JSDOM_PACKAGE_NAME);
  });

  it('replaces jest-environment-jsdom with the patched version', async () => {
    // Because we require the built modules, we need to set our rootDir to be in the 'lib-commonjs' folder, since transpilation
    // means that we don't run on the built test assets directly
    const rootDir: string = path.resolve(__dirname, '..', '..', 'lib-commonjs', 'test', 'project3');
    const loader: ProjectConfigurationFile<IHeftJestConfiguration> = JestPlugin._getJestConfigurationLoader(
      rootDir,
      'config/jest.config.json'
    );
    const loadedConfig: IHeftJestConfiguration = await loader.loadConfigurationFileForProjectAsync(
      terminal,
      rootDir
    );
    const testEnvironment: string = Path.convertToPlatformDefault(loadedConfig.testEnvironment!);
    expect(testEnvironment).toEqual(require.resolve('../exports/patched-jest-environment-jsdom'));
  });
});
