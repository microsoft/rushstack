// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { DependencyType } from '../../api/PackageJsonEditor';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import { PackageJsonUpdater } from '../PackageJsonUpdater';
import { type IPackageJsonUpdaterRushAddOptions, SemVerStyle } from '../PackageJsonUpdaterTypes';
import { VersionMismatchFinderProject } from '../versionMismatch/VersionMismatchFinderProject';
import { VersionMismatchFinderCommonVersions } from '../versionMismatch/VersionMismatchFinderCommonVersions';

describe(PackageJsonUpdater.name, () => {
  describe('with PNPM catalog references', () => {
    let rushConfiguration: RushConfiguration;
    let terminalProvider: StringBufferTerminalProvider;
    let packageJsonUpdater: PackageJsonUpdater;

    beforeEach(() => {
      // Don't write the fixture files
      jest.spyOn(VersionMismatchFinderProject.prototype, 'saveIfModifiedAsync').mockResolvedValue(false);
      jest
        .spyOn(VersionMismatchFinderCommonVersions.prototype, 'saveIfModifiedAsync')
        .mockResolvedValue(false);

      rushConfiguration = RushConfiguration.loadFromConfigurationFile(
        path.resolve(__dirname, 'repoWithCatalogs', 'rush.json')
      );
      terminalProvider = new StringBufferTerminalProvider();
      packageJsonUpdater = new PackageJsonUpdater(
        new Terminal(terminalProvider),
        rushConfiguration,
        new RushGlobalFolder()
      );
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    function getVersionSpecifier(projectName: string, packageName: string): string | undefined {
      return rushConfiguration.getProjectByName(projectName)!.packageJsonEditor.tryGetDependency(packageName)
        ?.version;
    }

    async function addWithMakeConsistentAsync(
      project: RushConfigurationProject,
      packageName: string,
      version: string
    ): Promise<void> {
      // Avoid querying the registry for the version
      rushConfiguration.defaultSubspace.getCommonVersions().preferredVersions.set(packageName, version);

      const options: IPackageJsonUpdaterRushAddOptions = {
        actionName: 'add',
        projects: [project],
        packagesToUpdate: [{ packageName, version, rangeStyle: SemVerStyle.Passthrough }],
        updateOtherPackages: true,
        devDependency: false,
        peerDependency: false,
        skipUpdate: true,
        debugInstall: false,
        variant: undefined
      };
      await packageJsonUpdater.doRushUpdateAsync(options);
    }

    it('does not replace catalog references when making versions consistent', async () => {
      // "a" and "d" use "semver": "catalog:", which resolves to ^7.5.4
      await addWithMakeConsistentAsync(rushConfiguration.getProjectByName('c')!, 'semver', '^7.6.0');

      expect(getVersionSpecifier('c', 'semver')).toEqual('^7.6.0');
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');

      const warnings: string = terminalProvider.getWarningOutput();
      expect(warnings).toContain(
        'Not updating "semver" in "a" because it uses the PNPM catalog reference "catalog:" (^7.5.4).'
      );
      expect(warnings).toContain(
        'Not updating "semver" in "d" because it uses the PNPM catalog reference "catalog:" (^7.5.4).'
      );
    });

    it('updates other projects without reporting catalog references that are already consistent', async () => {
      rushConfiguration
        .getProjectByName('b')!
        .packageJsonEditor.addOrUpdateDependency('semver', '~7.0.0', DependencyType.Regular);

      await addWithMakeConsistentAsync(rushConfiguration.getProjectByName('c')!, 'semver', '^7.5.4');

      expect(getVersionSpecifier('b', 'semver')).toEqual('^7.5.4');
      expect(getVersionSpecifier('c', 'semver')).toEqual('^7.5.4');
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');
      expect(terminalProvider.getWarningOutput()).toEqual('');
    });
  });
});
