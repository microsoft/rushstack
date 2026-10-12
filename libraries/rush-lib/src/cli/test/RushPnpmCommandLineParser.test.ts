// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import { RushPnpmCommandLineParser } from '../RushPnpmCommandLineParser';

async function validatePnpmArgsAsync(pnpmArgs: string[]): Promise<string[]> {
  await RushPnpmCommandLineParser._validatePnpmUsageForTestingAsync(pnpmArgs);
  return pnpmArgs;
}

const SUBSPACE_TEMP_FOLDER: string = '/repo/common/temp';

function createPostExecuteOptions(options: {
  commandName: string;
  pnpmVersion: string;
  globalPatchedDependencies: Record<string, string> | undefined;
  updateGlobalPatchedDependencies: jest.Mock;
  doRushUpdateAsync: jest.Mock;
}): Parameters<typeof RushPnpmCommandLineParser._postExecuteForTestingAsync>[0] {
  const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());
  return {
    commandName: options.commandName,
    rushConfiguration: { packageManagerToolVersion: options.pnpmVersion } as RushConfiguration,
    terminal,
    doRushUpdateAsync: options.doRushUpdateAsync,
    subspace: {
      getSubspaceTempFolderPath: () => SUBSPACE_TEMP_FOLDER,
      getSubspaceConfigFolderPath: () => '/repo/common/config/rush',
      getSubspacePnpmPatchesFolderPath: () => '/repo/common/config/rush/pnpm-patches',
      getPnpmOptions: () => ({
        globalPatchedDependencies: options.globalPatchedDependencies,
        updateGlobalPatchedDependencies: options.updateGlobalPatchedDependencies
      })
    } as unknown as Subspace
  };
}

describe(RushPnpmCommandLineParser.name, () => {
  it('adds recursive mode to workspace query commands by default', async () => {
    await expect(validatePnpmArgsAsync(['outdated'])).resolves.toEqual(['outdated', '--recursive']);
    await expect(validatePnpmArgsAsync(['why', '@rushstack/node-core-library'])).resolves.toEqual([
      'why',
      '--recursive',
      '@rushstack/node-core-library'
    ]);
  });

  it('does not duplicate explicit recursive flags', async () => {
    await expect(validatePnpmArgsAsync(['outdated', '-r'])).resolves.toEqual(['outdated', '-r']);
    await expect(
      validatePnpmArgsAsync(['why', '--recursive', '@rushstack/node-core-library'])
    ).resolves.toEqual(['why', '--recursive', '@rushstack/node-core-library']);
  });

  it('does not force recursive mode for global outdated checks', async () => {
    await expect(validatePnpmArgsAsync(['outdated', '--global'])).resolves.toEqual(['outdated', '--global']);
  });
});

