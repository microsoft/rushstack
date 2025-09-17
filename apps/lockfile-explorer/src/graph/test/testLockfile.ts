// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { IJsonLfxWorkspace } from '../../../build/lfx-shared';

export const TEST_WORKSPACE: IJsonLfxWorkspace = {
  workspaceRootFullPath: '/repo',
  pnpmLockfilePath: 'common/temp/my-subspace/pnpm-lock.yaml',
  pnpmLockfileFolder: 'common/temp/my-subspace',
  rushConfig: {
    rushVersion: '0.0.0',
    subspaceName: 'my-subspace'
  }
};

export const TEST_LOCKFILE = {
  lockfileVersion: 5.4,
  importers: {
    '.': {
      specifiers: {}
    },
    '../../../apps/testApp1': {
      specifiers: {
        '@testPackage/core': '1.7.1',
        '@testPackage2/core': '1.7.1'
      },
      dependencies: {
        '@testPackage/core': '1.7.1',
        '@testPackage2/core': '1.7.1'
      },
      devDependencies: {}
    }
  },
  packages: {
    '/@testPackage/core/1.7.1': {
      resolution: {
        integrity:
          'sha512-eiZw+fxMzNQn01S8dA/hcCpoWCOCwcIIEUtHHdzN5TGB3IpzLbuhqFeTfh2OUhhgkE8Uo17+wH+QJ/wYyQmmzg=='
      },
      dependencies: {},
      dev: false
    },
    '/@testPackage2/core/1.7.1': {
      resolution: {
        integrity:
          'sha512-pJwmIxeJCymU1M6cGujnaIYcY3QPOVYZOXhFkWVM7IxKzy272BwCvMFMyc5NpG/QmiObBxjo7myd060OeTNJXg=='
      },
      peerDependencies: {},
      dependencies: {},
      dev: false
    }
  }
};
