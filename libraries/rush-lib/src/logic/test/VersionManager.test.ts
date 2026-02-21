// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '@rushstack/node-core-library';

import { BumpType } from '../../api/VersionPolicy.ts';
import type { ChangeFile } from '../../api/ChangeFile.ts';
import { ChangeType, type IChangeInfo } from '../../api/ChangeManagement.ts';
import { RushConfiguration } from '../../api/RushConfiguration.ts';
import { VersionManager } from '../VersionManager.ts';

function _getChanges(changeFiles: Map<string, ChangeFile>, packageName: string): IChangeInfo[] | undefined {
  const changeFile: ChangeFile | undefined = changeFiles.get(packageName);
  if (!changeFile) {
    return undefined;
  }
  return changeFile.getChanges(packageName);
}

describe(VersionManager.name, () => {
  const rushJsonFile: string = `${__dirname}/repo/rush.json`;
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager(
      rushConfiguration,
      'test@microsoft.com',
      rushConfiguration.versionPolicyConfiguration
    );
  });

  /* eslint-disable dot-notation */
  describe(VersionManager.prototype.ensure.name, () => {
    it('fixes lock step versions', () => {
      versionManager.ensure('testPolicy1');
      versionManager.ensure('lockStepWithoutNextBump');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;

      expect(updatedPackages.size).toEqual(7);
      expect(updatedPackages.get('a')!.version).toEqual('10.10.0');
      expect(updatedPackages.get('b')!.version).toEqual('10.10.0');
      expect(updatedPackages.get('b')!.dependencies!['a']).toEqual('~10.10.0');
      expect(updatedPackages.get('c')!.version).toEqual('3.1.1');
      expect(updatedPackages.get('c')!.dependencies!['b']).toEqual(`>=10.10.0 <11.0.0`);
      expect(updatedPackages.get('d')!.version).toEqual('4.1.1');
      expect(updatedPackages.get('d')!.dependencies!['b']).toEqual(`>=10.10.0 <11.0.0`);
      expect(updatedPackages.get('f')!.version).toEqual('1.0.0');
      expect(updatedPackages.get('f')!.dependencies!['a']).toEqual(`~10.10.0`);
      expect(updatedPackages.get('f')!.dependencies!['h']).toEqual(`^1.2.3`);
      expect(updatedPackages.get('g')!.devDependencies!['a']).toEqual(`~10.10.0`);
      expect(updatedPackages.get('h')!.version).toEqual('1.2.3');
      expect(updatedPackages.get('h')!.dependencies!['a']).toEqual(`~10.10.0`);

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;
      expect(changeFiles.size).toEqual(5);
      expect(_getChanges(changeFiles, 'a')!).toHaveLength(1);
      expect(_getChanges(changeFiles, 'a')![0].changeType).toEqual(ChangeType.none);
      expect(_getChanges(changeFiles, 'b')!).toHaveLength(1);
      expect(_getChanges(changeFiles, 'b')![0].changeType).toEqual(ChangeType.none);
      expect(_getChanges(changeFiles, 'c')!).toHaveLength(2);
      expect(_getChanges(changeFiles, 'c')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'c')![1].changeType).toEqual(ChangeType.dependency);
      expect(_getChanges(changeFiles, 'd')!).toHaveLength(2);
      expect(_getChanges(changeFiles, 'd')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'd')![1].changeType).toEqual(ChangeType.dependency);
      expect(_getChanges(changeFiles, 'h')!).toHaveLength(2);
      expect(_getChanges(changeFiles, 'h')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'h')![1].changeType).toEqual(ChangeType.dependency);
    });

    it('fixes major version for individual version policy', () => {
      versionManager.ensure('testPolicy2');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      expect(updatedPackages.size).toEqual(2);
      expect(updatedPackages.get('c')!.version).toEqual('5.0.0');
      expect(updatedPackages.get('c')!.dependencies!['b']).toEqual(`>=2.0.0 <3.0.0`);
      expect(updatedPackages.get('e')!.version).toEqual('10.10.0');
      expect(updatedPackages.get('e')!.dependencies!['c']).toEqual('~5.0.0');
    });

    it('does not change packageJson if not needed by individual version policy', () => {
      versionManager.ensure('testPolicy3');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      expect(updatedPackages.size).toEqual(0);
    });
  });

  describe(VersionManager.prototype.bumpAsync.name, () => {
    it('bumps a lockStepPolicy to prerelease version', async () => {
      await versionManager.bumpAsync('testPolicy1', BumpType.prerelease, 'dev', false);
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;

      const expectedVersion: string = '10.10.1-dev.0';
      expect(updatedPackages.get('a')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('b')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('e')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('g')!.devDependencies!['a']).toEqual(`~${expectedVersion}`);
      expect(_getChanges(changeFiles, 'a')).not.toBeDefined();
      expect(_getChanges(changeFiles, 'b')).not.toBeDefined();
    });

    it('bumps a lockStepPolicy without bumpType to prerelease version', async () => {
      await versionManager.bumpAsync('lockStepWithoutNextBump', BumpType.prerelease, 'dev', false);
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;

      const expectedVersion: string = '1.2.4-dev.0';
      expect(updatedPackages.get('h')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('f')!.dependencies!['h']).toEqual(`^${expectedVersion}`);
      expect(_getChanges(changeFiles, 'h')).not.toBeDefined();
    });
  });
  /* eslint-enable dot-notation */
});

