// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { expect } from 'chai';
import * as path from 'path';

import {
  IChangeInfo,
  ChangeType
} from '../../../data/ChangeManagement';
import RushConfiguration from '../../../data/RushConfiguration';
import RushConfigurationProject from '../../../data/RushConfigurationProject';
import {
  default as PublishUtilities,
  IChangeInfoHash
} from '../PublishUtilities';
import ChangeFiles from '../ChangeFiles';

/* tslint:disable:no-string-literal */

describe('findChangeRequests', () => {

  it('returns no changes in an empty change folder', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'noChange')));

    expect(Object.keys(allChanges).length).to.equal(0);
  });

  it('returns 1 change when changing a leaf package', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'leafChange')));

    expect(Object.keys(allChanges).length).to.equal(1);
    expect(allChanges).has.property('d');
    expect(allChanges['d'].changeType).equals(ChangeType.patch, 'd was not patched');
  });

  it('returns 2 changes when patching a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'rootPatchChange')));

    expect(Object.keys(allChanges).length).to.equal(2);

    expect(allChanges).has.property('a');
    expect(allChanges).has.property('b');

    expect(allChanges['a'].changeType).equals(ChangeType.patch, 'a was not a patch');
    expect(allChanges['b'].changeType).equals(ChangeType.dependency, 'b was not a dependency change');

    expect(allChanges['a'].newVersion).equals('1.0.1', 'a was not patched');
    expect(allChanges['b'].newVersion).equals('1.0.0', 'b was not left unchanged');
  });

  it('returns 4 changes when hotfixing a root package', () => {
    const configuration: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json'));
    const allPackages: Map<string, RushConfigurationProject> = configuration.projectsByName;
    // tslint:disable-next-line no-any
    PublishUtilities.rushConfiguration = configuration as any;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange')));

    expect(Object.keys(allChanges).length).to.equal(4);

    expect(allChanges).has.property('a');
    expect(allChanges).has.property('b');

    expect(allChanges['a'].changeType).equals(ChangeType.hotfix, 'a was not a hotfix');
    expect(allChanges['b'].changeType).equals(ChangeType.hotfix, 'b did not receive a hotfix');
    expect(allChanges['c'].changeType).equals(ChangeType.hotfix, 'c did not receive a hotfix');
    expect(allChanges['d'].changeType).equals(ChangeType.hotfix, 'd did not receive a hotfix');

    expect(allChanges['a'].newVersion).equals('1.0.0-hotfix.0', 'a was not hotfixed');
    expect(allChanges['b'].newVersion).equals('1.0.0-hotfix.0', 'b did not receive a hotfix version bump');
    expect(allChanges['c'].newVersion).equals('1.0.0-hotfix.0', 'c did not receive a hotfix version bump');
    expect(allChanges['d'].newVersion).equals('1.0.0-hotfix.0', 'd did not receive a hotfix version bump');
  });

  it('returns 3 changes when major bumping a root package', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'rootMajorChange')));

    expect(Object.keys(allChanges).length).to.equal(3);

    expect(allChanges).has.property('a');
    expect(allChanges).has.property('b');
    expect(allChanges).has.property('c');

    expect(allChanges['a'].changeType).equals(ChangeType.major, 'a was not a major');
    expect(allChanges['b'].changeType).equals(ChangeType.patch, 'b was not a patch');
    expect(allChanges['c'].changeType).equals(ChangeType.dependency, 'c was not a dependency change');

    expect(allChanges['a'].newVersion).equals('2.0.0', 'a was not a major change');
    expect(allChanges['b'].newVersion).equals('1.0.1', 'b was not patched');
    expect(allChanges['c'].newVersion).equals('1.0.0', 'c was not left unchanged');
  });

  it('returns 2 changes when bumping cyclic dependencies', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'cyclicDeps')));

    expect(Object.keys(allChanges).length).to.equal(2);

    expect(allChanges).has.property('cyclic-dep-1');
    expect(allChanges).has.property('cyclic-dep-2');

    expect(allChanges['cyclic-dep-1'].changeType).equals(ChangeType.major, 'cyclic-dep-1 was not a major');
    expect(allChanges['cyclic-dep-2'].changeType).equals(ChangeType.patch, 'cyclic-dep-2 was not a patch');
  });

  it('returns error when mixing hotfix and non-hotfix changes', () => {
    const configuration: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json'));
    const allPackages: Map<string, RushConfigurationProject> = configuration.projectsByName;
    // tslint:disable-next-line no-any
    PublishUtilities.rushConfiguration = configuration as any;
    expect(PublishUtilities.findChangeRequests.bind(
      PublishUtilities,
      allPackages,
      new ChangeFiles(path.join(__dirname, 'hotfixWithPatchChanges')))).to
        .throw('Cannot apply hotfix alongside patch change on same package');
  });

  it('returns error when adding hotfix with config disabled', () => {
    const configuration: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json'));
    const allPackages: Map<string, RushConfigurationProject> = configuration.projectsByName;
    // Overload hotfixChangeEnabled function
    configuration['_hotfixChangeEnabled'] = false;
    // tslint:disable-next-line no-any
    PublishUtilities.rushConfiguration = configuration as any;

    expect(PublishUtilities.findChangeRequests.bind(
      PublishUtilities,
      allPackages,
      new ChangeFiles(path.join(__dirname, 'rootHotfixChange')))).to
        .throw('Cannot add hotfix change; hotfixChangeEnabled is false in configuration.');
  });

  it('can resolve multiple changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'multipleChanges')));

    expect(Object.keys(allChanges).length).to.equal(3);
    expect(allChanges).has.property('a');
    expect(allChanges).has.property('b');
    expect(allChanges).has.property('c');
    expect(allChanges['a'].changeType).equals(ChangeType.major, 'a was not a major');
    expect(allChanges['b'].changeType).equals(ChangeType.patch, 'b was not a patch');
    expect(allChanges['c'].changeType).equals(ChangeType.dependency, 'c was not a dependency change');
    expect(allChanges['a'].newVersion).equals('2.0.0', 'a was not a major change');
    expect(allChanges['b'].newVersion).equals('1.0.1', 'b was not patched');
    expect(allChanges['c'].newVersion).equals('1.0.0', 'c was not left unchanged');
  });

  it('can resolve multiple reverse-ordered changes requests on the same package', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'orderedChanges')));

    expect(Object.keys(allChanges).length).to.equal(3);
    expect(allChanges).has.property('a');
    expect(allChanges).has.property('b');
    expect(allChanges).has.property('c');
    expect(allChanges['a'].changeType).equals(ChangeType.major, 'a was not a major');
    expect(allChanges['b'].changeType).equals(ChangeType.patch, 'b was not a patch');
    expect(allChanges['c'].changeType).equals(ChangeType.dependency, 'c was not a dependency change');
    expect(allChanges['a'].newVersion).equals('2.0.0', 'a was not a major change');
    expect(allChanges['b'].newVersion).equals('1.0.1', 'b was not patched');
    expect(allChanges['c'].newVersion).equals('1.0.0', 'c was not left unchanged');
  });

  it('can resolve multiple hotfix changes', () => {
    const configuration: RushConfiguration =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json'));
    const allPackages: Map<string, RushConfigurationProject> = configuration.projectsByName;
    // tslint:disable-next-line no-any
    PublishUtilities.rushConfiguration = configuration as any;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'multipleHotfixChanges')));

    expect(Object.keys(allChanges).length).to.equal(4);
    expect(allChanges).has.property('a');
    expect(allChanges).has.property('b');
    expect(allChanges).has.property('c');
    expect(allChanges).has.property('d');

    expect(allChanges['a'].changeType).equals(ChangeType.hotfix, 'a was not a hotfix');
    expect(allChanges['b'].changeType).equals(ChangeType.hotfix, 'b did not receive a hotfix');
    expect(allChanges['c'].changeType).equals(ChangeType.hotfix, 'c did not receive a hotfix');
    expect(allChanges['d'].changeType).equals(ChangeType.hotfix, 'd did not receive a hotfix');

    expect(allChanges['a'].newVersion).equals('1.0.0-hotfix.0', 'a was not hotfixed');
    expect(allChanges['b'].newVersion).equals('1.0.0-hotfix.0', 'b did not receive a hotfix version bump');
    expect(allChanges['c'].newVersion).equals('1.0.0-hotfix.0', 'c did not receive a hotfix version bump');
    expect(allChanges['d'].newVersion).equals('1.0.0-hotfix.0', 'd did not receive a hotfix version bump');
  });

  it('can update an explicit dependency', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'explicitVersionChange')));

    expect(Object.keys(allChanges).length).to.equal(2);
    expect(allChanges).has.property('c');
    expect(allChanges).has.property('d');
    expect(allChanges['c'].changeType).equals(ChangeType.patch, 'c was not a patch');
    expect(allChanges['d'].changeType).equals(ChangeType.patch, 'd was not a patch');
  });

  it('can exclude lock step projects', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'repo', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'repo', 'changes')),
      false,
      undefined,
      new Set<string>(['a', 'b', 'e']));
    expect(Object.keys(allChanges).length).to.equal(5);
    expect(allChanges['a'].newVersion).equals('1.0.0', 'a version is changed');
    expect(allChanges['b'].newVersion).equals('2.0.0', 'b version is changed');
    expect(allChanges['c'].changeType).equals(ChangeType.patch, 'c was not a patch');
    expect(allChanges['c'].newVersion).equals('3.1.2');
    expect(allChanges['d'].changeType).equals(ChangeType.patch, 'd was not a patch');
    expect(allChanges['d'].newVersion).equals('4.1.2');
    expect(allChanges['e'].newVersion).equals(allPackages.get('e')!.packageJson.version, 'e version gets changed');
  });
});

