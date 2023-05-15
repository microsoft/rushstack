// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';
import * as colorsPackage from 'colors';

import { Utilities } from '../../utilities/Utilities';
import { Rush } from '../../api/Rush';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';

import { RushXCommandLine } from '../RushXCommandLine';

describe(RushXCommandLine.name, () => {
  let $argv: string[];
  let $versions: NodeJS.ProcessVersions;
  let executeLifecycleCommandMock: jest.SpyInstance | undefined;
  let logMock: jest.SpyInstance | undefined;
  let rushConfiguration: RushConfiguration | undefined;
  let colorsEnabled: boolean;

  beforeEach(() => {
    colorsEnabled = colorsPackage.enabled;
    if (!colorsEnabled) {
      colorsPackage.enable();
    }

    // Mock process
    $argv = process.argv;
    process.argv = [...process.argv];
    $versions = process.versions;
    Object.defineProperty(process, 'versions', {
      value: { ...process.versions, node: '12.12.12' }
    });
    jest.spyOn(process, 'cwd').mockReturnValue('/Users/jdoe/bigrepo/apps/acme');

    // Mock rush version
    jest.spyOn(Rush, 'version', 'get').mockReturnValue('40.40.40');

    // Mock package.json
    jest
      .spyOn(PackageJsonLookup.prototype, 'tryGetPackageJsonFilePathFor')
      .mockReturnValue('apps/acme/package.json');
    jest.spyOn(PackageJsonLookup.prototype, 'loadPackageJson').mockReturnValueOnce({
      name: '@acme/acme',
      version: '0.0.1',
      scripts: {
        build: 'an acme project build command',
        test: 'an acme project test command'
      }
    });

    // Mock rush configuration
    const projects: RushConfigurationProject[] = [
      {
        packageName: '@acme/acme',
        projectFolder: '/Users/jdoe/bigrepo/apps/acme',
        projectRelativeFolder: 'apps/acme'
      } as RushConfigurationProject
    ];
    rushConfiguration = {
      commonRushConfigFolder: '',
      rushJsonFolder: '',
      commonTempFolder: 'common/temp',
      projects,
      tryGetProjectForPath(path: string): RushConfigurationProject | undefined {
        return projects.find((project) => project.projectFolder === path);
      }
    } as RushConfiguration;
    jest.spyOn(RushConfiguration, 'tryLoadFromDefaultLocation').mockReturnValue(rushConfiguration);

    // Mock command execution
    executeLifecycleCommandMock = jest.spyOn(Utilities, 'executeLifecycleCommand');

    // Mock console log
    logMock = jest.spyOn(console, 'log');
  });

  afterEach(() => {
    if (!colorsEnabled) {
      colorsPackage.disable();
    }

    process.argv = $argv;
    Object.defineProperty(process, 'versions', {
      value: $versions
    });
    executeLifecycleCommandMock = undefined;
    logMock = undefined;
    rushConfiguration = undefined;
    jest.restoreAllMocks();
  });

  describe(RushXCommandLine.launchRushX.name, () => {
    it('prints usage info', () => {
      process.argv = ['node', 'startx.js', '--help'];
      executeLifecycleCommandMock!.mockReturnValue(0);

      RushXCommandLine.launchRushX('', true);

      expect(executeLifecycleCommandMock).not.toHaveBeenCalled();
      expect(logMock!.mock.calls).toMatchSnapshot();
    });

    it('executes a valid package script', () => {
      process.argv = ['node', 'startx.js', 'build'];
      executeLifecycleCommandMock!.mockReturnValue(0);

      RushXCommandLine.launchRushX('', true);

      expect(executeLifecycleCommandMock).toHaveBeenCalledWith('an acme project build command', {
        rushConfiguration,
        workingDirectory: 'apps/acme',
        initCwd: 'common/temp',
        handleOutput: false,
        environmentPathOptions: {
          includeProjectBin: true
        }
      });
      expect(logMock!.mock.calls).toMatchSnapshot();
    });

    it('executes a valid package script with no startup banner', () => {
      process.argv = ['node', 'startx.js', '--quiet', 'build'];
      executeLifecycleCommandMock!.mockReturnValue(0);

      RushXCommandLine.launchRushX('', true);

      expect(executeLifecycleCommandMock).toHaveBeenCalledWith('an acme project build command', {
        rushConfiguration,
        workingDirectory: 'apps/acme',
        initCwd: 'common/temp',
        handleOutput: false,
        environmentPathOptions: {
          includeProjectBin: true
        }
      });
      expect(logMock!.mock.calls).toMatchSnapshot();
    });

    it('fails if the package does not contain a matching script', () => {
      process.argv = ['node', 'startx.js', 'asdf'];
      executeLifecycleCommandMock!.mockReturnValue(0);

      RushXCommandLine.launchRushX('', true);

      expect(executeLifecycleCommandMock).not.toHaveBeenCalled();
      expect(logMock!.mock.calls).toMatchSnapshot();
    });
  });
});