describe(`${VersionManager.name} (workspace)`, () => {
  const rushJsonFile: string = `${__dirname}/workspaceRepo/rush.json`;
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager(
      rushConfiguration,
      'test@microsoft.com',
      rushConfiguration.versionPolicyConfiguration
    );
  });

  /* eslint-disable dot-notation */
  describe(VersionManager.prototype.ensure.name, () => {
    it('fixes lock step versions', () => {
      versionManager.ensure('testPolicy1');
      versionManager.ensure('lockStepWithoutNextBump');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;

      expect(updatedPackages.size).toEqual(7);
      expect(updatedPackages.get('a')!.version).toEqual('10.10.0');
      expect(updatedPackages.get('b')!.version).toEqual('10.10.0');
      expect(updatedPackages.get('b')!.dependencies!['a']).toEqual(`workspace:~10.10.0`);
      expect(updatedPackages.get('c')!.version).toEqual('3.1.1');
      expect(updatedPackages.get('c')!.dependencies!['b']).toEqual(`workspace:>=10.10.0 <11.0.0`);
      expect(updatedPackages.get('d')!.version).toEqual('4.1.1');
      expect(updatedPackages.get('d')!.dependencies!['b']).toEqual(`workspace:>=10.10.0 <11.0.0`);
      expect(updatedPackages.get('f')!.version).toEqual('1.0.0');
      expect(updatedPackages.get('f')!.dependencies!['a']).toEqual(`workspace:~10.10.0`);
      expect(updatedPackages.get('f')!.dependencies!['h']).toEqual(`workspace:^1.2.3`);
      expect(updatedPackages.get('g')!.devDependencies!['a']).toEqual(`workspace:~10.10.0`);
      expect(updatedPackages.get('h')!.version).toEqual('1.2.3');
      expect(updatedPackages.get('h')!.dependencies!['a']).toEqual(`workspace:~10.10.0`);

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;
      expect(changeFiles.size).toEqual(5);
      expect(_getChanges(changeFiles, 'a')!).toHaveLength(1);
      expect(_getChanges(changeFiles, 'a')![0].changeType).toEqual(ChangeType.none);
      expect(_getChanges(changeFiles, 'b')!).toHaveLength(1);
      expect(_getChanges(changeFiles, 'b')![0].changeType).toEqual(ChangeType.none);
      expect(_getChanges(changeFiles, 'c')!).toHaveLength(2);
      expect(_getChanges(changeFiles, 'c')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'c')![1].changeType).toEqual(ChangeType.dependency);
      expect(_getChanges(changeFiles, 'd')!).toHaveLength(2);
      expect(_getChanges(changeFiles, 'd')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'd')![1].changeType).toEqual(ChangeType.dependency);
      expect(_getChanges(changeFiles, 'h')!).toHaveLength(2);
      expect(_getChanges(changeFiles, 'h')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'h')![1].changeType).toEqual(ChangeType.dependency);
    });

    it('fixes major version for individual version policy', () => {
      versionManager.ensure('testPolicy2');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      expect(updatedPackages.size).toEqual(2);
      expect(updatedPackages.get('c')!.version).toEqual('5.0.0');
      expect(updatedPackages.get('c')!.dependencies!['b']).toEqual(`workspace:>=2.0.0 <3.0.0`);
      expect(updatedPackages.get('e')!.version).toEqual('10.10.0');
      expect(updatedPackages.get('e')!.dependencies!['c']).toEqual('workspace:~5.0.0');
    });

    it('does not change packageJson if not needed by individual version policy', () => {
      versionManager.ensure('testPolicy3');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      expect(updatedPackages.size).toEqual(0);
    });
  });

  describe(VersionManager.prototype.bumpAsync.name, () => {
    it('bumps to prerelease version', async () => {
      await versionManager.bumpAsync('testPolicy1', BumpType.prerelease, 'dev', false);
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const expectedVersion: string = '10.10.1-dev.0';

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;

      expect(updatedPackages.get('a')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('b')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('e')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('g')!.devDependencies!['a']).toEqual(`workspace:~${expectedVersion}`);
      expect(_getChanges(changeFiles, 'a')).not.toBeDefined();
      expect(_getChanges(changeFiles, 'b')).not.toBeDefined();
    });
  });
  /* eslint-enable dot-notation */
});
