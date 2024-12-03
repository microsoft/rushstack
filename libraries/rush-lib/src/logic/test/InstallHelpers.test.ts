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
      expect({
        output: terminalProvider.getOutput({ normalizeSpecialCharacters: true }),
        verbose: terminalProvider.getVerbose({ normalizeSpecialCharacters: true }),
        error: terminalProvider.getDebugOutput({ normalizeSpecialCharacters: true }),
        warning: terminalProvider.getWarningOutput({ normalizeSpecialCharacters: true }),
        debug: terminalProvider.getDebugOutput({ normalizeSpecialCharacters: true })
      }).toMatchSnapshot('Terminal Output');
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
            packageExtensions: {
              'react-redux': {
                peerDependencies: {
                  'react-dom': '*'
                }
              }
            },
            neverBuiltDependencies: ['fsevents', 'level'],
            pnpmFutureFeature: true
          }
        })
      );
    });
  });
});
