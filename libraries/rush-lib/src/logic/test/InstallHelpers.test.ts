// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IPackageJson, JsonFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { TestUtilities } from '@rushstack/heft-config-file';

import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';
import type { PnpmWorkspaceFile } from '../pnpm/PnpmWorkspaceFile';

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
      const pnpmSettings = InstallHelpers.resolvePnpmSettings(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        terminal
      );
      await InstallHelpers.generateCommonPackageJsonAsync(
        rushConfiguration.defaultSubspace,
        undefined,
        pnpmSettings
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
            // For pnpm < 11 all of these settings are still written into the package.json "pnpm" field.
            packageExtensions: {
              'react-redux': {
                peerDependencies: {
                  'react-dom': '*'
                }
              }
            },
            peerDependencyRules: {
              allowedVersions: {
                react: '18'
              },
              ignoreMissing: ['@babel/core']
            },
            allowedDeprecatedVersions: {
              request: '*'
            },
            patchedDependencies: {
              'lodash@4.17.21': 'patches/lodash@4.17.21.patch'
            },
            neverBuiltDependencies: ['fsevents', 'level'],
            onlyBuiltDependencies: ['esbuild', 'playwright'],
            pnpmFutureFeature: true
          }
        })
      );
      expect(packageJson).toMatchSnapshot();
    });

    it('does not generate a "pnpm" field for pnpm 11 (all settings belong in pnpm-workspace.yaml)', async () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfigPnpm11/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      const pnpmSettings = InstallHelpers.resolvePnpmSettings(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        terminal
      );
      await InstallHelpers.generateCommonPackageJsonAsync(
        rushConfiguration.defaultSubspace,
        undefined,
        pnpmSettings
      );
      const packageJson: IPackageJson = JSON.parse(
        JsonFile.stringify(mockJsonFileSaveAsync.mock.calls[0][0], { ignoreUndefinedValues: true })
      );
      // For pnpm >= 11 the "pnpm" field is not generated at all; every setting is written to
      // common/temp/pnpm-workspace.yaml instead.
      expect(packageJson).not.toHaveProperty('pnpm');

      // ...and the relocated settings are instead placed on the generated pnpm-workspace.yaml file.
      const workspaceFile: PnpmWorkspaceFile | undefined =
        TestUtilities.stripAnnotations(pnpmSettings)?.workspaceFile;
      expect(workspaceFile?.ignoredOptionalDependencies).toEqual(['fsevents']);
      expect(workspaceFile?.trustPolicy).toEqual('no-downgrade');
      expect(workspaceFile?.trustPolicyExclude).toEqual(['chokidar@4.0.3']);
      expect(workspaceFile?.trustPolicyIgnoreAfter).toEqual(1440);
    });
  });
});
