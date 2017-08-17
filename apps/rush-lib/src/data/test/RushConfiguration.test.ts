// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

/// <reference types='mocha' />

import { assert } from 'chai';
import RushConfiguration from '../RushConfiguration';
import { ApprovedPackagesPolicy } from '../ApprovedPackagesPolicy';
import RushConfigurationProject from '../RushConfigurationProject';
import * as path from 'path';
import Utilities from '../../utilities/Utilities';

function normalizePathForComparison(pathToNormalize: string): string {
  return Utilities.getAllReplaced(pathToNormalize, '\\', '/').toUpperCase();
}

function assertPathProperty(validatedPropertyName: string, absolutePath: string, relativePath: string): void {
  const resolvedRelativePath: string = path.resolve(__dirname, relativePath);
  assert.equal(normalizePathForComparison(absolutePath), normalizePathForComparison(resolvedRelativePath),
    `Failed to validate ${validatedPropertyName}`);
}

describe('RushConfiguration', () => {

  it('can load repo/rush.json', (done: MochaDone) => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    assertPathProperty('committedShrinkwrapFilename',
      rushConfiguration.committedShrinkwrapFilename, './repo/common/config/rush/shrinkwrap.yaml');
    assertPathProperty('commonFolder',
      rushConfiguration.commonFolder, './repo/common');
    assertPathProperty('commonRushConfigFolder',
      rushConfiguration.commonRushConfigFolder, './repo/common/config/rush');
    assertPathProperty('commonTempFolder',
      rushConfiguration.commonTempFolder, './repo/common/temp');
    assertPathProperty('npmCacheFolder',
      rushConfiguration.npmCacheFolder, './repo/common/temp/npm-cache');
    assertPathProperty('npmTmpFolder',
      rushConfiguration.npmTmpFolder, './repo/common/temp/npm-tmp');
    assertPathProperty('npmToolFilename',
      rushConfiguration.pnpmToolFilename, './repo/common/temp/pnpm-local/node_modules/.bin/pnpm');
    assertPathProperty('rushJsonFolder',
      rushConfiguration.rushJsonFolder, './repo');
    assertPathProperty('rushLinkJsonFilename',
      rushConfiguration.rushLinkJsonFilename, './repo/common/temp/rush-link.json');

    assert.equal(rushConfiguration.npmToolVersion, '4.5.0', 'Failed to validate npmToolVersion');

    assert.equal(rushConfiguration.projectFolderMaxDepth, 99, 'Failed to validate projectFolderMaxDepth');
    assert.equal(rushConfiguration.projectFolderMinDepth, 1, 'Failed to validate projectFolderMinDepth');

    assert.equal(rushConfiguration.projects.length, 3);

    // "approvedPackagesPolicy" feature
    const approvedPackagesPolicy: ApprovedPackagesPolicy = rushConfiguration.approvedPackagesPolicy;
    assert.isTrue(approvedPackagesPolicy.enabled, 'Failed to validate approvedPackagesPolicy.enabled');
    assert.deepEqual(Utilities.getSetAsArray(approvedPackagesPolicy.reviewCategories),
      [ 'first-party', 'third-party', 'prototype' ],
      'Failed to validate approvedPackagesPolicy.reviewCategories');
    assert.deepEqual(Utilities.getSetAsArray(approvedPackagesPolicy.ignoredNpmScopes),
      [ '@types', '@internal' ],
      'Failed to validate approvedPackagesPolicy.ignoredNpmScopes');

    assert.equal(approvedPackagesPolicy.browserApprovedPackages.items[0].packageName, 'example',
       'Failed to validate browserApprovedPackages.items[0]');
    assert.equal(approvedPackagesPolicy.browserApprovedPackages.items[0].allowedCategories.size, 3,
       'Failed to validate browserApprovedPackages.items[0]');

    assert.isNotTrue(rushConfiguration.telemetryEnabled);

    // Validate project1 settings
    const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1');
    assert.ok(project1, 'Failed to find project1');

    assert.equal(project1.packageName, 'project1', 'Failed to validate project1.packageName');
    assertPathProperty('project1.projectFolder', project1.projectFolder, './repo/project1');
    assert.equal(project1.tempProjectName, '@rush-temp/project1', 'Failed to validate project1.tempProjectName');
    assertPathProperty('project1.tempPackageJsonFilename', project1.tempPackageJsonFilename,
      './repo/common/temp/projects/project1/package.json');

    done();
  });
});
