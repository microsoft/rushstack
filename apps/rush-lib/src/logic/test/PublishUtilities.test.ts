// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { IChangeInfo, ChangeType } from '../../api/ChangeManagement';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PublishUtilities, IChangeRequests } from '../PublishUtilities';
import { ChangeFiles } from '../ChangeFiles';

/* eslint-disable dot-notation */

describe('findChangeRequests', () => {
  let packagesRushConfiguration: RushConfiguration;
  let repoRushConfiguration: RushConfiguration;

  beforeEach(() => {
    packagesRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, 'packages', 'rush.json')
    );
    repoRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, 'repo', 'rush.json')
    );
  });

  it('returns no changes in an empty change folder', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'noChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(0);
    expect(allChanges.versionPolicies.size).toEqual(0);
  });

  it('returns 1 change when changing a leaf package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'leafChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(1);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('returns 5 changes when patching a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootPatchChange'))
    );
    expect(allChanges.changeInfoByProjectName.size).toEqual(5);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.dependency);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.0');
  });

  it('returns 8 changes when hotfixing a root package', () => {
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      packagesRushConfiguration.projectsByName,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.hotfix);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('d')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('returns 8 changes when major bumping a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootMajorChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('i')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.0.1');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.0.1');
  });

  it('returns 2 changes when bumping cyclic dependencies', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'cyclicDeps'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(2);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-1')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-2')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-1')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-2')!.changeType).toEqual(ChangeType.patch);
  });

  it('returns error when mixing hotfix and non-hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    expect(
      PublishUtilities.findChangeRequests.bind(
        PublishUtilities,
        allPackages,
        packagesRushConfiguration,
        new ChangeFiles(path.join(__dirname, 'hotfixWithPatchChanges'))
      )
    ).toThrow('Cannot apply hotfix alongside patch change on same package');
  });

  it('returns error when adding hotfix with config disabled', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    // Overload hotfixChangeEnabled function
    packagesRushConfiguration['_hotfixChangeEnabled'] = false;

    expect(
      PublishUtilities.findChangeRequests.bind(
        PublishUtilities,
        allPackages,
        packagesRushConfiguration,
        new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
      )
    ).toThrow('Cannot add hotfix change; hotfixChangeEnabled is false in configuration.');
  });

  it('can resolve multiple changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('i')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.0.1');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.0.1');
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'orderedChanges'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('i')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.0.1');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.0.1');
  });

  it('can resolve multiple hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleHotfixChanges'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.hotfix);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('d')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('can update an explicit dependency', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'explicitVersionChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(2);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('can exclude lock step projects', () => {
    const allPackages: Map<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'repo', 'changes')),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('3.1.2');
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('d')!.newVersion).toEqual('4.1.2');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual(
      allPackages.get('e')!.packageJson.version
    );
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.none);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.2.4');
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.2.4');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.2.4');
  });
});

describe('sortChangeRequests', () => {
  let rushConfiguration: RushConfiguration;

  beforeEach(() => {
    rushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, 'packages', 'rush.json')
    );
  });

  it('can return a sorted array of the change requests to be published in the correct order', () => {
    const allPackages: Map<string, RushConfigurationProject> = rushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      rushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );
    const orderedChanges: IChangeInfo[] = PublishUtilities.sortChangeRequests(
      allChanges.changeInfoByProjectName
    );

    expect(orderedChanges).toHaveLength(8);
    expect(orderedChanges[0].packageName).toEqual('a');
    expect(orderedChanges[1].packageName).toEqual('i');
    expect(orderedChanges[2].packageName).toEqual('b');
    expect(orderedChanges[3].packageName).toEqual('e');
    expect(orderedChanges[4].packageName).toEqual('g');
    expect(orderedChanges[5].packageName).toEqual('h');
    expect(orderedChanges[6].packageName).toEqual('c');
    expect(orderedChanges[7].packageName).toEqual('f');
  });
});