describe('sortChangeRequests', () => {
  it('can return a sorted array of the change requests to be published in the correct order', () => {
    const allPackages: Map<string, RushConfigurationProject> =
      RushConfiguration.loadFromConfigurationFile(path.resolve(__dirname, 'packages', 'rush.json')).projectsByName;
    const allChanges: IChangeInfoHash = PublishUtilities.findChangeRequests(
      allPackages,
      new ChangeFiles(path.join(__dirname, 'multipleChanges')));
    const orderedChanges: IChangeInfo[] = PublishUtilities.sortChangeRequests(allChanges);

    expect(orderedChanges.length).equals(3, 'there was not 3 changes');
    expect(orderedChanges[0].packageName).equals('a', 'a was not at index 0');
    expect(orderedChanges[1].packageName).equals('b', 'b was not at index 1');
    expect(orderedChanges[2].packageName).equals('c', 'c was not at index 2');
  });
});

describe('isRangeDependency', () => {
  it('can test ranges', () => {
    /* tslint:disable:no-unused-expression */
    expect(PublishUtilities.isRangeDependency('>=1.0.0 <2.0.0')).is.true;
    expect(PublishUtilities.isRangeDependency('>=1.0.0-pr.1 <2.0.0')).is.true;
    expect(PublishUtilities.isRangeDependency('1.0.0')).is.false;
    expect(PublishUtilities.isRangeDependency('^1.0.0')).is.false;
    expect(PublishUtilities.isRangeDependency('~1.0.0')).is.false;
    /* tslint:enable:no-unused-expression */
  });
});

