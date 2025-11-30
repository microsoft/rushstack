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

  it('loads globalCatalogs', () => {
    const pnpmConfiguration: PnpmOptionsConfiguration = PnpmOptionsConfiguration.loadFromJsonFileOrThrow(
      `${__dirname}/jsonFiles/pnpm-config-catalogs.json`,
      fakeCommonTempFolder
    );

    expect(TestUtilities.stripAnnotations(pnpmConfiguration.globalCatalogs)).toEqual({
      default: {
        lodash: '^4.17.21',
        typescript: '~5.0.0'
      },
      react18: {
        react: '^18.2.0',
        'react-dom': '^18.2.0'
      },
      testing: {
        jest: '^29.0.0',
        mocha: '^10.0.0'
      }
    });
  });
});
