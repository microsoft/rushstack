// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { argv as clArgs } from 'yargs';
import * as path from 'path';

export const root: string = process.cwd();
export const args: { [flat: string]: boolean | string} = clArgs;

export interface IPackageJSON {
  name: string;
  version: string;
}

export const builtPackage: IPackageJSON = require(path.join(root, 'package.json'));
export const coreBuildPackage: IPackageJSON = require('../package.json');
export const nodeVersion: string = process.version;
