// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import { PnpmProjectManifestConfiguration } from '../PnpmProjectManifestConfiguration';

describe(PnpmProjectManifestConfiguration.name, () => {
  it('validates unknown property', () => {
    expect(() =>
      PnpmProjectManifestConfiguration.loadFromFile(
        path.join(__dirname, 'jsonFiles', 'pnpm-config-unknown.json')
      )
    ).toThrow();
  });

  it('loads overrides', () => {
    const pnpmProjectManifestConfiguration: PnpmProjectManifestConfiguration =
      PnpmProjectManifestConfiguration.loadFromFile(
        path.join(__dirname, 'jsonFiles', 'pnpm-config-overrides.json')
      );

    expect(pnpmProjectManifestConfiguration.overrides).toEqual({
      foo: '^1.0.0',
      quux: 'npm:@myorg/quux@^1.0.0',
      'bar@^2.1.0': '3.0.0',
      'qar@1>zoo': '2'
    });
  });

  it('loads packageExtensions', () => {
    const pnpmProjectManifestConfiguration: PnpmProjectManifestConfiguration =
      PnpmProjectManifestConfiguration.loadFromFile(
        path.join(__dirname, 'jsonFiles', 'pnpm-config-packageExtensions.json')
      );

    expect(pnpmProjectManifestConfiguration.packageExtensions).toEqual({
      'react-redux': {
        peerDependencies: {
          'react-dom': '*'
        }
      }
    });
  });

  it('loads neverBuiltDependencies', () => {
    const pnpmProjectManifestConfiguration: PnpmProjectManifestConfiguration =
      PnpmProjectManifestConfiguration.loadFromFile(
        path.join(__dirname, 'jsonFiles', 'pnpm-config-neverBuiltDependencies.json')
      );

    expect(pnpmProjectManifestConfiguration.neverBuiltDependencies).toEqual(
      expect.arrayContaining(['fsevents', 'level'])
    );
  });
});
