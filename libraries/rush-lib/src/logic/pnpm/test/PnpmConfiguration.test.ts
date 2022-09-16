// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { PnpmConfiguration } from '../PnpmConfiguration';

describe(PnpmConfiguration.name, () => {
  it('validates unknown property', () => {
    expect(() =>
      PnpmConfiguration.loadFromFile(path.join(__dirname, 'jsonFiles', 'pnpm-config-unknown.json'))
    ).toThrow(/Additional properties not allowed: unknownProperty/);
  });

  it('loads overrides', () => {
    const pnpmConfiguration: PnpmConfiguration = PnpmConfiguration.loadFromFile(
      path.join(__dirname, 'jsonFiles', 'pnpm-config-overrides.json')
    );

    expect(pnpmConfiguration.pnpmFieldInRootPackageJson).toEqual({
      overrides: {
        foo: '^1.0.0',
        quux: 'npm:@myorg/quux@^1.0.0',
        'bar@^2.1.0': '3.0.0',
        'qar@1>zoo': '2'
      }
    });
  });

  it('loads packageExtensions', () => {
    const pnpmConfiguration: PnpmConfiguration = PnpmConfiguration.loadFromFile(
      path.join(__dirname, 'jsonFiles', 'pnpm-config-packageExtensions.json')
    );

    expect(pnpmConfiguration.pnpmFieldInRootPackageJson).toEqual({
      packageExtensions: {
        'react-redux': {
          peerDependencies: {
            'react-dom': '*'
          }
        }
      }
    });
  });

  it('loads neverBuiltDependencies', () => {
    const pnpmConfiguration: PnpmConfiguration = PnpmConfiguration.loadFromFile(
      path.join(__dirname, 'jsonFiles', 'pnpm-config-neverBuiltDependencies.json')
    );

    expect(pnpmConfiguration.pnpmFieldInRootPackageJson).toEqual({
      neverBuiltDependencies: ['fsevents', 'level']
    });
  });
});
