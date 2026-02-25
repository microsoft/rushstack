// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IPackageJson } from '../../types/IPackageJson.ts';
import { compareSpec } from '../compareSpec.ts';

const packageJson: IPackageJson = {
  name: 'testPackage',
  version: '0.0.0',
  dependencies: {
    package1: '0.0.0'
  },
  devDependencies: {
    package2: '0.0.0'
  },
  peerDependencies: {}
};

const parsedPackageJson: IPackageJson = {
  name: 'testPackage',
  version: '0.0.0',
  dependencies: {
    package1: '1.0.0'
  },
  devDependencies: {
    package3: '2.0.0'
  },
  peerDependencies: {}
};

describe('Compare package.json and parsed package.json', () => {
  it('calculates the differences between the two package.jsons correctly', () => {
    const changes = compareSpec(packageJson, parsedPackageJson);

    expect(changes.get('package1')).toEqual({
      type: 'diff',
      packageName: 'package1',
      from: '0.0.0',
      to: '1.0.0'
    });

    expect(changes.get('package3')).toEqual({
      type: 'add',
      packageName: 'package3'
    });

    expect(changes.get('package2')).toEqual({
      type: 'remove',
      packageName: 'package2'
    });
  });
});
