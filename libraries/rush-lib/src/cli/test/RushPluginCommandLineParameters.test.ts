// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import './mockRushCommandLineParser.ts';

import path from 'node:path';
import { FileSystem, LockFile } from '@rushstack/node-core-library';
import { RushCommandLineParser } from '../RushCommandLineParser.ts';
import { Autoinstaller } from '../../logic/Autoinstaller.ts';
import { EnvironmentConfiguration } from '../../api/EnvironmentConfiguration.ts';

describe('PluginCommandLineParameters', () => {
  let originCWD: string | undefined;
  let currentCWD: string | undefined;

  let _argv: string[];

  const repoName = 'pluginCommandLineParametersRepo';
  const pluginName = 'rush-command-parameters-plugin';
  const mockRepoPath = path.resolve(__dirname, repoName);
  const autoinstallerRootPath = path.resolve(mockRepoPath, 'common/autoinstallers/plugins');

  const mockProcessArgv = (argv: string[]): void => {
    _argv = process.argv;
    process.argv = [...argv];
  };

  const mockAutoInstallerInstallation = (): void => {
    jest.spyOn(Autoinstaller.prototype, 'prepareAsync').mockImplementation(async function () {});

    const realPluginPath = path.resolve(mockRepoPath, pluginName);
    const autoinstallerPluginPath = path.resolve(autoinstallerRootPath, 'node_modules', pluginName);
    if (!FileSystem.exists(autoinstallerPluginPath)) {
      FileSystem.copyFiles({
        sourcePath: realPluginPath,
        destinationPath: autoinstallerPluginPath
      });
    }
  };

  beforeAll(() => {
    // Ignore issues with parallel Rush processes
    jest.spyOn(LockFile, 'tryAcquire').mockImplementation(() => {
      return {} as LockFile;
    });
  });

  beforeEach(() => {
    // ts-command-line calls process.exit() which interferes with Jest
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      throw new Error(`Test code called process.exit(${code})`);
    });

    originCWD = process.cwd();
    currentCWD = `${__dirname}/pluginCommandLineParametersRepo`;
    process.chdir(currentCWD);
  });

  afterEach(() => {
    if (originCWD) {
      process.chdir(originCWD);
      originCWD = undefined;
      process.argv = _argv;
    }

    EnvironmentConfiguration.reset();
  });

  afterAll(() => {
    FileSystem.deleteFolder(path.resolve(autoinstallerRootPath, 'node_modules'));
    jest.restoreAllMocks();
  });

  it('should parse string parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv(['fake-node', 'fake-rush', 'cmd-parameters-test', '--mystring', '123']);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');

    expect(action?.getStringParameter('--mystring').value).toStrictEqual('123');
  });

  it('should parse integer parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv(['fake-node', 'fake-rush', 'cmd-parameters-test', '--myinteger', '1']);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');

    expect(action?.getIntegerParameter('--myinteger').value).toStrictEqual(1);
  });

  it('should parse flag parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv(['fake-node', 'fake-rush', 'cmd-parameters-test', '--myflag']);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');

    expect(action?.getFlagParameter('--myflag').value).toStrictEqual(true);
  });

  it('should parse choice parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv(['fake-node', 'fake-rush', 'cmd-parameters-test', '--mychoice', 'a']);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');

    expect(action?.getChoiceParameter('--mychoice').value).toStrictEqual('a');
  });

  it('should parse string list parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv([
      'fake-node',
      'fake-rush',
      'cmd-parameters-test',
      '--mystringlist',
      'str1',
      '--mystringlist',
      'str2'
    ]);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');

    expect(action?.getStringListParameter('--mystringlist').values).toStrictEqual(['str1', 'str2']);
  });

  it('should parse integer list parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv([
      'fake-node',
      'fake-rush',
      'cmd-parameters-test',
      '--myintegerlist',
      '1',
      '--myintegerlist',
      '2'
    ]);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');
    expect(action?.getIntegerListParameter('--myintegerlist').values).toStrictEqual([1, 2]);
  });

  it('should parse choice list parameters correctly', async () => {
    mockAutoInstallerInstallation();
    mockProcessArgv([
      'fake-node',
      'fake-rush',
      'cmd-parameters-test',
      '--mychoicelist',
      'a',
      '--mychoicelist',
      'c'
    ]);
    const parser = new RushCommandLineParser({ cwd: currentCWD });

    await expect(parser.executeAsync()).resolves.toEqual(true);

    const action = parser.actions.find((ac) => ac.actionName === 'cmd-parameters-test');
    expect(action?.getChoiceListParameter('--mychoicelist').values).toStrictEqual(['a', 'c']);
  });
});
