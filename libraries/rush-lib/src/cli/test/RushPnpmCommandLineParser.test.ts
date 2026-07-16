// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { RushPnpmCommandLineParser } from '../RushPnpmCommandLineParser';

interface IRushPnpmCommandLineParserInternals {
  _validatePnpmUsageAsync(pnpmArgs: string[]): Promise<void>;
}

async function validatePnpmArgsAsync(pnpmArgs: string[]): Promise<string[]> {
  const parser: IRushPnpmCommandLineParserInternals = Object.create(RushPnpmCommandLineParser.prototype);
  await parser._validatePnpmUsageAsync(pnpmArgs);
  return pnpmArgs;
}

const SUBSPACE_TEMP_FOLDER: string = '/repo/common/temp';

function createPostExecuteParser(options: {
  commandName: string;
  pnpmVersion: string;
  globalPatchedDependencies: Record<string, string> | undefined;
  updateGlobalPatchedDependencies: jest.Mock;
  doRushUpdateAsync: jest.Mock;
}): RushPnpmCommandLineParser {
  const parser: RushPnpmCommandLineParser = Object.create(RushPnpmCommandLineParser.prototype);
  Object.assign(parser, {
    _commandName: options.commandName,
    _rushConfiguration: { packageManagerToolVersion: options.pnpmVersion },
    _terminal: { writeWarningLine: jest.fn(), writeErrorLine: jest.fn() },
    _doRushUpdateAsync: options.doRushUpdateAsync,
    _subspace: {
      getSubspaceTempFolderPath: () => SUBSPACE_TEMP_FOLDER,
      getSubspaceConfigFolderPath: () => '/repo/common/config/rush',
      getSubspacePnpmPatchesFolderPath: () => '/repo/common/config/rush/pnpm-patches',
      getPnpmOptions: () => ({
        globalPatchedDependencies: options.globalPatchedDependencies,
        updateGlobalPatchedDependencies: options.updateGlobalPatchedDependencies
      })
    }
  });
  return parser;
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

describe(`${RushPnpmCommandLineParser.name} patch-commit patchedDependencies sync`, () => {
  it('reads patchedDependencies from pnpm-workspace.yaml for pnpm >= 11', async () => {
    const updateGlobalPatchedDependencies: jest.Mock = jest.fn();
    const doRushUpdateAsync: jest.Mock = jest.fn();
    const parser: RushPnpmCommandLineParser = createPostExecuteParser({
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

    await parser['_postExecuteAsync']();

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
    const parser: RushPnpmCommandLineParser = createPostExecuteParser({
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

    await parser['_postExecuteAsync']();

    expect(jsonLoadSpy).toHaveBeenCalledWith(`${SUBSPACE_TEMP_FOLDER}/package.json`);
    expect(readFileAsyncSpy).not.toHaveBeenCalled();
    expect(updateGlobalPatchedDependencies).toHaveBeenCalledWith({
      'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
    });
    expect(doRushUpdateAsync).toHaveBeenCalledTimes(1);
  });
});
