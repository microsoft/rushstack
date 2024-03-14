// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'path';

const TESTED_VERSIONS: string[] = ['8.6.0', '8.7.0', '8.21.0', '8.22.0', '8.23.0', '8.23.1'];

export function getEslintCli(packagePath: string): string {
  // Try to find a local ESLint installation, the one that should be listed as a dev dependency in package.json
  // and installed in node_modules
  try {
    const localEslintApiPath: string = require.resolve('eslint', { paths: [packagePath] });
    const localEslintPath: string = path.dirname(path.dirname(localEslintApiPath));
    const eslintPackageJson: { version: string } = require(path.join(localEslintPath, 'package.json'));
    const localEslintVersion: string = eslintPackageJson.version;
    const eslintExecutable: string = path.join(localEslintPath, 'bin', 'eslint.js');

    if (!TESTED_VERSIONS.includes(localEslintVersion)) {
      console.warn(
        '@rushstack/eslint-bulk: Be careful, the installed ESLint version has not been tested with eslint-bulk.'
      );
    }
    return `node ${eslintExecutable}`;
  } catch (e) {
    throw new Error(
      '@rushstack/eslint-bulk: eslint is specified as a dev dependency in package.json, but eslint-bulk cannot find it in node_modules.'
    );
  }
}
