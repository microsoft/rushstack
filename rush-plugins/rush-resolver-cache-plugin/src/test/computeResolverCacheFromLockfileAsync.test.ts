// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { LookupByPath } from '@rushstack/lookup-by-path';
import { PnpmShrinkwrapFile } from '@rushstack/rush-sdk/lib/logic/pnpm/PnpmShrinkwrapFile';

import {
  computeResolverCacheFromLockfileAsync,
  type IPartialRushProject,
  type IPlatformInfo
} from '../computeResolverCacheFromLockfileAsync';

describe(computeResolverCacheFromLockfileAsync.name, () => {
  it('matches snapshot behavior', async () => {
    const collateralFolder: string = path.resolve(__dirname, '../../test-collateral');

    const platformInfo: IPlatformInfo = {
      os: 'linux',
      cpu: 'x64',
      libc: 'glibc'
    };

    for (const testCase of [
      {
        workspaceRoot: '/$root/common/temp/build-tests',
        commonPrefixToTrim: '/$root',
        lockfileName: 'build-tests-subspace.yaml'
      },
      {
        workspaceRoot: '/$root/common/temp/default',
        commonPrefixToTrim: '/$root',
        lockfileName: 'default-subspace.yaml'
      }
    ]) {
      const { workspaceRoot, commonPrefixToTrim, lockfileName } = testCase;

      const lockfile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(
        `${collateralFolder}/${lockfileName}`
      );
      if (lockfile === undefined) {
        throw new Error(`Failed to load lockfile: ${lockfileName}`);
      }

      const projectByImporterPath: LookupByPath<IPartialRushProject> = new LookupByPath();
      for (const importerPath of lockfile.importers.keys()) {
        const remainder: string = importerPath.slice(importerPath.lastIndexOf('../') + 3);
        projectByImporterPath.setItem(importerPath, {
          projectFolder: `${commonPrefixToTrim}/${remainder}`,
          packageJson: {
            name: `@local/${remainder.replace(/\//g, '+')}`
          }
        });
      }

      const resolverCacheFile = await computeResolverCacheFromLockfileAsync({
        workspaceRoot,
        commonPrefixToTrim,
        lockfile,
        platformInfo,
        projectByImporterPath
      });

      // Trim undefined properties
      expect(JSON.parse(JSON.stringify(resolverCacheFile))).toMatchSnapshot(lockfileName);
    }
  });
});
