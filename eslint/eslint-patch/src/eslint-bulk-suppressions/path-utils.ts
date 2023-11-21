// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';
import path from 'path';
import { eslintFolder } from '../_patch-base';

export function findAndConsoleLogPatchPathCli(patchPath: string): void {
  if (process.env.ESLINT_BULK_FIND !== 'true') {
    return;
  }

  const startDelimiter = 'ESLINT_BULK_STDOUT_START';
  const endDelimiter = 'ESLINT_BULK_STDOUT_END';

  console.log(
    `${startDelimiter}${path.resolve(patchPath, '..', 'exports', 'eslint-bulk.js')}${endDelimiter}`
  );
}

export function getPathToLinterJS(): string {
  if (!eslintFolder) {
    throw new Error('Cannot find ESLint installation to patch.');
  }

  return path.join(eslintFolder, 'lib', 'linter', 'linter.js');
}

export function getPathToGeneratedPatch(patchPath: string, nameOfGeneratedPatchFile: string): string {
  if (!fs.existsSync(path.join(patchPath, 'temp'))) {
    fs.mkdirSync(path.join(patchPath, 'temp'));
  }
  if (!fs.existsSync(path.join(patchPath, 'temp', 'patches'))) {
    fs.mkdirSync(path.join(patchPath, 'temp', 'patches'));
  }
  const pathToGeneratedPatch = path.join(patchPath, 'temp', 'patches', nameOfGeneratedPatchFile);

  return pathToGeneratedPatch;
}

function getEslintPackageVersion() {
  if (!eslintFolder) {
    throw new Error('Cannot find ESLint installation to patch.');
  }
  const eslintPackageJsonPath = path.join(eslintFolder, 'package.json');
  const eslintPackageJson = fs.readFileSync(eslintPackageJsonPath).toString();
  const eslintPackageObject = JSON.parse(eslintPackageJson);
  const eslintPackageVersion = eslintPackageObject.version;

  return eslintPackageVersion;
}

export function getNameOfGeneratedPatchFile() {
  const eslintPackageVersion = getEslintPackageVersion();
  const nameOfGeneratedPatchFile = `linter-patch-v${eslintPackageVersion}.js`;
  return nameOfGeneratedPatchFile;
}
