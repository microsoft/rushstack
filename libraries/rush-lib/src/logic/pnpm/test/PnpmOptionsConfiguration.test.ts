// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';
import { PnpmOptionsConfiguration } from '../PnpmOptionsConfiguration';
import { TestUtilities } from '@rushstack/heft-config-file';

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

  it('loads allowBuilds', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-allowBuilds.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalAllowBuilds)).toEqual({
      esbuild: true,
      '@parcel/watcher': true,
      fsevents: false
    });
  });

  it('loads minimumReleaseAgeMinutes', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-minimumReleaseAge.json`,
      fakeCommonTempFolder
    );

    expect(pnpmConfiguration.minimumReleaseAgeMinutes).toEqual(1440);
    expect(TestUtilities.stripAnnotations(pnpmConfiguration.minimumReleaseAgeExclude)).toEqual([
      'webpack',
      '@myorg/*'
    ]);
  });

  it('loads deprecated minimumReleaseAge as minimumReleaseAgeMinutes', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-minimumReleaseAge-deprecated.json`,
      fakeCommonTempFolder
    );

    expect(pnpmConfiguration.minimumReleaseAgeMinutes).toEqual(720);
  });

  it('throws if both minimumReleaseAge and minimumReleaseAgeMinutes are specified', () => {
    expect(() =>
      PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
        `${__dirname}/jsonFiles/pnpm-config-minimumReleaseAge-both.json`,
        fakeCommonTempFolder
      )
    ).toThrow(/Both settings cannot be specified together/);
  });

  it('loads trustPolicy', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-trustPolicy.json`,
      fakeCommonTempFolder
    );

    expect(pnpmConfiguration.trustPolicy).toEqual('no-downgrade');
    expect(TestUtilities.stripAnnotations(pnpmConfiguration.trustPolicyExclude)).toEqual([
      '@myorg/*',
      'chokidar@4.0.3',
      'webpack@4.47.0 || 5.102.1',
      '@babel/core@7.28.5'
    ]);
    expect(pnpmConfiguration.trustPolicyIgnoreAfterMinutes).toEqual(20160);
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

  describe('updateGlobalPatchedDependencies', () => {
    function update(
      patchedDependencies: Record<string, string> | undefined
    ): Record<string, string> | undefined {
      // No jsonFilename, so updateGlobalPatchedDependencies won't try to write to disk
      const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonObject(
        {},
        fakeCommonTempFolder
      );
      pnpmConfiguration.updateGlobalPatchedDependencies(patchedDependencies);
      return pnpmConfiguration.globalPatchedDependencies;
    }

    it('converts absolute patch paths under the common temp folder back to relative paths', () => {
      // pnpm >= 9 "patch-commit"/"patch-remove" rewrite pre-existing "patchedDependencies" entries
      // using absolute paths pointing into the common/temp folder
      expect(
        update({
          'example@1.0.0': path.join(fakeCommonTempFolder, 'patches', 'example@1.0.0.patch'),
          '@scope/example2@2.0.0': path.join(fakeCommonTempFolder, 'patches', '@scope__example2@2.0.0.patch')
        })
      ).toEqual({
        'example@1.0.0': 'patches/example@1.0.0.patch',
        '@scope/example2@2.0.0': 'patches/@scope__example2@2.0.0.patch'
      });
    });

    it('leaves relative patch paths unchanged', () => {
      expect(
        update({
          'example@1.0.0': 'patches/example@1.0.0.patch'
        })
      ).toEqual({
        'example@1.0.0': 'patches/example@1.0.0.patch'
      });
    });

    it('leaves absolute patch paths outside the common temp folder unchanged', () => {
      const outsidePath: string = path.join(path.sep, 'somewhere', 'else', 'example@1.0.0.patch');
      expect(
        update({
          'example@1.0.0': outsidePath
        })
      ).toEqual({
        'example@1.0.0': outsidePath
      });
    });

    it('passes through undefined', () => {
      expect(update(undefined)).toBeUndefined();
    });
  });
});
