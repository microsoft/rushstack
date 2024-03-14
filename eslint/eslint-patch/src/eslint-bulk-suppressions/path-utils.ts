// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import fs from 'fs';
import path from 'path';
import { eslintFolder } from '../_patch-base';

interface IConfiguration {
  minCliVersion: string;
  cliEntryPoint: string;
}

export function findAndConsoleLogPatchPathCli(patchPath: string): void {
  if (process.env._RUSHSTACK_ESLINT_BULK_DETECT !== 'true') {
    return;
  }

  const startDelimiter: string = 'RUSHSTACK_ESLINT_BULK_START';
  const endDelimiter: string = 'RUSHSTACK_ESLINT_BULK_END';

  const configuration: IConfiguration = {
    /**
     * `@rushtack/eslint`-bulk should report an error if its package.json is older than this number
     */
    minCliVersion: '0.0.0',
    /**
     * `@rushtack/eslint-bulk` will invoke this entry point
     */
    cliEntryPoint: path.resolve(patchPath, '..', 'exports', 'eslint-bulk.js')
  };

  console.log(startDelimiter + JSON.stringify(configuration) + endDelimiter);
}

export function getPathToLinterJS(): string {
  if (!eslintFolder) {
    throw new Error('Cannot find ESLint installation to patch.');
  }

  return path.join(eslintFolder, 'lib', 'linter', 'linter.js');
}

export function getPathToGeneratedPatch(patchPath: string, nameOfGeneratedPatchFile: string): string {
  fs.mkdirSync(path.join(patchPath, 'temp', 'patches'), { recursive: true });
  const pathToGeneratedPatch: string = path.join(patchPath, 'temp', 'patches', nameOfGeneratedPatchFile);

  return pathToGeneratedPatch;
}

function getEslintPackageVersion(): string {
  if (!eslintFolder) {
    throw new Error('Cannot find ESLint installation to patch.');
  }
  const eslintPackageJsonPath: string = path.join(eslintFolder, 'package.json');
  const eslintPackageJson: string = fs.readFileSync(eslintPackageJsonPath).toString();
  const eslintPackageObject: { version: string } = JSON.parse(eslintPackageJson);
  const eslintPackageVersion: string = eslintPackageObject.version;

  return eslintPackageVersion;
}

export function getNameOfGeneratedPatchFile(): string {
  const eslintPackageVersion: string = getEslintPackageVersion();
  const nameOfGeneratedPatchFile: string = `linter-patch-v${eslintPackageVersion}.js`;
  return nameOfGeneratedPatchFile;
}
