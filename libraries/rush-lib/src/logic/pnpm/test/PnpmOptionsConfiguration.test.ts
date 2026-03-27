// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { PnpmOptionsConfiguration } from '../PnpmOptionsConfiguration';
import { TestUtilities } from '@rushstack/heft-config-file';
import { EnvironmentConfiguration } from '../../../api/EnvironmentConfiguration';
import type { RushUserConfiguration } from '../../../api/RushUserConfiguration';

const fakeCommonTempFolder: string = path.join(__dirname, 'common', 'temp');

describe(PnpmOptionsConfiguration.name, () => {
  it('throw error if pnpm-config.json does not exist', () => {
    expect(() => {
      PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
        `${__dirname}/pnpm-config-not-exist.json`,
        fakeCommonTempFolder
      );
    }).toThrow(/does not exist/);
  });

  it('validates unknown property', () => {
    expect(() =>
      PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
        `${__dirname}/jsonFiles/pnpm-config-unknown.json`,
        fakeCommonTempFolder
      )
    ).toThrow(/must NOT have additional properties/);
  });

  it('loads overrides', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-overrides.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalOverrides)).toEqual({
      foo: '^1.0.0',
      quux: 'npm:@myorg/quux@^1.0.0',
      'bar@^2.1.0': '3.0.0',
      'qar@1>zoo': '2'
    });

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.environmentVariables)).toEqual({
      NODE_OPTIONS: {
        value: '--max-old-space-size=4096',
        override: false
      }
    });
  });

  it('loads packageExtensions', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-packageExtensions.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalPackageExtensions)).toEqual({
      'react-redux': {
        peerDependencies: {
          'react-dom': '*'
        }
      }
    });
  });

  it('loads neverBuiltDependencies', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-neverBuiltDependencies.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalNeverBuiltDependencies)).toEqual([
      'fsevents',
      'level'
    ]);
  });

  it('loads onlyBuiltDependencies', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-onlyBuiltDependencies.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalOnlyBuiltDependencies)).toEqual([
      'esbuild',
      'playwright',
      '@swc/core'
    ]);
  });

  it('loads minimumReleaseAge', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-minimumReleaseAge.json`,
      fakeCommonTempFolder
    );

    expect(pnpmConfiguration.minimumReleaseAge).toEqual(1440);
    expect(TestUtilities.stripAnnotations(pnpmConfiguration.minimumReleaseAgeExclude)).toEqual([
      'webpack',
      '@myorg/*'
    ]);
  });

  it('loads catalog and catalogs', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-catalog.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalCatalogs)).toEqual({
      default: {
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        typescript: '~5.3.0'
      },
      frontend: {
        vue: '^3.4.0',
        'vue-router': '^4.2.0'
      },
      backend: {
        express: '^4.18.0',
        fastify: '^4.26.0'
      }
    });
  });

  it('uses default store path when no user configuration is provided', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonObject(
      {},
      fakeCommonTempFolder
    );

    expect(pnpmConfiguration.pnpmStorePath).toEqual(`${fakeCommonTempFolder}/pnpm-store`);
  });

  it('uses user configuration storePath when provided', () => {
    const mockUserConfig: Partial<RushUserConfiguration> = {
      buildCacheFolder: undefined,
      pnpmStorePath: '/custom/pnpm/store'
    };

    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonObject(
      {},
      fakeCommonTempFolder,
      mockUserConfig as RushUserConfiguration
    );

    expect(pnpmConfiguration.pnpmStorePath).toEqual('/custom/pnpm/store');
  });

  it('environment variable takes precedence over user configuration', () => {
    // Save original value
    const originalEnvValue = process.env.RUSH_PNPM_STORE_PATH;

    try {
      // Set environment variable with a path that will be normalized
      // Use an absolute path like the temp folder
      const envStorePath: string = path.join(fakeCommonTempFolder, 'env-pnpm-store');
      process.env.RUSH_PNPM_STORE_PATH = envStorePath;

      // Re-validate environment configuration to pick up the change
      EnvironmentConfiguration.reset();
      EnvironmentConfiguration.validate();

      const mockUserConfig: Partial<RushUserConfiguration> = {
        buildCacheFolder: undefined,
        pnpmStorePath: '/custom/pnpm/store'
      };

      const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonObject(
        {},
        fakeCommonTempFolder,
        mockUserConfig as RushUserConfiguration
      );

      // The environment variable value should be used (after normalization)
      expect(pnpmConfiguration.pnpmStorePath).toContain('env-pnpm-store');
    } finally {
      // Restore original value
      if (originalEnvValue !== undefined) {
        process.env.RUSH_PNPM_STORE_PATH = originalEnvValue;
      } else {
        delete process.env.RUSH_PNPM_STORE_PATH;
      }

      // Re-validate to restore original state
      EnvironmentConfiguration.reset();
      EnvironmentConfiguration.validate();
    }
  });
});