describe('isRangeDependency', () => {
  it('can test ranges', () => {
    expect(PublishUtilities.isRangeDependency('>=1.0.0 <2.0.0')).toEqual(true);
    expect(PublishUtilities.isRangeDependency('>=1.0.0-pr.1 <2.0.0')).toEqual(true);
    expect(PublishUtilities.isRangeDependency('1.0.0')).toEqual(false);
    expect(PublishUtilities.isRangeDependency('^1.0.0')).toEqual(false);
    expect(PublishUtilities.isRangeDependency('~1.0.0')).toEqual(false);
  });
});

describe('getNewDependencyVersion', () => {
  it('can update dependency versions', () => {
    const dependencies: { [key: string]: string } = {
      a: '~1.0.0',
      b: '^1.0.0',
      c: '>=1.0.0 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0')).toEqual('~1.1.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0')).toEqual('^1.2.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0')).toEqual('>=1.3.0 <2.0.0');
  });

  it('can update dependency versions with prereleases', () => {
    const dependencies: { [key: string]: string } = {
      a: '~1.0.0-pr.1',
      b: '^1.0.0-pr.1',
      c: '>=1.0.0-pr.1 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0-pr.1')).toEqual('~1.1.0-pr.1');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0-pr.2')).toEqual('^1.2.0-pr.2');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0-pr.3')).toEqual(
      '>=1.3.0-pr.3 <2.0.0'
    );
  });

  it('can update to prerelease', () => {
    const dependencies: { [key: string]: string } = {
      a: '~1.0.0',
      b: '^1.0.0',
      c: '>=1.0.0 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.0.0-hotfix.0')).toEqual(
      '~1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.0.0-hotfix.0')).toEqual(
      '^1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.0.0-hotfix.0')).toEqual(
      '>=1.0.0-hotfix.0 <2.0.0'
    );
  });
});

describe('findWorkspaceChangeRequests', () => {
  let packagesRushConfiguration: RushConfiguration;
  let repoRushConfiguration: RushConfiguration;

  beforeEach(() => {
    packagesRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, 'workspacePackages', 'rush.json')
    );
    repoRushConfiguration = RushConfiguration.loadFromConfigurationFile(
      path.resolve(__dirname, 'workspaceRepo', 'rush.json')
    );
  });

  it('returns no changes in an empty change folder', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'noChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(0);
    expect(allChanges.versionPolicies.size).toEqual(0);
  });

  it('returns 1 change when changing a leaf package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'leafChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(1);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('returns 5 changes when patching a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootPatchChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(5);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.dependency);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.0');
  });

  it('returns 8 changes when hotfixing a root package', () => {
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      packagesRushConfiguration.projectsByName,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.hotfix);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('d')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('returns 8 changes when major bumping a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootMajorChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('i')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.0.1');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.0.1');
  });

  it('returns 2 changes when bumping cyclic dependencies', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'cyclicDeps'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(2);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-1')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-2')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-1')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('cyclic-dep-2')!.changeType).toEqual(ChangeType.patch);
  });

  it('returns error when mixing hotfix and non-hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    expect(
      PublishUtilities.findChangeRequests.bind(
        PublishUtilities,
        allPackages,
        packagesRushConfiguration,
        new ChangeFiles(path.join(__dirname, 'hotfixWithPatchChanges'))
      )
    ).toThrow('Cannot apply hotfix alongside patch change on same package');
  });

  it('returns error when adding hotfix with config disabled', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    // Overload hotfixChangeEnabled function
    packagesRushConfiguration['_hotfixChangeEnabled'] = false;

    expect(
      PublishUtilities.findChangeRequests.bind(
        PublishUtilities,
        allPackages,
        packagesRushConfiguration,
        new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
      )
    ).toThrow('Cannot add hotfix change; hotfixChangeEnabled is false in configuration.');
  });

  it('can resolve multiple changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('i')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.0.1');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.0.1');
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'orderedChanges'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('i')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.major);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.dependency);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.1');
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.0.1');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.0.1');
  });

  it('can resolve multiple hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleHotfixChanges'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('a')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('b')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('e')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('f')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('g')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('h')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('a')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('b')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('e')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('g')!.changeType).toEqual(ChangeType.hotfix);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.hotfix);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('d')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('f')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('g')!.newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('can update an explicit dependency', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'explicitVersionChange'))
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(2);
    expect(allChanges.versionPolicies.size).toEqual(0);

    expect(allChanges.changeInfoByProjectName.get('c')).not.toBeUndefined();
    expect(allChanges.changeInfoByProjectName.get('d')).not.toBeUndefined();

    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.patch);
  });

  it('can exclude lock step projects', () => {
    const allPackages: Map<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IChangeRequests = PublishUtilities.findChangeRequests(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'repo', 'changes')),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );

    expect(allChanges.changeInfoByProjectName.size).toEqual(8);
    expect(allChanges.versionPolicies.size).toEqual(1);

    expect(allChanges.changeInfoByProjectName.get('a')!.newVersion).toEqual('1.0.0');
    expect(allChanges.changeInfoByProjectName.get('b')!.newVersion).toEqual('2.0.0');
    expect(allChanges.changeInfoByProjectName.get('c')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('c')!.newVersion).toEqual('3.1.2');
    expect(allChanges.changeInfoByProjectName.get('d')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('d')!.newVersion).toEqual('4.1.2');
    expect(allChanges.changeInfoByProjectName.get('e')!.newVersion).toEqual(
      allPackages.get('e')!.packageJson.version
    );
    expect(allChanges.changeInfoByProjectName.get('f')!.changeType).toEqual(ChangeType.none);
    expect(allChanges.changeInfoByProjectName.get('h')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('h')!.newVersion).toEqual('1.2.4');
    expect(allChanges.changeInfoByProjectName.get('i')!.changeType).toEqual(ChangeType.patch);
    expect(allChanges.changeInfoByProjectName.get('i')!.newVersion).toEqual('1.2.4');

    expect(allChanges.versionPolicies.get('lockStepWithoutNextBump')!.format()).toEqual('1.2.4');
  });
});

