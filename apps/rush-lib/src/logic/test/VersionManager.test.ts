// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { IPackageJson } from '@microsoft/node-core-library';

import { BumpType } from '../../api/VersionPolicy';
import { ChangeFile } from '../../api/ChangeFile';
import { ChangeType, IChangeInfo } from '../../api/ChangeManagement';
import { RushConfiguration } from '../../api/RushConfiguration';
import { VersionManager } from '../VersionManager';

function _getChanges(changeFiles: Map<string, ChangeFile>,
  packageName: string): IChangeInfo[] | undefined {
  const changeFile: ChangeFile | undefined = changeFiles.get(packageName);
  if (!changeFile) {
    return undefined;
  }
  return changeFile.getChanges(packageName);
}

describe('VersionManager', () => {
  const rushJsonFile: string = path.resolve(__dirname, 'repo', 'rush.json');
  const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushJsonFile);
  let versionManager: VersionManager;

  beforeEach(() => {
    versionManager = new VersionManager(rushConfiguration, 'test@microsoft.com',
      rushConfiguration.versionPolicyConfiguration);
  });

  /* tslint:disable:no-string-literal */
  describe('ensure', () => {
    it('fixes lock step versions', () => {
      versionManager.ensure('testPolicy1');
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const expectedVersion: string = '10.10.0';
      expect(updatedPackages.size).toEqual(6);
      expect(updatedPackages.get('a')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('b')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('b')!.dependencies!['a']).toEqual(`~${expectedVersion}`);
      expect(updatedPackages.get('c')!.version).toEqual('3.1.1');
      expect(updatedPackages.get('c')!.dependencies!['b']).toEqual(`>=10.10.0 <11.0.0`);
      expect(updatedPackages.get('d')!.version).toEqual('4.1.1');
      expect(updatedPackages.get('d')!.dependencies!['b']).toEqual(`>=10.10.0 <11.0.0`);
      expect(updatedPackages.get('f')!.version).toEqual('1.0.0');
      expect(updatedPackages.get('f')!.dependencies!['a']).toEqual(`~10.10.0`);
      expect(updatedPackages.get('g')!.devDependencies!['a']).toEqual(`~10.10.0`);

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;
      expect(changeFiles.size).toEqual(4);
      expect(_getChanges(changeFiles, 'a')!.length).toEqual(1);
      expect(_getChanges(changeFiles, 'a')![0].changeType).toEqual(ChangeType.none);
      expect(_getChanges(changeFiles, 'b')!.length).toEqual(1);
      expect(_getChanges(changeFiles, 'b')![0].changeType).toEqual(ChangeType.none);
      expect(_getChanges(changeFiles, 'c')!.length).toEqual(2);
      expect(_getChanges(changeFiles, 'c')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'c')![1].changeType).toEqual(ChangeType.dependency);
      expect(_getChanges(changeFiles, 'd')!.length).toEqual(2);
      expect(_getChanges(changeFiles, 'd')![0].changeType).toEqual(ChangeType.patch);
      expect(_getChanges(changeFiles, 'd')![1].changeType).toEqual(ChangeType.dependency);
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

  describe('bump', () => {
    it('bumps to prerelease version', () => {
      versionManager.bump('testPolicy1', BumpType.prerelease, 'dev', false);
      const updatedPackages: Map<string, IPackageJson> = versionManager.updatedProjects;
      const expectedVersion: string = '10.10.1-dev.0';

      const changeFiles: Map<string, ChangeFile> = versionManager.changeFiles;

      expect(updatedPackages.get('a')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('b')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('e')!.version).toEqual(expectedVersion);
      expect(updatedPackages.get('g')!.devDependencies!['a']).toEqual(`~${expectedVersion}`);
      expect(_getChanges(changeFiles, 'a')).not.toBeDefined();
      expect(_getChanges(changeFiles, 'b')).not.toBeDefined();
    });
  });
  /* tslint:enable:no-string-literal */
});
