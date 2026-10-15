// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import type { INpmCheckPackageSummary } from '@rushstack/npm-check-fork';
import { TestUtilities } from '@rushstack/heft-config-file';
import { StringBufferTerminalProvider, Terminal } from '@rushstack/terminal';

import { RushConfiguration } from '../../api/RushConfiguration';
import type { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { DependencyType } from '../../api/PackageJsonEditor';
import { RushGlobalFolder } from '../../api/RushGlobalFolder';
import type { Subspace } from '../../api/Subspace';
import { type IExecuteCommandAndCaptureOutputOptions, Utilities } from '../../utilities/Utilities';
import { InstallHelpers } from '../installManager/InstallHelpers';
import { InstallManagerFactory } from '../InstallManagerFactory';
import type { BaseInstallManager } from '../base/BaseInstallManager';
import { PackageJsonUpdater } from '../PackageJsonUpdater';
import { type IPackageJsonUpdaterRushAddOptions, SemVerStyle } from '../PackageJsonUpdaterTypes';
import { getEffectivePnpmCatalogs, type PnpmCatalogs } from '../pnpm/EffectivePnpmOptions';
import { PnpmOptionsConfiguration } from '../pnpm/PnpmOptionsConfiguration';
import { PurgeManager } from '../PurgeManager';
import { VersionMismatchFinderProject } from '../versionMismatch/VersionMismatchFinderProject';
import { VersionMismatchFinderCommonVersions } from '../versionMismatch/VersionMismatchFinderCommonVersions';

interface IAddOptions {
  makeConsistent?: boolean;
  dev?: boolean;
  skipUpdate?: boolean;
}

describe(PackageJsonUpdater.name, () => {
  let rushConfiguration: RushConfiguration;
  let terminalProvider: StringBufferTerminalProvider;
  let packageJsonUpdater: PackageJsonUpdater;
  // The catalogs written to each pnpm-config.json file
  let savedCatalogsByFilePath: Map<string, PnpmCatalogs | undefined>;
  // The latest version of each package in the mocked registry
  let latestVersionByPackageName: Map<string, string>;
  let doInstallAsyncMock: jest.Mock;

  function loadRepo(repoFolderName: string): void {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, repoFolderName, 'rush.json')
    );
    terminalProvider = new StringBufferTerminalProvider();
    packageJsonUpdater = new PackageJsonUpdater(
      new Terminal(terminalProvider),
      rushConfiguration,
      new RushGlobalFolder()
    );
  }

  beforeEach(() => {
    // Don't write the fixture files
    jest.spyOn(VersionMismatchFinderProject.prototype, 'saveIfModifiedAsync').mockResolvedValue(false);
    jest.spyOn(VersionMismatchFinderCommonVersions.prototype, 'saveIfModifiedAsync').mockResolvedValue(false);

    savedCatalogsByFilePath = new Map();
    jest
      .spyOn(PnpmOptionsConfiguration.prototype, 'updateGlobalCatalogsAsync')
      .mockImplementation(async function (
        this: PnpmOptionsConfiguration,
        catalogs: PnpmCatalogs | undefined
      ): Promise<void> {
        savedCatalogsByFilePath.set(this.jsonFilename!, TestUtilities.stripAnnotations(catalogs));
      });

    // Don't query the registry
    latestVersionByPackageName = new Map();
    jest.spyOn(InstallHelpers, 'ensureLocalPackageManagerAsync').mockResolvedValue(undefined);
    (
      jest.spyOn(Utilities, 'executeCommandAndCaptureOutputAsync') as unknown as jest.SpyInstance<
        Promise<string>,
        [IExecuteCommandAndCaptureOutputOptions]
      >
    ).mockImplementation(async ({ args }): Promise<string> => {
      // "view <name>@latest version" or "view <name> versions --json"
      const packageName: string = args[1].replace(/@latest$/, '');
      const latestVersion: string | undefined = latestVersionByPackageName.get(packageName);
      if (latestVersion === undefined) {
        throw new Error(`Unexpected registry query: ${args.join(' ')}`);
      }

      return args[2] === 'versions' ? JSON.stringify([latestVersion]) : `${latestVersion}\n`;
    });

    // Don't run "rush update"
    doInstallAsyncMock = jest.fn().mockResolvedValue(undefined);
    jest
      .spyOn(InstallManagerFactory, 'getInstallManagerAsync')
      .mockResolvedValue({ doInstallAsync: doInstallAsyncMock } as unknown as BaseInstallManager);
    jest.spyOn(PurgeManager.prototype, 'startDeleteAllAsync').mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function getProject(projectName: string): RushConfigurationProject {
    return rushConfiguration.getProjectByName(projectName)!;
  }

  function getVersionSpecifier(projectName: string, packageName: string): string | undefined {
    return getProject(projectName).packageJsonEditor.tryGetDependency(packageName)?.version;
  }

  function getDevVersionSpecifier(projectName: string, packageName: string): string | undefined {
    return getProject(projectName).packageJsonEditor.tryGetDevDependency(packageName)?.version;
  }

  function getCatalogs(subspace: Subspace = rushConfiguration.defaultSubspace): PnpmCatalogs {
    return getEffectivePnpmCatalogs(subspace, rushConfiguration)!;
  }

  function setPreferredVersion(
    packageName: string,
    version: string,
    subspace: Subspace = rushConfiguration.defaultSubspace
  ): void {
    // Avoid querying the registry for the version
    subspace.getCommonVersions().preferredVersions.set(packageName, version);
  }

  async function addAsync(
    projectNames: string[],
    packagesToAdd: (string | [string, string])[],
    { makeConsistent = false, dev = false, skipUpdate = true }: IAddOptions = {}
  ): Promise<void> {
    const options: IPackageJsonUpdaterRushAddOptions = {
      actionName: 'add',
      projects: projectNames.map(getProject),
      packagesToUpdate: packagesToAdd.map((packageToAdd) =>
        typeof packageToAdd === 'string'
          ? { packageName: packageToAdd, version: undefined, rangeStyle: SemVerStyle.Tilde }
          : { packageName: packageToAdd[0], version: packageToAdd[1], rangeStyle: SemVerStyle.Passthrough }
      ),
      updateOtherPackages: makeConsistent,
      devDependency: dev,
      peerDependency: false,
      skipUpdate,
      debugInstall: false,
      variant: undefined
    };
    await packageJsonUpdater.doRushUpdateAsync(options);
  }

  async function upgradeAsync(
    projectNames: string[],
    packagesToUpgrade: Pick<
      INpmCheckPackageSummary,
      'moduleName' | 'latest' | 'packageJson' | 'devDependency'
    >[],
    { makeConsistent = false }: IAddOptions = {}
  ): Promise<void> {
    await packageJsonUpdater.doRushUpgradeAsync({
      projects: projectNames.map(getProject),
      packagesToAdd: packagesToUpgrade.map(
        (summary) =>
          ({
            homepage: '',
            installed: summary.packageJson,
            notInstalled: false,
            mismatch: false,
            ...summary
          }) as INpmCheckPackageSummary
      ),
      updateOtherPackages: makeConsistent,
      skipUpdate: true,
      debugInstall: false,
      variant: undefined
    });
  }

  describe('"rush add" with PNPM catalogs', () => {
    beforeEach(() => {
      // Catalogs: default { react: ^18.0.0, semver: ^7.5.4 }, tools { typescript: ~5.3.0, eslint: ^8.50.0 }
      // a: react catalog:, semver catalog:; b: typescript catalog:tools (dev); c: none; d: semver catalog:;
      // e: eslint catalog:tools (dev)
      loadRepo('repoWithCatalogs');
    });

    it('references the default catalog when no version is specified', async () => {
      await addAsync(['c'], ['semver']);

      expect(getVersionSpecifier('c', 'semver')).toEqual('catalog:');
      expect(savedCatalogsByFilePath.size).toEqual(0);
      expect(terminalProvider.getWarningOutput()).toEqual('');
    });

    it('references the only catalog that has the package', async () => {
      await addAsync(['c'], ['typescript'], { dev: true });

      expect(getDevVersionSpecifier('c', 'typescript')).toEqual('catalog:tools');
      expect(getVersionSpecifier('c', 'typescript')).toBeUndefined();
    });

    it('prefers the catalog that other projects reference the package through', async () => {
      getCatalogs().default.typescript = '~5.4.0';

      await addAsync(['c'], ['typescript'], { dev: true });

      // "b" uses "catalog:tools"
      expect(getDevVersionSpecifier('c', 'typescript')).toEqual('catalog:tools');
    });

    it('prefers the default catalog when other projects do not reference the package', async () => {
      getCatalogs().default.zod = '^3.0.0';
      getCatalogs().tools.zod = '^3.1.0';

      await addAsync(['c'], ['zod']);

      expect(getVersionSpecifier('c', 'zod')).toEqual('catalog:');
    });

    it('assigns a version and prints a note when the catalog is ambiguous', async () => {
      const catalogs: PnpmCatalogs = getCatalogs();
      catalogs.x = { zod: '^3.0.0' };
      catalogs.y = { zod: '^3.1.0' };
      latestVersionByPackageName.set('zod', '3.23.8');

      await addAsync(['c'], ['zod']);

      expect(getVersionSpecifier('c', 'zod')).toEqual('~3.23.8');
      expect(terminalProvider.getOutput()).toContain(
        'Note: Rush could not choose between the PNPM catalogs "catalog:x" (^3.0.0), "catalog:y" (^3.1.0) for "zod", ' +
          'so the version "~3.23.8" is assigned instead of a catalog reference. ' +
          'To reference a catalog, specify "zod@catalog:<name>".'
      );
      expect(savedCatalogsByFilePath.size).toEqual(0);
    });

    it('references the catalog when the specified version matches the catalog entry', async () => {
      await addAsync(['c'], [['semver', '^7.5.4']]);

      expect(getVersionSpecifier('c', 'semver')).toEqual('catalog:');
      expect(savedCatalogsByFilePath.size).toEqual(0);
    });

    it('references the catalog when the version that is found matches the catalog entry', async () => {
      const catalogs: PnpmCatalogs = getCatalogs();
      catalogs.x = { zod: '^3.0.0' };
      catalogs.y = { zod: '~3.23.8' };
      latestVersionByPackageName.set('zod', '3.23.8');

      await addAsync(['c'], ['zod']);

      expect(getVersionSpecifier('c', 'zod')).toEqual('catalog:y');
    });

    it('assigns the specified version when it does not match the catalog entry', async () => {
      setPreferredVersion('semver', '^7.6.0');

      await addAsync(['c'], [['semver', '^7.6.0']]);

      expect(getVersionSpecifier('c', 'semver')).toEqual('^7.6.0');
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');
      expect(terminalProvider.getOutput()).toContain(
        'Note: "^7.6.0" for "semver" is different from the PNPM catalog entry "catalog:" (^7.5.4), ' +
          'so the version "^7.6.0" is assigned instead of a catalog reference. ' +
          'To reference a catalog, specify "semver@catalog:", ' +
          'or use the "--make-consistent" flag to update the catalog entry.'
      );
      expect(savedCatalogsByFilePath.size).toEqual(0);
    });

    it('updates the catalog entry when making versions consistent', async () => {
      setPreferredVersion('semver', '^7.6.0');

      await addAsync(['c'], [['semver', '^7.6.0']], { makeConsistent: true });

      expect(getVersionSpecifier('c', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');
      expect(Object.fromEntries(savedCatalogsByFilePath)).toEqual({
        [rushConfiguration.defaultSubspace.getPnpmConfigFilePath()]: {
          default: { react: '^18.0.0', semver: '^7.6.0' },
          tools: { typescript: '~5.3.0', eslint: '^8.50.0' }
        }
      });
      expect(terminalProvider.getOutput()).toContain('catalog: semver: ^7.5.4 -> ^7.6.0');
      expect(terminalProvider.getWarningOutput()).toEqual('');
    });

    it('updates projects that use a version when making versions consistent with a catalog', async () => {
      getProject('b').packageJsonEditor.addOrUpdateDependency('semver', '~7.0.0', DependencyType.Regular);

      await addAsync(['c'], [['semver', '^7.5.4']], { makeConsistent: true });

      expect(getVersionSpecifier('b', 'semver')).toEqual('^7.5.4');
      expect(getVersionSpecifier('c', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');
      expect(savedCatalogsByFilePath.size).toEqual(0);
      expect(terminalProvider.getWarningOutput()).toEqual('');
    });

    it('updates catalog entries that other projects reference when making versions consistent', async () => {
      // "e" uses "eslint": "catalog:tools"
      getProject('c').packageJsonEditor.addOrUpdateDependency('eslint', '^8.0.0', DependencyType.Dev);
      getCatalogs().default.eslint = '^8.0.0';

      await addAsync(['c'], [['eslint', '^8.0.0']], { dev: true, makeConsistent: true });

      expect(getDevVersionSpecifier('c', 'eslint')).toEqual('catalog:');
      expect(getDevVersionSpecifier('e', 'eslint')).toEqual('catalog:tools');
      expect(
        TestUtilities.stripAnnotations(
          savedCatalogsByFilePath.get(rushConfiguration.defaultSubspace.getPnpmConfigFilePath())
        )
      ).toMatchObject({
        default: { eslint: '^8.0.0' },
        tools: { eslint: '^8.0.0' }
      });
    });

    it.each([
      ['semver', 'catalog:', 'catalog:', false],
      ['semver', 'catalog:default', 'catalog:', false],
      ['typescript', 'catalog:tools', 'catalog:tools', true]
    ])(
      'writes the explicitly specified catalog reference %s@%s',
      async (packageName: string, versionSpecifier: string, expected: string, dev: boolean) => {
        await addAsync(['c'], [[packageName, versionSpecifier]], { dev });

        expect(
          dev ? getDevVersionSpecifier('c', packageName) : getVersionSpecifier('c', packageName)
        ).toEqual(expected);
        expect(savedCatalogsByFilePath.size).toEqual(0);
      }
    );

    it('replaces a version with an explicitly specified catalog reference', async () => {
      getProject('c').packageJsonEditor.addOrUpdateDependency('semver', '~7.0.0', DependencyType.Regular);

      await addAsync(['c'], [['semver', 'catalog:']]);

      expect(getVersionSpecifier('c', 'semver')).toEqual('catalog:');
    });

    it('reports an explicitly specified catalog that does not exist', async () => {
      await expect(addAsync(['c'], [['semver', 'catalog:missing']])).rejects.toThrow(
        'The PNPM catalog "missing" that "semver@catalog:missing" references is not defined'
      );
      expect(getVersionSpecifier('c', 'semver')).toBeUndefined();
    });

    it('reports an explicitly specified catalog that does not have the package', async () => {
      await expect(addAsync(['c'], [['semver', 'catalog:tools']])).rejects.toThrow(
        'does not have an entry for "semver"'
      );
      expect(getVersionSpecifier('c', 'semver')).toBeUndefined();
    });

    it('reports an explicitly specified catalog when the package manager is not PNPM', async () => {
      Object.defineProperty(rushConfiguration, 'isPnpm', { value: false });

      await expect(addAsync(['c'], [['semver', 'catalog:']])).rejects.toThrow(
        'catalogs are only supported when the package manager is PNPM'
      );
    });

    it('keeps the catalog reference of the project when the version matches', async () => {
      getProject('a').packageJsonEditor.addOrUpdateDependency(
        'semver',
        'catalog:default',
        DependencyType.Regular
      );

      await addAsync(['a'], [['semver', '^7.5.4']]);
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:default');

      await addAsync(['a'], ['semver']);
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:default');
    });

    it('prefers the catalog that the project already references', async () => {
      getCatalogs().tools.semver = '^7.5.4';
      getProject('a').packageJsonEditor.addOrUpdateDependency(
        'semver',
        'catalog:tools',
        DependencyType.Regular
      );

      await addAsync(['a'], ['semver']);

      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:tools');
    });

    it('does not replace the catalog reference of the project with a different version', async () => {
      setPreferredVersion('semver', '^7.6.0');

      await expect(addAsync(['a'], [['semver', '^7.6.0']])).rejects.toThrow(
        '"a" references "semver" through the PNPM catalog reference "catalog:", which is "^7.5.4". ' +
          'Rush will not replace the catalog reference with "^7.6.0".'
      );
      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(savedCatalogsByFilePath.size).toEqual(0);
    });

    it('updates the catalog entry that the project references when making versions consistent', async () => {
      setPreferredVersion('eslint', '^9.0.0');

      await addAsync(['e'], [['eslint', '^9.0.0']], { dev: true, makeConsistent: true });

      expect(getDevVersionSpecifier('e', 'eslint')).toEqual('catalog:tools');
      expect(savedCatalogsByFilePath.get(rushConfiguration.defaultSubspace.getPnpmConfigFilePath())).toEqual({
        default: { react: '^18.0.0', semver: '^7.5.4' },
        tools: { typescript: '~5.3.0', eslint: '^9.0.0' }
      });
    });
  });

  describe('"rush add" with subspaces that share a pnpm-config.json file', () => {
    beforeEach(() => {
      // common/config/rush/pnpm-config.json: default { react: ^18.0.0, foo: ~2.0.0 }, tools { typescript: ~5.3.0 }
      // own-config-subspace: default { react: ^17.0.0 }
      // default subspace: a (react catalog:), b (typescript catalog:tools)
      // other-subspace: c (foo catalog:), d (lodash ^4.17.0)
      // own-config-subspace: e (react catalog:)
      loadRepo('repoWithSubspacesCommonCatalogs');
    });

    it('reports the other subspaces that use the updated catalogs', async () => {
      setPreferredVersion('react', '^18.3.0');

      await addAsync(['b'], [['react', '^18.3.0']], { makeConsistent: true, skipUpdate: false });

      expect(getVersionSpecifier('b', 'react')).toEqual('catalog:');
      expect(getVersionSpecifier('a', 'react')).toEqual('catalog:');
      const commonPnpmConfigFilePath: string = `${rushConfiguration.commonRushConfigFolder}/pnpm-config.json`;
      expect(Object.fromEntries(savedCatalogsByFilePath)).toEqual({
        [commonPnpmConfigFilePath]: {
          default: { react: '^18.3.0', foo: '~2.0.0' },
          tools: { typescript: '~5.3.0' }
        }
      });
      expect(doInstallAsyncMock).toHaveBeenCalledTimes(1);

      const warnings: string = terminalProvider.getWarningOutput();
      expect(warnings).toContain('rush update --subspace other-subspace');
      expect(warnings).not.toContain('rush update --subspace default');
      expect(warnings).not.toContain('own-config-subspace');
    });

    it('updates the catalogs of a subspace with its own pnpm-config.json file', async () => {
      const ownConfigSubspace: Subspace = rushConfiguration.getSubspace('own-config-subspace');
      setPreferredVersion('react', '^17.0.2', ownConfigSubspace);

      await addAsync(['e'], [['react', '^17.0.2']], { makeConsistent: true, skipUpdate: false });

      expect(getVersionSpecifier('e', 'react')).toEqual('catalog:');
      expect(Object.fromEntries(savedCatalogsByFilePath)).toEqual({
        [ownConfigSubspace.getPnpmConfigFilePath()]: { default: { react: '^17.0.2' } }
      });
      expect(terminalProvider.getWarningOutput()).toEqual('');
    });

    it('reports the subspaces to update when "rush update" is skipped', async () => {
      setPreferredVersion('react', '^18.3.0');

      await addAsync(['b'], [['react', '^18.3.0']], { makeConsistent: true });

      expect(doInstallAsyncMock).not.toHaveBeenCalled();
      const warnings: string = terminalProvider.getWarningOutput();
      expect(warnings).toContain('rush update --subspace default');
      expect(warnings).toContain('rush update --subspace other-subspace');
    });

    it('enforces consistent versions when the catalog entry is different', async () => {
      setPreferredVersion('react', '^18.3.0');

      await expect(addAsync(['b'], [['react', '^18.3.0']])).rejects.toThrow(
        "Adding 'react@^18.3.0' causes mismatched dependencies."
      );
      expect(savedCatalogsByFilePath.size).toEqual(0);
    });
  });

  describe('"rush upgrade-interactive" with PNPM catalogs', () => {
    it('updates the catalog entry instead of the catalog reference', async () => {
      loadRepo('repoWithCatalogs');
      latestVersionByPackageName.set('semver', '7.6.3');

      await upgradeAsync(
        ['a'],
        [{ moduleName: 'semver', latest: '7.6.3', packageJson: '^7.5.4', devDependency: false }]
      );

      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');
      expect(savedCatalogsByFilePath.get(rushConfiguration.defaultSubspace.getPnpmConfigFilePath())).toEqual({
        default: { react: '^18.0.0', semver: '^7.6.3' },
        tools: { typescript: '~5.3.0', eslint: '^8.50.0' }
      });
      expect(terminalProvider.getOutput()).toContain(
        '"a" references "semver" through the PNPM catalog "catalog:", so the catalog entry will be updated'
      );
    });

    it('updates the catalog entry of a dev dependency', async () => {
      loadRepo('repoWithCatalogs');
      latestVersionByPackageName.set('typescript', '5.4.5');

      await upgradeAsync(
        ['b'],
        [{ moduleName: 'typescript', latest: '5.4.5', packageJson: '~5.3.0', devDependency: true }]
      );

      expect(getDevVersionSpecifier('b', 'typescript')).toEqual('catalog:tools');
      expect(
        savedCatalogsByFilePath.get(rushConfiguration.defaultSubspace.getPnpmConfigFilePath())?.tools
      ).toEqual({ typescript: '~5.4.5', eslint: '^8.50.0' });
    });

    it('updates the version of projects that do not reference a catalog', async () => {
      loadRepo('repoWithCatalogs');
      latestVersionByPackageName.set('semver', '7.6.3');
      getProject('b').packageJsonEditor.addOrUpdateDependency('semver', '~7.0.0', DependencyType.Regular);

      await upgradeAsync(
        ['a', 'b'],
        [{ moduleName: 'semver', latest: '7.6.3', packageJson: '^7.5.4', devDependency: false }]
      );

      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('b', 'semver')).toEqual('^7.6.3');
    });

    it('updates the other projects when making versions consistent', async () => {
      loadRepo('repoWithCatalogs');
      latestVersionByPackageName.set('semver', '7.6.3');
      getProject('c').packageJsonEditor.addOrUpdateDependency('semver', '~7.0.0', DependencyType.Regular);

      await upgradeAsync(
        ['a'],
        [{ moduleName: 'semver', latest: '7.6.3', packageJson: '^7.5.4', devDependency: false }],
        { makeConsistent: true }
      );

      expect(getVersionSpecifier('a', 'semver')).toEqual('catalog:');
      expect(getVersionSpecifier('c', 'semver')).toEqual('^7.6.3');
      expect(getVersionSpecifier('d', 'semver')).toEqual('catalog:');
      expect(
        savedCatalogsByFilePath.get(rushConfiguration.defaultSubspace.getPnpmConfigFilePath())?.default
      ).toEqual({ react: '^18.0.0', semver: '^7.6.3' });
    });

    it('enforces consistent versions after updating the catalog entry', async () => {
      loadRepo('repoWithSubspacesCommonCatalogs');
      latestVersionByPackageName.set('typescript', '5.4.5');

      // "b" is the only project that uses typescript
      await upgradeAsync(
        ['b'],
        [{ moduleName: 'typescript', latest: '5.4.5', packageJson: '~5.3.0', devDependency: true }]
      );
      expect(getDevVersionSpecifier('b', 'typescript')).toEqual('catalog:tools');

      loadRepo('repoWithSubspacesCommonCatalogs');
      getProject('a').packageJsonEditor.addOrUpdateDependency('typescript', '~5.3.0', DependencyType.Dev);
      savedCatalogsByFilePath.clear();

      await expect(
        upgradeAsync(
          ['b'],
          [{ moduleName: 'typescript', latest: '5.4.5', packageJson: '~5.3.0', devDependency: true }]
        )
      ).rejects.toThrow("Adding 'typescript@~5.4.5' causes mismatched dependencies.");
      expect(savedCatalogsByFilePath.size).toEqual(0);
    });
  });
});
