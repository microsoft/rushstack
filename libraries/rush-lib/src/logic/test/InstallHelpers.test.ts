// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IPackageJson, JsonFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';

describe(InstallHelpers.name, () => {
  describe(InstallHelpers.generateCommonPackageJsonAsync.name, () => {
    let mockJsonFileSaveAsync: jest.SpyInstance;
    let terminal: Terminal;
    let terminalProvider: StringBufferTerminalProvider;

    beforeAll(() => {
      mockJsonFileSaveAsync = jest.spyOn(JsonFile, 'saveAsync').mockImplementation(async () => true);
    });

    beforeEach(() => {
      terminalProvider = new StringBufferTerminalProvider();
      terminal = new Terminal(terminalProvider);
    });

    afterEach(() => {
      expect(
        terminalProvider.getAllOutputAsChunks({
          normalizeSpecialCharacters: true,
          asLines: true
        })
      ).toMatchSnapshot('Terminal Output');
      mockJsonFileSaveAsync.mockClear();
    });

    it('generates correct package json with pnpm configurations', async () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfig/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      await InstallHelpers.generateCommonPackageJsonAsync(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        undefined,
        terminal
      );
      const packageJson: IPackageJson = JSON.parse(
        JsonFile.stringify(mockJsonFileSaveAsync.mock.calls[0][0], { ignoreUndefinedValues: true })
      );
      expect(packageJson).toEqual(
        expect.objectContaining({
          pnpm: {
            overrides: {
              foo: '^2.0.0', // <-- unsupportedPackageJsonSettings.pnpm.override.foo
              quux: 'npm:@myorg/quux@^1.0.0',
              'bar@^2.1.0': '3.0.0',
              'qar@1>zoo': '2'
            },
            packageExtensions: {
              'react-redux': {
                peerDependencies: {
                  'react-dom': '*'
                }
              }
            },
            neverBuiltDependencies: ['fsevents', 'level'],
            onlyBuiltDependencies: ['esbuild', 'playwright'],
            pnpmFutureFeature: true
          }
        })
      );
      expect(packageJson).toMatchSnapshot();
    });
  });
});