describe(`${RushPnpmCommandLineParser.name} catalog sync`, () => {
  const PACKAGE_ROOT: string = path.resolve(__dirname, '../../..');
  const TEST_TEMP_FOLDER: string = `${PACKAGE_ROOT}/temp/rush-pnpm-catalog-sync-test`;
  const FIXTURE_FOLDER: string = `${__dirname}/catalogSyncTestRepo`;

  function createParserForCommand(
    repoFolder: string,
    commandName: string
  ): {
    parserOptions: Parameters<typeof RushPnpmCommandLineParser._postExecuteForTestingAsync>[0];
    pnpmConfigFilename: string;
  } {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${repoFolder}/rush.json`
    );
    const subspace: Subspace = rushConfiguration.defaultSubspace;
    const terminal: Terminal = new Terminal(new StringBufferTerminalProvider());

    return {
      parserOptions: {
        commandName,
        doRushUpdateAsync: async () => {},
        rushConfiguration,
        subspace,
        terminal
      },
      pnpmConfigFilename: `${repoFolder}/common/config/rush/pnpm-config.json`
    };
  }

  beforeEach(async () => {
    await FileSystem.deleteFolderAsync(TEST_TEMP_FOLDER);
    await FileSystem.copyFilesAsync({
      sourcePath: FIXTURE_FOLDER,
      destinationPath: TEST_TEMP_FOLDER
    });
  });

  afterEach(async () => {
    await FileSystem.deleteFolderAsync(TEST_TEMP_FOLDER);
  });

  it('writes updated catalog versions from pnpm-workspace.yaml back to pnpm-config.json', async () => {
    // Simulate "pnpm up" having bumped a catalog entry in the generated workspace file
    const workspaceYamlFilename: string = `${TEST_TEMP_FOLDER}/common/temp/pnpm-workspace.yaml`;
    const bumpedWorkspaceYaml: string = [
      'packages:',
      "  - '../../apps/*'",
      'catalogs:',
      '  default:',
      '    react: ^18.2.0',
      '    react-dom: ^18.2.0',
      ''
    ].join('\n');
    await FileSystem.writeFileAsync(workspaceYamlFilename, bumpedWorkspaceYaml);

    const { parserOptions, pnpmConfigFilename } = createParserForCommand(TEST_TEMP_FOLDER, 'up');
    await RushPnpmCommandLineParser._postExecuteForTestingAsync(parserOptions);

    const updatedConfig: { globalCatalogs?: Record<string, Record<string, string>> } =
      await JsonFile.loadAsync(pnpmConfigFilename);
    expect(updatedConfig.globalCatalogs).toEqual({
      default: {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      }
    });
  });

  it('does not modify pnpm-config.json when the catalog is unchanged', async () => {
    const { parserOptions, pnpmConfigFilename } = createParserForCommand(TEST_TEMP_FOLDER, 'up');

    const originalContent: string = await FileSystem.readFileAsync(pnpmConfigFilename);
    const doRushUpdateSpy: jest.Mock = jest.fn();
    parserOptions.doRushUpdateAsync = doRushUpdateSpy;

    await RushPnpmCommandLineParser._postExecuteForTestingAsync(parserOptions);

    // The fixture's pnpm-workspace.yaml already matches pnpm-config.json, so nothing should change
    expect(await FileSystem.readFileAsync(pnpmConfigFilename)).toEqual(originalContent);
    expect(doRushUpdateSpy).not.toHaveBeenCalled();
  });
});

describe(`${RushPnpmCommandLineParser.name} patch-commit patchedDependencies sync`, () => {
  it('reads patchedDependencies from pnpm-workspace.yaml for pnpm >= 11', async () => {
    const updateGlobalPatchedDependencies: jest.Mock = jest.fn();
    const doRushUpdateAsync: jest.Mock = jest.fn();
    const parserOptions = createPostExecuteOptions({
      commandName: 'patch-commit',
      pnpmVersion: '11.7.0',
      globalPatchedDependencies: { 'left-pad@1.0.0': 'patches/left-pad@1.0.0.patch' },
      updateGlobalPatchedDependencies,
      doRushUpdateAsync
    });

    const workspaceYaml: string =
      'packages:\n' +
      '  - ../../app\n' +
      'patchedDependencies:\n' +
      '  lodash@4.17.21: patches/lodash@4.17.21.patch\n';
    const readFileAsyncSpy: jest.SpyInstance = jest
      .spyOn(FileSystem, 'readFileAsync')
      .mockResolvedValue(workspaceYaml);
    // If the code incorrectly read package.json for pnpm 11, it would pick up this sentinel value.
    const jsonLoadSpy: jest.SpyInstance = jest
      .spyOn(JsonFile, 'load')
      .mockReturnValue({ pnpm: { patchedDependencies: { 'should-not-be-used@1.0.0': 'x.patch' } } });

    await RushPnpmCommandLineParser._postExecuteForTestingAsync(parserOptions);

    expect(readFileAsyncSpy).toHaveBeenCalledWith(`${SUBSPACE_TEMP_FOLDER}/pnpm-workspace.yaml`);
    expect(jsonLoadSpy).not.toHaveBeenCalled();
    expect(updateGlobalPatchedDependencies).toHaveBeenCalledWith({
      'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
    });
    expect(doRushUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('reads patchedDependencies from package.json for pnpm < 11', async () => {
    const updateGlobalPatchedDependencies: jest.Mock = jest.fn();
    const doRushUpdateAsync: jest.Mock = jest.fn();
    const parserOptions = createPostExecuteOptions({
      commandName: 'patch-commit',
      pnpmVersion: '10.27.0',
      globalPatchedDependencies: { 'left-pad@1.0.0': 'patches/left-pad@1.0.0.patch' },
      updateGlobalPatchedDependencies,
      doRushUpdateAsync
    });

    const readFileAsyncSpy: jest.SpyInstance = jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue('');
    const jsonLoadSpy: jest.SpyInstance = jest.spyOn(JsonFile, 'load').mockReturnValue({
      pnpm: { patchedDependencies: { 'lodash@4.17.21': 'patches/lodash@4.17.21.patch' } }
    });

    await RushPnpmCommandLineParser._postExecuteForTestingAsync(parserOptions);

    expect(jsonLoadSpy).toHaveBeenCalledWith(`${SUBSPACE_TEMP_FOLDER}/package.json`);
    expect(readFileAsyncSpy).not.toHaveBeenCalled();
    expect(updateGlobalPatchedDependencies).toHaveBeenCalledWith({
      'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
    });
    expect(doRushUpdateAsync).toHaveBeenCalledTimes(1);
  });
});
