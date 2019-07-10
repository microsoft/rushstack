// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { IChangeInfo, ChangeType } from '../../api/ChangeManagement';
import { RushConfiguration } from '../../api/RushConfiguration';
import { RushConfigurationProject } from '../../api/RushConfigurationProject';
import { PublishUtilities, IChangeInfoHash } from '../PublishUtilities';
import { ChangeFiles } from '../ChangeFiles';

/* tslint:disable:no-string-literal */

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
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'noChange'))
    );

    expect(Object.keys(allChanges).length).toEqual(0);
  });

  it('returns 1 change when changing a leaf package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'leafChange'))
    );

    expect(Object.keys(allChanges).length).toEqual(1);
    expect(allChanges).toHaveProperty('d');
    expect(allChanges['d'].changeType).toEqual(ChangeType.patch);
  });

  it('returns 2 changes when patching a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootPatchChange'))
    );

    expect(Object.keys(allChanges).length).toEqual(2);

    expect(allChanges).toHaveProperty('a');
    expect(allChanges).toHaveProperty('b');

    expect(allChanges['a'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['b'].changeType).toEqual(ChangeType.dependency);

    expect(allChanges['a'].newVersion).toEqual('1.0.1');
    expect(allChanges['b'].newVersion).toEqual('1.0.0');
  });

  it('returns 4 changes when hotfixing a root package', () => {
    // tslint:disable-next-line no-any
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      packagesRushConfiguration.projectsByName,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange'))
    );

    expect(Object.keys(allChanges).length).toEqual(4);

    expect(allChanges).toHaveProperty('a');
    expect(allChanges).toHaveProperty('b');

    expect(allChanges['a'].changeType).toEqual(ChangeType.hotfix);
    expect(allChanges['b'].changeType).toEqual(ChangeType.hotfix);
    expect(allChanges['c'].changeType).toEqual(ChangeType.hotfix);
    expect(allChanges['d'].changeType).toEqual(ChangeType.hotfix);

    expect(allChanges['a'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges['b'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges['c'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges['d'].newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('returns 3 changes when major bumping a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'rootMajorChange'))
    );

    expect(Object.keys(allChanges).length).toEqual(3);

    expect(allChanges).toHaveProperty('a');
    expect(allChanges).toHaveProperty('b');
    expect(allChanges).toHaveProperty('c');

    expect(allChanges['a'].changeType).toEqual(ChangeType.major);
    expect(allChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['c'].changeType).toEqual(ChangeType.dependency);

    expect(allChanges['a'].newVersion).toEqual('2.0.0');
    expect(allChanges['b'].newVersion).toEqual('1.0.1');
    expect(allChanges['c'].newVersion).toEqual('1.0.0');
  });

  it('returns 2 changes when bumping cyclic dependencies', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'cyclicDeps'))
    );

    expect(Object.keys(allChanges).length).toEqual(2);

    expect(allChanges).toHaveProperty('cyclic-dep-1');
    expect(allChanges).toHaveProperty('cyclic-dep-2');

    expect(allChanges['cyclic-dep-1'].changeType).toEqual(ChangeType.major);
    expect(allChanges['cyclic-dep-2'].changeType).toEqual(ChangeType.patch);
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
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );

    expect(Object.keys(allChanges).length).toEqual(3);
    expect(allChanges).toHaveProperty('a');
    expect(allChanges).toHaveProperty('b');
    expect(allChanges).toHaveProperty('c');
    expect(allChanges['a'].changeType).toEqual(ChangeType.major);
    expect(allChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(allChanges['a'].newVersion).toEqual('2.0.0');
    expect(allChanges['b'].newVersion).toEqual('1.0.1');
    expect(allChanges['c'].newVersion).toEqual('1.0.0');
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'orderedChanges'))
    );

    expect(Object.keys(allChanges).length).toEqual(3);
    expect(allChanges).toHaveProperty('a');
    expect(allChanges).toHaveProperty('b');
    expect(allChanges).toHaveProperty('c');
    expect(allChanges['a'].changeType).toEqual(ChangeType.major);
    expect(allChanges['b'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['c'].changeType).toEqual(ChangeType.dependency);
    expect(allChanges['a'].newVersion).toEqual('2.0.0');
    expect(allChanges['b'].newVersion).toEqual('1.0.1');
    expect(allChanges['c'].newVersion).toEqual('1.0.0');
  });

  it('can resolve multiple hotfix changes', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleHotfixChanges'))
    );

    expect(Object.keys(allChanges).length).toEqual(4);
    expect(allChanges).toHaveProperty('a');
    expect(allChanges).toHaveProperty('b');
    expect(allChanges).toHaveProperty('c');
    expect(allChanges).toHaveProperty('d');

    expect(allChanges['a'].changeType).toEqual(ChangeType.hotfix);
    expect(allChanges['b'].changeType).toEqual(ChangeType.hotfix);
    expect(allChanges['c'].changeType).toEqual(ChangeType.hotfix);
    expect(allChanges['d'].changeType).toEqual(ChangeType.hotfix);

    expect(allChanges['a'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges['b'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges['c'].newVersion).toEqual('1.0.0-hotfix.0');
    expect(allChanges['d'].newVersion).toEqual('1.0.0-hotfix.0');
  });

  it('can update an explicit dependency', () => {
    const allPackages: Map<string, RushConfigurationProject> = packagesRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      packagesRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'explicitVersionChange'))
    );

    expect(Object.keys(allChanges).length).toEqual(2);
    expect(allChanges).toHaveProperty('c');
    expect(allChanges).toHaveProperty('d');
    expect(allChanges['c'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['d'].changeType).toEqual(ChangeType.patch);
  });

  it('can exclude lock step projects', () => {
    const allPackages: Map<string, RushConfigurationProject> = repoRushConfiguration.projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      repoRushConfiguration,
      new ChangeFiles(path.join(__dirname, 'repo', 'changes')),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e'])
    );
    expect(Object.keys(allChanges).length).toEqual(5);
    expect(allChanges['a'].newVersion).toEqual('1.0.0');
    expect(allChanges['b'].newVersion).toEqual('2.0.0');
    expect(allChanges['c'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['c'].newVersion).toEqual('3.1.2');
    expect(allChanges['d'].changeType).toEqual(ChangeType.patch);
    expect(allChanges['d'].newVersion).toEqual('4.1.2');
    expect(allChanges['e'].newVersion).toEqual(allPackages.get('e')!.packageJson.version);
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
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      rushConfiguration,
      new ChangeFiles(path.join(__dirname, 'multipleChanges'))
    );
    const orderedChanges: IChangeInfo[] = PublishUtilities.sortChangeRequests(allChanges);

    expect(orderedChanges.length).toEqual(3);
    expect(orderedChanges[0].packageName).toEqual('a');
    expect(orderedChanges[1].packageName).toEqual('b');
    expect(orderedChanges[2].packageName).toEqual('c');
  });
});

describe('isRangeDependency', () => {
  it('can test ranges', () => {
    /* tslint:disable:no-unused-expression */
    expect(PublishUtilities.isRangeDependency('>=1.0.0 <2.0.0')).toEqual(true);
    expect(PublishUtilities.isRangeDependency('>=1.0.0-pr.1 <2.0.0')).toEqual(true);
    expect(PublishUtilities.isRangeDependency('1.0.0')).toEqual(false);
    expect(PublishUtilities.isRangeDependency('^1.0.0')).toEqual(false);
    expect(PublishUtilities.isRangeDependency('~1.0.0')).toEqual(false);
    /* tslint:enable:no-unused-expression */
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
