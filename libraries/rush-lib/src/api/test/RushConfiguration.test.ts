// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { JsonFile, Path, Text } from '@rushstack/node-core-library';
import { RushConfiguration } from '../RushConfiguration';
import type { ApprovedPackagesPolicy } from '../ApprovedPackagesPolicy';
import { RushConfigurationProject } from '../RushConfigurationProject';
import { EnvironmentConfiguration } from '../EnvironmentConfiguration';
import { DependencyType } from '../PackageJsonEditor';

function normalizePathForComparison(pathToNormalize: string): string {
  return Text.replaceAll(pathToNormalize, '\\', '/').toUpperCase();
}

function assertPathProperty(validatedPropertyName: string, absolutePath: string, relativePath: string): void {
  const resolvedRelativePath: string = path.resolve(__dirname, relativePath);
  expect(normalizePathForComparison(absolutePath)).toEqual(normalizePathForComparison(resolvedRelativePath));
}

describe(RushConfiguration.name, () => {
  let _oldEnv: typeof process.env;

  beforeEach(() => {
    _oldEnv = process.env;
    process.env = {};

    process.env['USERPROFILE'] = _oldEnv['USERPROFILE']; // eslint-disable-line dot-notation
    process.env['HOME'] = _oldEnv['HOME']; // eslint-disable-line dot-notation
  });

  afterEach(() => {
    process.env = _oldEnv;
    jest.resetAllMocks();
  });

  it("can't load too new rush", () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-too-new.json');

    expect(() => {
      RushConfiguration.loadFromConfigurationFile(rushFilename);
    }).toThrow('Unable to load rush-too-new.json because its RushVersion is 99.0.0');
  });

  it('can load repo/rush-npm.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-npm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('npm');
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

    expect(rushConfiguration.repositoryUrls).toEqual(['someFakeUrl']);
    expect(rushConfiguration.projectFolderMaxDepth).toEqual(99);
    expect(rushConfiguration.projectFolderMinDepth).toEqual(1);
    expect(rushConfiguration.hotfixChangeEnabled).toEqual(true);

    expect(rushConfiguration.projects).toHaveLength(5);

    // "approvedPackagesPolicy" feature
    const approvedPackagesPolicy: ApprovedPackagesPolicy = rushConfiguration.approvedPackagesPolicy;
    expect(approvedPackagesPolicy.enabled).toEqual(true);
    expect(Array.from(approvedPackagesPolicy.reviewCategories)).toEqual([
      'first-party',
      'third-party',
      'prototype'
    ]);

    expect(Array.from(approvedPackagesPolicy.ignoredNpmScopes)).toEqual(['@types', '@internal']);

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
  });

  it('can load repo/rush-pnpm.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('pnpm');
    expect(rushConfiguration.shrinkwrapFilename).toEqual('pnpm-lock.yaml');
    assertPathProperty(
      'getPnpmfilePath',
      rushConfiguration.defaultSubspace.getPnpmfilePath(undefined),
      './repo/common/config/rush/.pnpmfile.cjs'
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

    expect(rushConfiguration.packageManagerToolVersion).toEqual('6.0.0');

    expect(rushConfiguration.repositoryUrls).toEqual(['someFakeUrl']);
    expect(rushConfiguration.projectFolderMaxDepth).toEqual(99);
    expect(rushConfiguration.projectFolderMinDepth).toEqual(1);

    expect(rushConfiguration.projects).toHaveLength(3);

    // "approvedPackagesPolicy" feature
    const approvedPackagesPolicy: ApprovedPackagesPolicy = rushConfiguration.approvedPackagesPolicy;
    expect(approvedPackagesPolicy.enabled).toBe(true);
    expect(Array.from(approvedPackagesPolicy.reviewCategories)).toEqual([
      'first-party',
      'third-party',
      'prototype'
    ]);
    expect(Array.from(approvedPackagesPolicy.ignoredNpmScopes)).toEqual(['@types', '@internal']);

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
  });

  it('can load repo/rush-pnpm-5.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm-5.json');
    const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);

    expect(rushConfiguration.packageManager).toEqual('pnpm');
    expect(rushConfiguration.packageManagerToolVersion).toEqual('5.0.0');
    expect(rushConfiguration.shrinkwrapFilename).toEqual('pnpm-lock.yaml');
    assertPathProperty(
      'getPnpmfilePath',
      rushConfiguration.defaultSubspace.getPnpmfilePath(undefined),
      './repo/common/config/rush/pnpmfile.js'
    );
    expect(rushConfiguration.repositoryUrls).toEqual(['someFakeUrl', 'otherFakeUrl']);
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

  it('fails to load repo/rush-repository-url-urls.json', () => {
    const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-repository-url-urls.json');
    expect(() => RushConfiguration.loadFromConfigurationFile(rushFilename)).toThrowErrorMatchingSnapshot();
  });

  describe('PNPM Store Paths', () => {
    afterEach(() => {
      EnvironmentConfiguration['_pnpmStorePathOverride'] = undefined;
    });

    const PNPM_STORE_PATH_ENV: string = 'RUSH_PNPM_STORE_PATH';

    describe('Loading repo/rush-pnpm-local.json', () => {
      const RUSH_JSON_FILENAME: string = path.resolve(__dirname, 'repo', 'rush-pnpm-local.json');

      it(`loads the correct path when pnpmStore = "local"`, () => {
        const EXPECT_STORE_PATH: string = path.resolve(__dirname, 'repo', 'common', 'temp', 'pnpm-store');
        const rushConfiguration: RushConfiguration =
          RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
        expect(Path.convertToSlashes(rushConfiguration.pnpmOptions.pnpmStorePath)).toEqual(
          Path.convertToSlashes(EXPECT_STORE_PATH)
        );
        expect(path.isAbsolute(rushConfiguration.pnpmOptions.pnpmStorePath)).toEqual(true);
      });

      it('loads the correct path when environment variable is defined', () => {
        const EXPECT_STORE_PATH: string = path.resolve('/var/temp');
        process.env[PNPM_STORE_PATH_ENV] = EXPECT_STORE_PATH;

        const rushConfiguration: RushConfiguration =
          RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('local');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);
        expect(path.isAbsolute(rushConfiguration.pnpmOptions.pnpmStorePath)).toEqual(true);
      });
    });

    describe('Loading repo/rush-pnpm-global.json', () => {
      const RUSH_JSON_FILENAME: string = path.resolve(__dirname, 'repo', 'rush-pnpm-global.json');

      it(`loads the correct path when pnpmStore = "global"`, () => {
        const EXPECT_STORE_PATH: string = '';
        const rushConfiguration: RushConfiguration =
          RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('global');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);
      });

      it('loads the correct path when environment variable is defined', () => {
        const EXPECT_STORE_PATH: string = path.resolve('/var/temp');
        process.env[PNPM_STORE_PATH_ENV] = EXPECT_STORE_PATH;

        const rushConfiguration: RushConfiguration =
          RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);

        expect(rushConfiguration.packageManager).toEqual('pnpm');
        expect(rushConfiguration.pnpmOptions.pnpmStore).toEqual('global');
        expect(rushConfiguration.pnpmOptions.pnpmStorePath).toEqual(EXPECT_STORE_PATH);
      });
    });

    it(`throws an error when invalid pnpmStore is defined`, () => {
      const RUSH_JSON_FILENAME: string = path.resolve(__dirname, 'repo', 'rush-pnpm-invalid-store.json');
      expect(() => {
        // @ts-ignore
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const rushConfiguration: RushConfiguration =
          RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
      }).toThrow();
    });
  });

  it('reject "pnpmOptions" in rush.json if the file pnpm-config.json exists', () => {
    const RUSH_JSON_FILENAME: string = `${__dirname}/pnpmConfigThrow/rush.json`;
    expect(() => {
      RushConfiguration.loadFromConfigurationFile(RUSH_JSON_FILENAME);
    }).toThrow(
      'Because the new config file "common/config/rush/pnpm-config.json" is being used, you must remove the old setting "pnpmOptions" from rush.json'
    );
  });

  describe('publishTarget schema validation', () => {
    it('accepts publishTarget omitted and defaults to ["npm"]', () => {
      const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
      expect(rushConfiguration.projects).toHaveLength(3);
      const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
      expect(project1.publishTargets).toEqual(['npm']);
    });

    it('accepts publishTarget as a string and normalizes to array', () => {
      const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm-publishtarget-string.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
      expect(rushConfiguration.projects).toHaveLength(1);
      const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
      expect(project1.publishTargets).toEqual(['vsix']);
    });

    it('accepts publishTarget as an array of strings', () => {
      const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm-publishtarget-array.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
      expect(rushConfiguration.projects).toHaveLength(1);
      const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
      expect(project1.publishTargets).toEqual(['npm', 'vsix']);
    });

    it('rejects publishTarget as an empty array', () => {
      const rushFilename: string = path.resolve(
        __dirname,
        'repo',
        'rush-pnpm-publishtarget-empty-array.json'
      );
      expect(() => {
        RushConfiguration.loadFromConfigurationFile(rushFilename);
      }).toThrow();
    });

    it('rejects publishTarget with non-string items', () => {
      const rushFilename: string = path.resolve(
        __dirname,
        'repo',
        'rush-pnpm-publishtarget-invalid-type.json'
      );
      expect(() => {
        RushConfiguration.loadFromConfigurationFile(rushFilename);
      }).toThrow();
    });

    it('rejects publishTarget "none" combined with other targets', () => {
      const rushFilename: string = path.resolve(
        __dirname,
        'repo',
        'rush-pnpm-publishtarget-none-combined.json'
      );
      expect(() => {
        const config: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
        // Force lazy project initialization which triggers validation
        void config.projects;
      }).toThrow(/cannot be combined/);
    });

    it('allows shouldPublish:true with private:true when publishTarget is "vsix"', () => {
      const rushFilename: string = path.resolve(__dirname, 'repo', 'rush-pnpm-publishtarget-string.json');
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
      // project1 has publishTarget: "vsix" - this should not throw even if package.json were private
      // (the test fixture project1 is not private, so this validates the code path doesn't throw for non-npm targets)
      const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
      expect(project1.publishTargets).toEqual(['vsix']);
    });

    it('rejects publishTarget "none" with lockstep version policy', () => {
      const rushFilename: string = path.resolve(
        __dirname,
        'repo',
        'rush-pnpm-publishtarget-none-lockstep.json'
      );
      expect(() => {
        const config: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
        void config.projects; // Force lazy project initialization which triggers validation
      }).toThrow(/incompatible with lockstep version policies/);
    });

    it('allows publishTarget "none" with individual version policy', () => {
      const rushFilename: string = path.resolve(
        __dirname,
        'repo',
        'rush-pnpm-publishtarget-none-individual.json'
      );
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
      const project1: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;
      expect(project1.publishTargets).toEqual(['none']);
    });

    it('rejects shouldPublish:true with private:true when publishTarget includes "npm"', () => {
      const rushFilename: string = path.resolve(
        __dirname,
        'repo',
        'rush-pnpm-publishtarget-npm-private.json'
      );
      expect(() => {
        const config: RushConfiguration = RushConfiguration.loadFromConfigurationFile(rushFilename);
        void config.projects; // Force lazy project initialization which triggers validation
      }).toThrow(/specifies "shouldPublish": true.*publishTarget including "npm".*"private": true/);
    });
  });

  describe(RushConfigurationProject.name, () => {
    it('correctly updates the packageJson property after the packageJson is edited by packageJsonEditor', async () => {
      const rushConfiguration: RushConfiguration = RushConfiguration.loadFromConfigurationFile(
        `${__dirname}/repo/rush-pnpm.json`
      );
      jest.spyOn(JsonFile, 'save').mockImplementation(() => {
        /* no-op*/
        return true;
      });

      const project: RushConfigurationProject = rushConfiguration.getProjectByName('project1')!;

      expect(project.packageJson.devDependencies).toMatchSnapshot('devDependencies before');
      expect(Array.from(project.dependencyProjects.values()).map((x) => x.packageName)).toMatchSnapshot(
        'dependencyProjects before'
      );
      project.packageJsonEditor.addOrUpdateDependency('project2', '1.0.0', DependencyType.Dev);
      project.packageJsonEditor.saveIfModified();
      expect(project.packageJson.devDependencies).toMatchSnapshot('devDependencies after');
      expect(Array.from(project.dependencyProjects.values()).map((x) => x.packageName)).toMatchSnapshot(
        'dependencyProjects after'
      );
    });
  });
});
