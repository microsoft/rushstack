// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { expect } from 'chai';
import {
  IChangeInfo,
  ChangeType,
  RushConfiguration,
  RushConfigurationProject
} from '@microsoft/rush-lib';
import * as path from 'path';
import PublishUtilities, {
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
    expect(allChanges['c'].newVersion).equals('1.0.0', 'b was not left unchanged');
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
    expect(PublishUtilities.isRangeDependency('>=1.0.0-0 <2.0.0-0')).is.true;
    expect(PublishUtilities.isRangeDependency('>=1.0.0 <2.0.0')).is.true;
    expect(PublishUtilities.isRangeDependency('1.0.0')).is.false;
    expect(PublishUtilities.isRangeDependency('^1.0.0')).is.false;
    expect(PublishUtilities.isRangeDependency('~1.0.0')).is.false;
    /* tslint:enable:no-unused-expression */
  });
});

describe('getNewDependencyVersion', () => {
  it('can create new dependency versions', () => {

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '>=1.0.0 <2.0.0' }, 'a', '2.0.0')
    ).equals('>=2.0.0-0 <3.0.0-0');

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '>=1.0.0-0 <2.0.0-0' }, 'a', '2.0.0')
    ).equals('>=2.0.0-0 <3.0.0-0');

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '^1.0.0' }, 'a', '2.0.0')
    ).equals('^2.0.0-0');

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '^1.0.0-0' }, 'a', '2.0.0')
    ).equals('^2.0.0-0');

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '~1.0.0' }, 'a', '2.0.0')
    ).equals('~2.0.0-0');

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '~1.0.0' }, 'a', '1.0.1')
    ).equals('~1.0.1-0');

    // Locked versions stay locked.
    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '1.0.0' }, 'a', '2.0.0')
    ).equals('2.0.0');

    expect(
      PublishUtilities.getNewDependencyVersion({ 'a': '1.0.0-hotfix1' }, 'a', '2.0.0')
    ).equals('2.0.0');

  });

});