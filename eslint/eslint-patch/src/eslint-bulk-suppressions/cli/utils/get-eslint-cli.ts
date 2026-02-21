// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';

import { BULK_SUPPRESSIONS_CLI_ESLINT_PACKAGE_NAME } from '../../constants.ts';

// When this list is updated, update the `eslint-bulk-suppressions-newest-test`
// and/or the `eslint-bulk-suppressions-newest-test` projects' eslint dependencies.
const TESTED_VERSIONS: Set<string> = new Set([
  '8.6.0',
  '8.7.0',
  '8.21.0',
  '8.22.0',
  '8.23.0',
  '8.23.1',
  '8.57.0',
  '9.25.1',
  '9.37.0'
]);

export function getEslintPathAndVersion(packagePath: string): [string, string] {
  // Try to find a local ESLint installation, the one that should be listed as a dev dependency in package.json
  // and installed in node_modules
  try {
    const localEslintApiPath: string = require.resolve(BULK_SUPPRESSIONS_CLI_ESLINT_PACKAGE_NAME, {
      paths: [packagePath]
    });
    const localEslintPath: string = path.dirname(path.dirname(localEslintApiPath));
    const { version: localEslintVersion } = require(`${localEslintPath}/package.json`);

    if (!TESTED_VERSIONS.has(localEslintVersion)) {
      console.warn(
        '@rushstack/eslint-bulk: Be careful, the installed ESLint version has not been tested with eslint-bulk.'
      );
    }

    return [localEslintApiPath, localEslintVersion];
  } catch (e1) {
    try {
      const {
        dependencies,
        devDependencies
      }: {
        dependencies: Record<string, string> | undefined;
        devDependencies: Record<string, string> | undefined;
      } = require(`${packagePath}/package.json`);

      if (devDependencies?.eslint) {
        throw new Error(
          '@rushstack/eslint-bulk: eslint is specified as a dev dependency in package.json, ' +
            'but eslint-bulk cannot find it in node_modules.'
        );
      } else if (dependencies?.eslint) {
        throw new Error(
          '@rushstack/eslint-bulk: eslint is specified as a dependency in package.json, ' +
            'but eslint-bulk cannot find it in node_modules.'
        );
      } else {
        throw new Error('@rushstack/eslint-bulk: eslint is not specified as a dependency in package.json.');
      }
    } catch (e2) {
      throw new Error(
        "@rushstack/eslint-bulk: This command must be run in the same folder as a project's package.json file."
      );
    }
  }
}
