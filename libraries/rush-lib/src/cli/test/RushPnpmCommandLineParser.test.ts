// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { FileSystem, JsonFile } from '@rushstack/node-core-library';

import { RushConfiguration } from '../../api/RushConfiguration';
import type { Subspace } from '../../api/Subspace';
import { RushPnpmCommandLineParser } from '../RushPnpmCommandLineParser';

interface IRushPnpmCommandLineParserInternals {
  _validatePnpmUsageAsync(pnpmArgs: string[]): Promise<void>;
}

async function validatePnpmArgsAsync(pnpmArgs: string[]): Promise<string[]> {
  const parser: IRushPnpmCommandLineParserInternals = Object.create(RushPnpmCommandLineParser.prototype);
  await parser._validatePnpmUsageAsync(pnpmArgs);
  return pnpmArgs;
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

  interface IRushPnpmCommandLineParserCatalogInternals {
    _commandName: string;
    _subspace: Subspace;
    _terminal: { writeWarningLine(message: string): void };
    _doRushUpdateAsync(): Promise<void>;
    _postExecuteAsync(): Promise<void>;
  }

  function createParserForCommand(
    repoFolder: string,
    commandName: string
  ): { parser: IRushPnpmCommandLineParserCatalogInternals; pnpmConfigFilename: string } {
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
      `${repoFolder}/rush.json`
    );
    const subspace: Subspace = rushConfiguration.defaultSubspace;

    const parser: IRushPnpmCommandLineParserCatalogInternals = Object.create(
      RushPnpmCommandLineParser.prototype
    );
    parser._commandName = commandName;
    parser._subspace = subspace;
    parser._terminal = { writeWarningLine: () => {} };
    // Avoid triggering a real "rush update"
    parser._doRushUpdateAsync = async () => {};

    return {
      parser,
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

    const { parser, pnpmConfigFilename } = createParserForCommand(TEST_TEMP_FOLDER, 'up');
    await parser._postExecuteAsync();

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
    const { parser, pnpmConfigFilename } = createParserForCommand(TEST_TEMP_FOLDER, 'up');

    const originalContent: string = await FileSystem.readFileAsync(pnpmConfigFilename);
    const doRushUpdateSpy: jest.SpyInstance = jest
      .spyOn(parser, '_doRushUpdateAsync')
      .mockResolvedValue(undefined);

    await parser._postExecuteAsync();

    // The fixture's pnpm-workspace.yaml already matches pnpm-config.json, so nothing should change
    expect(await FileSystem.readFileAsync(pnpmConfigFilename)).toEqual(originalContent);
    expect(doRushUpdateSpy).not.toHaveBeenCalled();
  });
});
