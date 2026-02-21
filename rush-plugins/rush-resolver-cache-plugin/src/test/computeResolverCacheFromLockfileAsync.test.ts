// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'node:path';

import { LookupByPath } from '@rushstack/lookup-by-path';
import { PnpmShrinkwrapFile } from '@rushstack/rush-sdk/lib/logic/pnpm/PnpmShrinkwrapFile';

import {
  computeResolverCacheFromLockfileAsync,
  type IComputeResolverCacheFromLockfileOptions,
  type IPartialRushProject,
  type IPlatformInfo
} from '../computeResolverCacheFromLockfileAsync.ts';
import type { IResolverContext } from '../types.ts';

interface ITestCase {
  workspaceRoot: string;
  commonPrefixToTrim: string;
  lockfileName: string;
  afterExternalPackagesAsync?: IComputeResolverCacheFromLockfileOptions['afterExternalPackagesAsync'];
}

const TEST_CASES: readonly ITestCase[] = [
  {
    // Validate with POSIX-style path inputs
    workspaceRoot: '/$root/common/temp/build-tests',
    commonPrefixToTrim: '/$root/',
    lockfileName: 'build-tests-subspace.yaml'
  },
  {
    // Validate that it works with Windows-style path inputs
    workspaceRoot: '\\$root\\common\\temp\\default',
    commonPrefixToTrim: '\\$root\\',
    lockfileName: 'default-subspace.yaml'
  },
  {
    workspaceRoot: '/$root/common/temp/bundled-dependencies',
    commonPrefixToTrim: '/$root/',
    lockfileName: 'bundled-dependencies.yaml',
    afterExternalPackagesAsync: async (contexts: Map<string, IResolverContext>) => {
      for (const context of contexts.values()) {
        context.nestedPackageDirs = [
          'node_modules/@baz/bar/node_modules/.ignored/@graphql-codegen/cli',
          'node_modules/@baz/bar/node_modules/.ignored/@graphql-codegen/typescript-react-apollo',
          'node_modules/@baz/bar/node_modules/.ignored/@typescript-eslint/parser',
          'node_modules/@baz/bar/node_modules/.ignored/eslint-config-prettier',
          'node_modules/@baz/bar/node_modules/.ignored/eslint-plugin-prettier',
          'node_modules/@baz/bar/node_modules/@graphql-codegen/cli',
          'node_modules/@baz/bar/node_modules/@graphql-codegen/typescript-react-apollo',
          'node_modules/@baz/bar/node_modules/@graphql-codegen/visitor-plugin-common',
          'node_modules/@baz/bar/node_modules/@graphql-tools/optimize',
          'node_modules/@baz/bar/node_modules/@graphql-tools/relay-operation-optimizer',
          'node_modules/@baz/bar/node_modules/@graphql-tools/url-loader',
          'node_modules/@baz/bar/node_modules/@graphql-tools/utils',
          'node_modules/@baz/bar/node_modules/@graphql-tools/wrap',
          'node_modules/@baz/bar/node_modules/@n1ru4l/graphql-live-query/esm',
          'node_modules/@baz/bar/node_modules/@n1ru4l/graphql-live-query',
          'node_modules/@baz/bar/node_modules/@typescript-eslint/parser',
          'node_modules/@baz/bar/node_modules/@typescript-eslint/typescript-estree/node_modules/globby',
          'node_modules/@baz/bar/node_modules/@typescript-eslint/typescript-estree',
          'node_modules/@baz/bar/node_modules/chokidar',
          'node_modules/@baz/bar/node_modules/dset',
          'node_modules/@baz/bar/node_modules/eslint-config-prettier',
          'node_modules/@baz/bar/node_modules/eslint-plugin-prettier',
          'node_modules/@baz/bar/node_modules/isomorphic-ws',
          'node_modules/@baz/bar/node_modules/minimatch',
          'node_modules/@baz/bar/node_modules/mkdirp',
          'node_modules/@baz/bar/node_modules/semver',
          'node_modules/@baz/bar/node_modules/string-width',
          'node_modules/@baz/bar/node_modules/strip-ansi',
          'node_modules/@baz/bar/node_modules/tslib/modules',
          'node_modules/@baz/bar/node_modules/tslib',
          'node_modules/@baz/bar/node_modules/ws',
          'node_modules/@baz/bar/node_modules/y18n',
          'node_modules/@baz/bar/node_modules/yargs-parser',
          'node_modules/@baz/bar/node_modules/yargs/helpers',
          'node_modules/@baz/bar/node_modules/yargs',
          'node_modules/@baz/bar'
        ];
      }
    }
  }
];

describe(computeResolverCacheFromLockfileAsync.name, () => {
  it('matches snapshot behavior', async () => {
    const collateralFolder: string = path.resolve(__dirname, '../../test-collateral');

    const platformInfo: IPlatformInfo = {
      os: 'linux',
      cpu: 'x64',
      libc: 'glibc'
    };

    for (const testCase of TEST_CASES) {
      const { workspaceRoot, commonPrefixToTrim, lockfileName, afterExternalPackagesAsync } = testCase;

      const lockfile: PnpmShrinkwrapFile | undefined = PnpmShrinkwrapFile.loadFromFile(
        `${collateralFolder}/${lockfileName}`,
        { subspaceHasNoProjects: false }
      );
      if (lockfile === undefined) {
        throw new Error(`Failed to load lockfile: ${lockfileName}`);
      }

      const projectByImporterPath: LookupByPath<IPartialRushProject> = new LookupByPath();
      for (const importerPath of lockfile.importers.keys()) {
        const remainder: string = importerPath.slice(importerPath.lastIndexOf('../') + 3);
        projectByImporterPath.setItem(importerPath, {
          // Normalization is the responsibility of the implementation
          projectFolder: `${commonPrefixToTrim}${remainder}`,
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
        projectByImporterPath,
        afterExternalPackagesAsync
      });

      // Trim undefined properties
      expect(JSON.parse(JSON.stringify(resolverCacheFile))).toMatchSnapshot(lockfileName);
    }
  });
});
