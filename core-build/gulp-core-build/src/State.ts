// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { argv as clArgs } from 'yargs';
import * as path from 'path';
import { FileConstants } from '@microsoft/node-core-library';

export const root: string = process.cwd();
export const args: { [flat: string]: boolean | string } = clArgs;

export interface IPackageJSON {
  name?: string;
  version?: string;
  directories: {
    packagePath: string | undefined;
  } | undefined;
}

// There appears to be a TypeScript compiler bug that isn't allowing us to say
//  IPackageJSON | undefined here, so let's create a stub package.json here instead.
// @todo: remove this when the compiler is fixed.
let packageJson: IPackageJSON = {
  directories: {
    packagePath: undefined
  }
};
try {
  packageJson = require(path.join(root, FileConstants.PackageJson));
} catch (e) {
  // Package.json probably doesn't exit
}

export const builtPackage: IPackageJSON = packageJson;
export const coreBuildPackage: IPackageJSON = require('../package.json');
export const nodeVersion: string = process.version;
