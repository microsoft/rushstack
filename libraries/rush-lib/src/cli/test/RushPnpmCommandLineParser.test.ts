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

interface IPnpmOptionsStub {
  globalPatchedDependencies: Record<string, string> | undefined;
  updateGlobalPatchedDependencies: jest.Mock;
}

interface ISubspaceStub {
  getSubspaceTempFolderPath(): string;
  getSubspaceConfigFolderPath(): string;
  getSubspacePnpmPatchesFolderPath(): string;
  getPnpmOptions(): IPnpmOptionsStub | undefined;
}

interface IPostExecuteInternals {
  _commandName?: string;
  _subspace: ISubspaceStub;
  _rushConfiguration: { packageManagerToolVersion: string };
  _terminal: { writeWarningLine: jest.Mock; writeErrorLine: jest.Mock };
  _doRushUpdateAsync: jest.Mock;
  _postExecuteAsync(): Promise<void>;
}

const SUBSPACE_TEMP_FOLDER: string = '/repo/common/temp';

function createPostExecuteParser(
  commandName: string,
  pnpmVersion: string,
  pnpmOptions: IPnpmOptionsStub
): IPostExecuteInternals {
  const parser: IPostExecuteInternals = Object.create(RushPnpmCommandLineParser.prototype);
  parser._commandName = commandName;
  parser._rushConfiguration = { packageManagerToolVersion: pnpmVersion };
  parser._terminal = { writeWarningLine: jest.fn(), writeErrorLine: jest.fn() };
  parser._doRushUpdateAsync = jest.fn().mockResolvedValue(undefined);
  parser._subspace = {
    getSubspaceTempFolderPath: () => SUBSPACE_TEMP_FOLDER,
    getSubspaceConfigFolderPath: () => '/repo/common/config/rush',
    getSubspacePnpmPatchesFolderPath: () => '/repo/common/config/rush/pnpm-patches',
    getPnpmOptions: () => pnpmOptions
  };
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

describe('RushPnpmCommandLineParser patch-commit patchedDependencies sync', () => {
  let readFileAsyncSpy: jest.SpyInstance;
  let existsSpy: jest.SpyInstance;
  let jsonLoadSpy: jest.SpyInstance;

  afterEach(() => {
    readFileAsyncSpy?.mockRestore();
    existsSpy?.mockRestore();
    jsonLoadSpy?.mockRestore();
  });

  it('reads patchedDependencies from pnpm-workspace.yaml for pnpm >= 11', async () => {
    const pnpmOptions: IPnpmOptionsStub = {
      globalPatchedDependencies: { 'left-pad@1.0.0': 'patches/left-pad@1.0.0.patch' },
      updateGlobalPatchedDependencies: jest.fn()
    };
    const parser: IPostExecuteInternals = createPostExecuteParser('patch-commit', '11.7.0', pnpmOptions);

    const workspaceYaml: string =
      'packages:\n' +
      '  - ../../app\n' +
      'patchedDependencies:\n' +
      '  lodash@4.17.21: patches/lodash@4.17.21.patch\n';
    readFileAsyncSpy = jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue(workspaceYaml);
    existsSpy = jest.spyOn(FileSystem, 'exists').mockReturnValue(false);
    // If the code incorrectly read package.json for pnpm 11, it would pick up this sentinel value.
    jsonLoadSpy = jest
      .spyOn(JsonFile, 'load')
      .mockReturnValue({ pnpm: { patchedDependencies: { 'should-not-be-used@1.0.0': 'x.patch' } } });

    await parser._postExecuteAsync();

    expect(readFileAsyncSpy).toHaveBeenCalledWith(`${SUBSPACE_TEMP_FOLDER}/pnpm-workspace.yaml`);
    expect(jsonLoadSpy).not.toHaveBeenCalled();
    expect(pnpmOptions.updateGlobalPatchedDependencies).toHaveBeenCalledWith({
      'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
    });
    expect(parser._doRushUpdateAsync).toHaveBeenCalledTimes(1);
  });

  it('reads patchedDependencies from package.json for pnpm < 11', async () => {
    const pnpmOptions: IPnpmOptionsStub = {
      globalPatchedDependencies: { 'left-pad@1.0.0': 'patches/left-pad@1.0.0.patch' },
      updateGlobalPatchedDependencies: jest.fn()
    };
    const parser: IPostExecuteInternals = createPostExecuteParser('patch-commit', '10.27.0', pnpmOptions);

    existsSpy = jest.spyOn(FileSystem, 'exists').mockReturnValue(false);
    readFileAsyncSpy = jest.spyOn(FileSystem, 'readFileAsync').mockResolvedValue('');
    jsonLoadSpy = jest
      .spyOn(JsonFile, 'load')
      .mockReturnValue({
        pnpm: { patchedDependencies: { 'lodash@4.17.21': 'patches/lodash@4.17.21.patch' } }
      });

    await parser._postExecuteAsync();

    expect(jsonLoadSpy).toHaveBeenCalledWith(`${SUBSPACE_TEMP_FOLDER}/package.json`);
    expect(readFileAsyncSpy).not.toHaveBeenCalled();
    expect(pnpmOptions.updateGlobalPatchedDependencies).toHaveBeenCalledWith({
      'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
    });
    expect(parser._doRushUpdateAsync).toHaveBeenCalledTimes(1);
  });
});
