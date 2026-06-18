// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { type IPackageJson, JsonFile } from '@rushstack/node-core-library';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';
import { TestUtilities } from '@rushstack/heft-config-file';

import { InstallHelpers } from '../installManager/InstallHelpers';
import { RushConfiguration } from '../../api/RushConfiguration';

describe('InstallHelpers', () => {
  describe('generateCommonPackageJson', () => {
    const originalJsonFileSave = JsonFile.save;
    const mockJsonFileSave: jest.Mock = jest.fn();
    let terminal: Terminal;
    let terminalProvider: StringBufferTerminalProvider;

    beforeAll(() => {
      JsonFile.save = mockJsonFileSave;
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
      mockJsonFileSave.mockClear();
    });

    afterAll(() => {
      JsonFile.save = originalJsonFileSave;
    });

    it('generates correct package json with pnpm configurations', () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfig/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      InstallHelpers.generateCommonPackageJson(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        undefined,
        terminal
      );
      const packageJson: IPackageJson = mockJsonFileSave.mock.calls[0][0];
      expect(TestUtilities.stripAnnotations(packageJson)).toEqual(
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
    });

    it('omits the relocated pnpm settings for pnpm 11 (they belong in pnpm-workspace.yaml)', () => {
      const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfigPnpm11/rush.json`;
      const rushConfiguration: RushConfiguration =
        RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      InstallHelpers.generateCommonPackageJson(
        rushConfiguration,
        rushConfiguration.defaultSubspace,
        undefined,
        terminal
      );
      const packageJson: IPackageJson = mockJsonFileSave.mock.calls[0][0];
      const pnpmField: Record<string, unknown> = (
        TestUtilities.stripAnnotations(packageJson) as unknown as { pnpm: Record<string, unknown> }
      ).pnpm;
      // For pnpm >= 11 these are written to common/temp/pnpm-workspace.yaml instead of package.json.
      expect(pnpmField).not.toHaveProperty('overrides');
      expect(pnpmField).not.toHaveProperty('packageExtensions');
      expect(pnpmField).not.toHaveProperty('peerDependencyRules');
      expect(pnpmField).not.toHaveProperty('allowedDeprecatedVersions');
      expect(pnpmField).not.toHaveProperty('patchedDependencies');
    });
  });
});
