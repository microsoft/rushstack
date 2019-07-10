// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { Text } from '@microsoft/node-core-library';
import { RushConfiguration } from '../RushConfiguration';
import { ApprovedPackagesPolicy } from '../ApprovedPackagesPolicy';
import { RushConfigurationProject } from '../RushConfigurationProject';
import { Utilities } from '../../utilities/Utilities';

function normalizePathForComparison(pathToNormalize: string): string {
  return Text.replaceAll(pathToNormalize, '\\', '/').toUpperCase();
}

function assertPathProperty(validatedPropertyName: string, absolutePath: string, relativePath: string): void {
  const resolvedRelativePath: string = path.resolve(__dirname, relativePath);
  expect(normalizePathForComparison(absolutePath)).toEqual(normalizePathForComparison(resolvedRelativePath));
}

describe('RushConfiguration', () => {
  let _oldEnv: typeof process.env;

  beforeEach(() => {
    _oldEnv = process.env;
    process.env = {};

    process.env['USERPROFILE'] = _oldEnv['USERPROFILE']; // tslint:disable-line:no-string-literal
    process.env['HOME'] = _oldEnv['HOME']; // tslint:disable-line:no-string-literal
  });

  afterEach(() => {
    process.env = _oldEnv;
  });

  it("can't load too new rush", (done: jest.DoneCallback) => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-too-new.json');

    expect(() => {
      RushConfiguration.loadFromConfigurationFile(rushFilename);
    }).toThrow('Unable to load rush-too-new.json because its RushVersion is 99.0.0');

    done();
  });

  it('can load repo/rush-npm.json', (done: jest.DoneCallback) => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('npm');
    assertPathProperty(
      'committedShrinkwrapFilename',
      rushConfiguration.committedShrinkwrapFilename,
      './repo/common/config/rush/npm-shrinkwrap.json'
    );
    assertPathProperty('commonFolder', rushConfiguration.commonFolder, './repo/common');
    assertPathProperty(
      'commonRushConfigFolder',
      rushConfiguration.commonRushConfigFolder,
      './repo/common/config/rush'
    );
    assertPathProperty('commonTempFolder', rushConfiguration.commonTempFolder, './repo/common/temp');
    assertPathProperty('npmCacheFolder', rushConfiguration.npmCacheFolder, './repo/common/temp/npm-cache');
    assertPathProperty('npmTmpFolder', rushConfiguration.npmTmpFolder, './repo/common/temp/npm-tmp');
    assertPathProperty('pnpmStoreFolder', rushConfiguration.pnpmStoreFolder, './repo/common/temp/pnpm-store');
    assertPathProperty(
      'packageManagerToolFilename',
      rushConfiguration.packageManagerToolFilename,
      './repo/common/temp/npm-local/node_modules/.bin/npm'
    );
    assertPathProperty('rushJsonFolder', rushConfiguration.rushJsonFolder, './repo');
    assertPathProperty(
      'rushLinkJsonFilename',
      rushConfiguration.rushLinkJsonFilename,
      './repo/common/temp/rush-link.json'
    );

    expect(rushConfiguration.packageManagerToolVersion).toEqual('4.5.0');

    expect(rushConfiguration.repositoryUrl).toEqual('someFakeUrl');
    expect(rushConfiguration.projectFolderMaxDepth).toEqual(99);
    expect(rushConfiguration.projectFolderMinDepth).toEqual(1);
    expect(rushConfiguration.hotfixChangeEnabled).toEqual(true);

    expect(rushConfiguration.projects.length).toEqual(3);

    // "approvedPackagesPolicy" feature
    const approvedPackagesPolicy: ApprovedPackagesPolicy = rushConfiguration.approvedPackagesPolicy;
    expect(approvedPackagesPolicy.enabled).toEqual(true);
    expect(Utilities.getSetAsArray(approvedPackagesPolicy.reviewCategories)).toEqual([
      'first-party',
      'third-party',
      'prototype'
    ]);

    expect(Utilities.getSetAsArray(approvedPackagesPolicy.ignoredNpmScopes)).toEqual(['@types', '@internal']);

    expect(approvedPackagesPolicy.browserApprovedPackages.items[0].packageName).toEqual('example');
    expect(approvedPackagesPolicy.browserApprovedPackages.items[0].allowedCategories.size).toEqual(3);

    expect(rushConfiguration.telemetryEnabled).toBe(false);

    // Validate project1 settings
    const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
    expect(project1).toBeDefined();

    expect(project1.packageName).toEqual('project1');
    assertPathProperty('project1.projectFolder', project1.projectFolder, './repo/project1');
    expect(project1.tempProjectName).toEqual('@rush-temp/project1');
    expect(project1.unscopedTempProjectName).toEqual('project1');
    expect(project1.skipRushCheck).toEqual(false);

    // Validate project2 settings
    const project2: RushConfigurationProject = rushConfiguration.getProjectByName('project2')!;
    expect(project2.skipRushCheck).toEqual(true);

    done();
  });

  it('can load repo/rush-pnpm.json', (done: jest.DoneCallback) => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('pnpm');
    assertPathProperty(
      'committedShrinkwrapFilename',
      rushConfiguration.committedShrinkwrapFilename,
      './repo/common/config/rush/pnpm-lock.yaml'
    );
    assertPathProperty('commonFolder', rushConfiguration.commonFolder, './repo/common');
    assertPathProperty(
      'commonRushConfigFolder',
      rushConfiguration.commonRushConfigFolder,
      './repo/common/config/rush'
    );
    assertPathProperty('commonTempFolder', rushConfiguration.commonTempFolder, './repo/common/temp');
    assertPathProperty('npmCacheFolder', rushConfiguration.npmCacheFolder, './repo/common/temp/npm-cache');
    assertPathProperty('npmTmpFolder', rushConfiguration.npmTmpFolder, './repo/common/temp/npm-tmp');
    assertPathProperty('pnpmStoreFolder', rushConfiguration.pnpmStoreFolder, './repo/common/temp/pnpm-store');
    assertPathProperty(
      'packageManagerToolFilename',
      rushConfiguration.packageManagerToolFilename,
      './repo/common/temp/pnpm-local/node_modules/.bin/pnpm'
    );
    assertPathProperty('rushJsonFolder', rushConfiguration.rushJsonFolder, './repo');
    assertPathProperty(
      'rushLinkJsonFilename',
      rushConfiguration.rushLinkJsonFilename,
      './repo/common/temp/rush-link.json'
    );

    expect(rushConfiguration.packageManagerToolVersion).toEqual('4.5.0');

    expect(rushConfiguration.repositoryUrl).toEqual('someFakeUrl');
    expect(rushConfiguration.projectFolderMaxDepth).toEqual(99);
    expect(rushConfiguration.projectFolderMinDepth).toEqual(1);

    expect(rushConfiguration.projects.length).toEqual(3);

    // "approvedPackagesPolicy" feature
    const approvedPackagesPolicy: ApprovedPackagesPolicy = rushConfiguration.approvedPackagesPolicy;
    expect(approvedPackagesPolicy.enabled).toBe(true);
    expect(Utilities.getSetAsArray(approvedPackagesPolicy.reviewCategories)).toEqual([
      'first-party',
      'third-party',
      'prototype'
    ]);
    expect(Utilities.getSetAsArray(approvedPackagesPolicy.ignoredNpmScopes)).toEqual(['@types', '@internal']);

    expect(approvedPackagesPolicy.browserApprovedPackages.items[0].packageName).toEqual('example');
    expect(approvedPackagesPolicy.browserApprovedPackages.items[0].allowedCategories.size).toEqual(3);

    expect(rushConfiguration.telemetryEnabled).toBe(false);

    // Validate project1 settings
    const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
    expect(project1).toBeDefined();

    expect(project1.packageName).toEqual('project1');
    assertPathProperty('project1.projectFolder', project1.projectFolder, './repo/project1');
    expect(project1.tempProjectName).toEqual('@rush-temp/project1');
    expect(project1.unscopedTempProjectName).toEqual('project1');

    done();
  });

  it('can load repo/rush-pnpm-2.json', (done: jest.DoneCallback) => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm-2.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('pnpm');
    expect(rushConfiguration.packageManagerToolVersion).toEqual('2.0.0');
    expect(rushConfiguration.shrinkwrapFilename).toEqual('shrinkwrap.yaml');

    done();
  });

  it('can load repo/rush-pnpm-3.json', (done: jest.DoneCallback) => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm-3.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('pnpm');
    expect(rushConfiguration.packageManagerToolVersion).toEqual('3.0.0');
    expect(rushConfiguration.shrinkwrapFilename).toEqual('pnpm-lock.yaml');

    done();
  });

  it('allows the temp directory to be set via environment variable', () => {
    const expectedValue: string = path.resolve('/var/temp');
    process.env['RUSH_TEMP_FOLDER'] = expectedValue; // tslint:disable-line:no-string-literal

    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    assertPathProperty('commonTempFolder', rushConfiguration.commonTempFolder, expectedValue);
    assertPathProperty(
      'npmCacheFolder',
      rushConfiguration.npmCacheFolder,
      path.join(expectedValue, 'npm-cache')
    );
    assertPathProperty('npmTmpFolder', rushConfiguration.npmTmpFolder, path.join(expectedValue, 'npm-tmp'));
    assertPathProperty(
      'pnpmStoreFolder',
      rushConfiguration.pnpmStoreFolder,
      path.join(expectedValue, 'pnpm-store')
    );
    assertPathProperty(
      'packageManagerToolFilename',
      rushConfiguration.packageManagerToolFilename,
      `${expectedValue}/pnpm-local/node_modules/.bin/pnpm`
    );
    assertPathProperty(
      'rushLinkJsonFilename',
      rushConfiguration.rushLinkJsonFilename,
      path.join(expectedValue, 'rush-link.json')
    );
  });
});
