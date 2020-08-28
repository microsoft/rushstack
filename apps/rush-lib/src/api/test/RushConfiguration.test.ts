// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';

import { Text } from '@rushstack/node-core-library';
import { RushConfiguration } from '../RushConfiguration';
import { ApprovedPackagesPolicy } from '../ApprovedPackagesPolicy';
import { RushConfigurationProject } from '../RushConfigurationProject';
import { Utilities } from '../../utilities/Utilities';
import { EnvironmentConfiguration } from '../EnvironmentConfiguration';

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

    process.env['USERPROFILE'] = _oldEnv['USERPROFILE']; // eslint-disable-line dot-notation
    process.env['HOME'] = _oldEnv['HOME']; // eslint-disable-line dot-notation
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
    expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
    assertPathProperty(
      'pnpmStorePath',
      rushConfiguration.pnpmOptions.pnpmStorePath,
      './repo/common/temp/pnpm-store'
    );
    assertPathProperty(
      'packageManagerToolFilename',
      rushConfiguration.packageManagerToolFilename,
      './repo/common/temp/npm-local/node_modules/.bin/npm'
    );
    assertPathProperty('rushJsonFolder', rushConfiguration.rushJsonFolder, './repo');

    expect(rushConfiguration.packageManagerToolVersion).toEqual('4.5.0');

    expect(rushConfiguration.repositoryUrl).toEqual('someFakeUrl');
    expect(rushConfiguration.projectFolderMaxDepth).toEqual(99);
    expect(rushConfiguration.projectFolderMinDepth).toEqual(1);
    expect(rushConfiguration.hotfixChangeEnabled).toEqual(true);

    expect(rushConfiguration.projects).toHaveLength(3);

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
    expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
    assertPathProperty(
      'pnpmStorePath',
      rushConfiguration.pnpmOptions.pnpmStorePath,
      './repo/common/temp/pnpm-store'
    );
    assertPathProperty(
      'packageManagerToolFilename',
      rushConfiguration.packageManagerToolFilename,
      './repo/common/temp/pnpm-local/node_modules/.bin/pnpm'
    );
    assertPathProperty('rushJsonFolder', rushConfiguration.rushJsonFolder, './repo');

    expect(rushConfiguration.packageManagerToolVersion).toEqual('4.5.0');

    expect(rushConfiguration.repositoryUrl).toEqual('someFakeUrl');
    expect(rushConfiguration.projectFolderMaxDepth).toEqual(99);
    expect(rushConfiguration.projectFolderMinDepth).toEqual(1);

    expect(rushConfiguration.projects).toHaveLength(3);

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
    process.env['RUSH_TEMP_FOLDER'] = expectedValue; // eslint-disable-line dot-notation

    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    assertPathProperty('commonTempFolder', rushConfiguration.commonTempFolder, expectedValue);
    assertPathProperty(
      'npmCacheFolder',
      rushConfiguration.npmCacheFolder,
      path.join(expectedValue, 'npm-cache')
    );
    assertPathProperty('npmTmpFolder', rushConfiguration.npmTmpFolder, path.join(expectedValue, 'npm-tmp'));

    expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
    assertPathProperty(
      'pnpmStorePath',
      rushConfiguration.pnpmOptions.pnpmStorePath,
      path.join(expectedValue, 'pnpm-store')
    );
    assertPathProperty(
      'packageManagerToolFilename',
      rushConfiguration.packageManagerToolFilename,
      `${expectedValue}/pnpm-local/node_modules/.bin/pnpm`
    );
  });

  describe('PNPM Store Paths', () => {
    afterEach(() => {
      EnvironmentConfiguration['_pnpmStorePathOverride'] = undefined;
    });

    const PNPM_STORE_PATH_ENV: string = 'RUSH_PNPM_STORE_PATH';

    describe('Loading repo/rush-pnpm-local.json', () => {
      const RUSH_JSON_FILENAME: string = path.resolve(__dirname, 'repo', 'rush-pnpm-local.json');

      it(`loads the correct path when pnpmStore = "local"`, (done: jest.DoneCallback) => {
        const EXPECT_STORE_PATH: string = path.resolve(__dirname, 'repo', 'common', 'temp', 'pnpm-store');
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          RUSH_JSON_FILENAME
        );

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);
        expect(path.isAbsolute(rushConfiguration.pnpmOptions.pnpmStorePath)).toEqual(true);

        done();
      });

      it('loads the correct path when environment variable is defined', (done: jest.DoneCallback) => {
        const EXPECT_STORE_PATH: string = path.resolve('/var/temp');
        process.env[PNPM_STORE_PATH_ENV] = EXPECT_STORE_PATH;

        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          RUSH_JSON_FILENAME
        );

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);
        expect(path.isAbsolute(rushConfiguration.pnpmOptions.pnpmStorePath)).toEqual(true);

        done();
      });
    });

    describe('Loading repo/rush-pnpm-global.json', () => {
      const RUSH_JSON_FILENAME: string = path.resolve(__dirname, 'repo', 'rush-pnpm-global.json');

      it(`loads the correct path when pnpmStore = "global"`, (done: jest.DoneCallback) => {
        const EXPECT_STORE_PATH: string = '';
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          RUSH_JSON_FILENAME
        );

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('global');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);

        done();
      });

      it('loads the correct path when environment variable is defined', (done: jest.DoneCallback) => {
        const EXPECT_STORE_PATH: string = path.resolve('/var/temp');
        process.env[PNPM_STORE_PATH_ENV] = EXPECT_STORE_PATH;

        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          RUSH_JSON_FILENAME
        );

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('global');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);

        done();
      });
    });

    it(`throws an error when invalid pnpmStore is defined`, (done: jest.DoneCallback) => {
      const RUSH_JSON_FILENAME: string = path.resolve(__dirname, 'repo', 'rush-pnpm-invalid-store.json');
      expect(() => {
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
          RUSH_JSON_FILENAME
        );
      }).toThrow();

      done();
    });
  });
});
