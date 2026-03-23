// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

jest.mock(`@rushstack/package-deps-hash`, () => {
  return {
    getRepoRoot(dir: string): string {
      return dir;
    },
    getDetailedRepoStateAsync(): IDetailedRepoState {
      return {
        hasSubmodules: false,
        hasUncommittedChanges: false,
        files: new Map([['common/config/rush/npm-shrinkwrap.json', 'hash']]),
        symlinks: new Map()
      };
    },
    getRepoChangesAsync(): ReadonlyMap<string, string> {
      return new Map();
    },
    getGitHashForFiles(filePaths: Iterable<string>): ReadonlyMap<string, string> {
      return new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath]));
    },
    hashFilesAsync(rootDirectory: string, filePaths: Iterable<string>): Promise<ReadonlyMap<string, string>> {
      return Promise.resolve(new Map(Array.from(filePaths, (filePath: string) => [filePath, filePath])));
    }
  };
});

import './mockRushCommandLineParser';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import type { IDetailedRepoState } from '@rushstack/package-deps-hash';
import { Autoinstaller } from '../../logic/Autoinstaller';
import type { IRushPluginManifestJson } from '../../pluginFramework/PluginLoader/PluginLoaderBase';
import { BaseInstallAction } from '../actions/BaseInstallAction';
import {
  getCommandLineParserInstanceAsync,
  isolateEnvironmentConfigurationForTests,
  type IEnvironmentConfigIsolation
} from './TestUtils';

interface IPluginTestPaths {
  autoinstallerStorePath: string;
  sourceCommandLineJsonPath: string;
  sourceManifestPath: string;
  destinationCommandLineJsonPath: string;
  destinationManifestPath: string;
}

function convertToCrLf(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function mockAutoinstallerPrepareAsync(): jest.SpyInstance<Promise<void>, []> {
  return jest.spyOn(Autoinstaller.prototype, 'prepareAsync').mockResolvedValue(undefined);
}

function seedPluginFilesWithCrLf(repoPath: string, packageName: string): IPluginTestPaths {
  const autoinstallerPath: string = `${repoPath}/common/autoinstallers/plugins`;
  const autoinstallerStorePath: string = `${autoinstallerPath}/rush-plugins`;
  const installedPluginPath: string = `${autoinstallerPath}/node_modules/${packageName}`;
  const sourcePluginPath: string = `${repoPath}/${packageName}`;
  const sourceManifestPath: string = `${installedPluginPath}/rush-plugin-manifest.json`;
  const sourceCommandLineJsonPath: string = `${installedPluginPath}/command-line.json`;
  const destinationManifestPath: string = `${autoinstallerStorePath}/${packageName}/rush-plugin-manifest.json`;
  const destinationCommandLineJsonPath: string = `${autoinstallerStorePath}/${packageName}/${packageName}/command-line.json`;

  FileSystem.copyFiles({
    sourcePath: sourcePluginPath,
    destinationPath: installedPluginPath
  });

  const manifestJson: IRushPluginManifestJson = JsonFile.load(
    `${sourcePluginPath}/rush-plugin-manifest.json`
  );
  manifestJson.plugins[0].commandLineJsonFilePath = 'command-line.json';
  FileSystem.writeFile(sourceManifestPath, convertToCrLf(`${JSON.stringify(manifestJson, undefined, 2)}\n`), {
    ensureFolderExists: true
  });

  const commandLineJsonFixturePath: string = destinationCommandLineJsonPath;
  const commandLineJsonContent: string = FileSystem.readFile(commandLineJsonFixturePath);
  FileSystem.writeFile(sourceCommandLineJsonPath, convertToCrLf(commandLineJsonContent), {
    ensureFolderExists: true
  });

  return {
    autoinstallerStorePath,
    sourceCommandLineJsonPath,
    sourceManifestPath,
    destinationCommandLineJsonPath,
    destinationManifestPath
  };
}

function expectFileToUseLfLineEndings(filePath: string): void {
  const content: string = FileSystem.readFile(filePath);
  expect(content).toContain('\n');
  expect(content).not.toContain('\r\n');
}

describe('RushPluginAutoinstallerUpdate', () => {
  let _envIsolation: IEnvironmentConfigIsolation;

  beforeEach(() => {
    _envIsolation = isolateEnvironmentConfigurationForTests();
  });

  afterEach(() => {
    _envIsolation.restore();
    jest.restoreAllMocks();
  });

  it('update() creates destination folders that do not exist when writing plugin files', async () => {
    const repoName: string = 'pluginWithBuildCommandRepo';
    const packageName: string = 'rush-build-command-plugin';
    const { parser, repoPath } = await getCommandLineParserInstanceAsync(repoName, 'update');
    const {
      autoinstallerStorePath,
      sourceCommandLineJsonPath,
      sourceManifestPath,
      destinationCommandLineJsonPath,
      destinationManifestPath
    } = seedPluginFilesWithCrLf(repoPath, packageName);

    FileSystem.ensureEmptyFolder(autoinstallerStorePath);

    expect(FileSystem.exists(destinationManifestPath)).toBe(false);
    expect(FileSystem.exists(destinationCommandLineJsonPath)).toBe(false);
    expect(FileSystem.readFile(sourceManifestPath)).toContain('\r\n');
    expect(FileSystem.readFile(sourceCommandLineJsonPath)).toContain('\r\n');

    const prepareAsyncSpy = mockAutoinstallerPrepareAsync();
    const baseInstallActionPrototype: { runAsync(): Promise<void> } =
      BaseInstallAction.prototype as unknown as { runAsync(): Promise<void> };
    const runAsyncSpy = jest.spyOn(baseInstallActionPrototype, 'runAsync').mockResolvedValue(undefined);

    try {
      await expect(parser.executeAsync()).resolves.toEqual(true);
    } finally {
      runAsyncSpy.mockRestore();
      prepareAsyncSpy.mockRestore();
    }

    expect(FileSystem.exists(destinationManifestPath)).toBe(true);
    expect(FileSystem.exists(destinationCommandLineJsonPath)).toBe(true);
    expectFileToUseLfLineEndings(destinationManifestPath);
    expectFileToUseLfLineEndings(destinationCommandLineJsonPath);
  });
});