describe('getNewWorkspaceDependencyVersion', () => {
  it('can update dependency versions', () => {
    const dependencies: { [key: string]: string } = {
      a: 'workspace:~1.0.0',
      b: 'workspace:^1.0.0',
      c: 'workspace:>=1.0.0 <2.0.0',
      d: 'workspace:*'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0')).toEqual('workspace:~1.1.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0')).toEqual('workspace:^1.2.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0')).toEqual(
      'workspace:>=1.3.0 <2.0.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'd', '1.4.0')).toEqual('workspace:*');
  });

  it('can update dependency versions with prereleases', () => {
    const dependencies: { [key: string]: string } = {
      a: 'workspace:~1.0.0-pr.1',
      b: 'workspace:^1.0.0-pr.1',
      c: 'workspace:>=1.0.0-pr.1 <2.0.0',
      d: 'workspace:*'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.1.0-pr.1')).toEqual(
      'workspace:~1.1.0-pr.1'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.2.0-pr.2')).toEqual(
      'workspace:^1.2.0-pr.2'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.3.0-pr.3')).toEqual(
      'workspace:>=1.3.0-pr.3 <2.0.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'd', '1.3.0-pr.3')).toEqual('workspace:*');
  });

  it('can update to prerelease', () => {
    const dependencies: { [key: string]: string } = {
      a: 'workspace:~1.0.0',
      b: 'workspace:^1.0.0',
      c: 'workspace:>=1.0.0 <2.0.0',
      d: 'workspace:*'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'a', '1.0.0-hotfix.0')).toEqual(
      'workspace:~1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'b', '1.0.0-hotfix.0')).toEqual(
      'workspace:^1.0.0-hotfix.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'c', '1.0.0-hotfix.0')).toEqual(
      'workspace:>=1.0.0-hotfix.0 <2.0.0'
    );
    expect(PublishUtilities.getNewDependencyVersion(dependencies, 'd', '1.0.0-hotfix.0')).toEqual(
      'workspace:*'
    );
  });
});