describe('getNewDependencyVersion', () => {
  it('can update dependency versions', () => {
    const dependencies: { [key: string]: string} = {
      'a': '~1.0.0',
      'b': '^1.0.0',
      'c': '>=1.0.0 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'a', '1.1.0')).equals('~1.1.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'b', '1.2.0')).equals('^1.2.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'c', '1.3.0')).equals('>=1.3.0 <2.0.0');
  });

  it('can update dependency versions with prereleases', () => {
    const dependencies: { [key: string]: string} = {
      'a': '~1.0.0-pr.1',
      'b': '^1.0.0-pr.1',
      'c': '>=1.0.0-pr.1 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'a', '1.1.0-pr.1')).equals('~1.1.0-pr.1');
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'b', '1.2.0-pr.2')).equals('^1.2.0-pr.2');
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'c', '1.3.0-pr.3')).equals('>=1.3.0-pr.3 <2.0.0');
  });

  it('can update to prerelease', () => {
    const dependencies: { [key: string]: string} = {
      'a': '~1.0.0',
      'b': '^1.0.0',
      'c': '>=1.0.0 <2.0.0'
    };
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'a', '1.0.0-hotfix.0')).equals('~1.0.0-hotfix.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'b', '1.0.0-hotfix.0')).equals('^1.0.0-hotfix.0');
    expect(PublishUtilities.getNewDependencyVersion(dependencies,
      'c', '1.0.0-hotfix.0')).equals('>=1.0.0-hotfix.0 <2.0.0');
  });
});