// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { IChangeInfo, ChangeType } from '../../api/ChangeManagement';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PublishUtilities, IChangeInfoHash, IAllChanges } from '../PublishUtilities';
import { ChangeFiles } from '../ChangeFiles';
import { SemVer } from 'semver';

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
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'noChange'))
    );

    expect(Object.keys(allChanges.packages)).toHaveLength(0);
    expect(Object.keys(allChanges.versionPolicies)).toHaveLength(0);
  });

  it('returns 1 change when changing a leaf package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'leafChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;

    expect(Object.keys(packageChanges)).toHaveLength(1);
    expect(Object.keys(allChanges.versionPolicies)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges['d'].changeType).toEqual(ChangeType.patch);
  });

  it('returns 5 changes when patching a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootPatchChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(5);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.dependency);

    expect(packageChanges['a'].newVersion).toEqual('1.0.1');
    expect(packageChanges['b'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.0');
  });

  it('returns 8 changes when hotfixing a root package', () => {
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      packagesRushConfiguration.projectsByName,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(8);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['d'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.hotfix);

    expect(packageChanges['a'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['d'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('returns 7 changes when major bumping a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootMajorChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);

    expect(packageChanges['a'].newVersion).toEqual('2.0.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.1');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.1');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.1');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.0.1');
  });

  it('returns 2 changes when bumping cyclic dependencies', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'cyclicDeps'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(2);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('cyclic-dep-1');
    expect(packageChanges).toHaveProperty('cyclic-dep-2');

    expect(packageChanges['cyclic-dep-1'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['cyclic-dep-2'].changeType).toEqual(ChangeType.patch);
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
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);

    expect(packageChanges['a'].newVersion).toEqual('2.0.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.1');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.1');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.1');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.0.1');
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'orderedChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);

    expect(packageChanges['a'].newVersion).toEqual('2.0.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.1');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.1');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.1');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.0.1');
  });

  it('can resolve multiple hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleHotfixChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(8);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['d'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.hotfix);

    expect(packageChanges['a'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['d'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('can update an explicit dependency', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'explicitVersionChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(2);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges['c'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['d'].changeType).toEqual(ChangeType.patch);
  });

  it('can exclude lock step projects', () => {
    const allPackages: Map<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'repo', 'changes')),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges['a'].newVersion).toEqual('1.0.0');
    expect(packageChanges['b'].newVersion).toEqual('2.0.0');
    expect(packageChanges['c'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].newVersion).toEqual('3.1.2');
    expect(packageChanges['d'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['d'].newVersion).toEqual('4.1.2');
    expect(packageChanges['e'].newVersion).toEqual(allPackages.get('e')!.packageJson.version);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.none);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['h'].newVersion).toEqual('1.2.4');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.2.4');
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
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      rushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const orderedChanges: IChangeInfo[] = PublishUtilities.sortChangeRequests(packageChanges);

    expect(orderedChanges).toHaveLength(7);
    expect(orderedChanges[0].packageName).toEqual('a');
    expect(orderedChanges[1].packageName).toEqual('b');
    expect(orderedChanges[2].packageName).toEqual('e');
    expect(orderedChanges[3].packageName).toEqual('g');
    expect(orderedChanges[4].packageName).toEqual('h');
    expect(orderedChanges[5].packageName).toEqual('c');
    expect(orderedChanges[6].packageName).toEqual('f');
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
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'noChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(0);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);
  });

  it('returns 1 change when changing a leaf package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'leafChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(1);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges['d'].changeType).toEqual(ChangeType.patch);
  });

  it('returns 5 changes when patching a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootPatchChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(5);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.dependency);

    expect(packageChanges['a'].newVersion).toEqual('1.0.1');
    expect(packageChanges['b'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.1');
    expect(packageChanges['h'].newVersion).toEqual('1.0.0');
  });

  it('returns 8 changes when hotfixing a root package', () => {
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      packagesRushConfiguration.projectsByName,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(8);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['d'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.hotfix);

    expect(packageChanges['a'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['d'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('returns 7 changes when major bumping a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootMajorChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);

    expect(packageChanges['a'].newVersion).toEqual('2.0.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.1');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.1');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.1');
    expect(packageChanges['h'].newVersion).toEqual('1.0.1');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.0.1');
  });

  it('returns 2 changes when bumping cyclic dependencies', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'cyclicDeps'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(2);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('cyclic-dep-1');
    expect(packageChanges).toHaveProperty('cyclic-dep-2');

    expect(packageChanges['cyclic-dep-1'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['cyclic-dep-2'].changeType).toEqual(ChangeType.patch);
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
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);

    expect(packageChanges['a'].newVersion).toEqual('2.0.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.1');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.1');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.1');
    expect(packageChanges['h'].newVersion).toEqual('1.0.1');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.0.1');
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'orderedChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.major);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.dependency);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);

    expect(packageChanges['a'].newVersion).toEqual('2.0.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.1');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.1');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.1');
    expect(packageChanges['h'].newVersion).toEqual('1.0.1');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.0.1');
  });

  it('can resolve multiple hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleHotfixChanges'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(8);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('a');
    expect(packageChanges).toHaveProperty('b');
    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('d');
    expect(packageChanges).toHaveProperty('e');
    expect(packageChanges).toHaveProperty('f');
    expect(packageChanges).toHaveProperty('g');
    expect(packageChanges).toHaveProperty('h');

    expect(packageChanges['a'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['b'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['c'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['d'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['e'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['g'].changeType).toEqual(ChangeType.hotfix);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.hotfix);

    expect(packageChanges['a'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['b'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['c'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['d'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['e'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['f'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['g'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(packageChanges['h'].newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('can update an explicit dependency', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'explicitVersionChange'))
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(2);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(0);

    expect(packageChanges).toHaveProperty('c');
    expect(packageChanges).toHaveProperty('d');

    expect(packageChanges['c'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['d'].changeType).toEqual(ChangeType.patch);
  });

  it('can exclude lock step projects', () => {
    const allPackages: Map<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IAllChanges = PublishUtilities.findChangeRequests(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'repo', 'changes')),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );
    const packageChanges: IChangeInfoHash = allChanges.packages;
    const versionPolicyChanges: Record<string, SemVer> = allChanges.versionPolicies;

    expect(Object.keys(packageChanges)).toHaveLength(7);
    expect(Object.keys(versionPolicyChanges)).toHaveLength(1);

    expect(packageChanges['a'].newVersion).toEqual('1.0.0');
    expect(packageChanges['b'].newVersion).toEqual('2.0.0');
    expect(packageChanges['c'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['c'].newVersion).toEqual('3.1.2');
    expect(packageChanges['d'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['d'].newVersion).toEqual('4.1.2');
    expect(packageChanges['e'].newVersion).toEqual(allPackages.get('e')!.packageJson.version);
    expect(packageChanges['f'].changeType).toEqual(ChangeType.none);
    expect(packageChanges['h'].changeType).toEqual(ChangeType.patch);
    expect(packageChanges['h'].newVersion).toEqual('1.2.4');

    expect(versionPolicyChanges['lockStepWithoutNextBump'].format()).toEqual('1.2.4');
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
