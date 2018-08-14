// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';
import * as path from 'path';
import {
  JsonFile,
  FileConstants
} from '@microsoft/node-core-library';

import { RushStackCommandLine } from './cli/RushStackCommandLine';

const myPackageJsonFilename: string = path.resolve(path.join(
  __dirname, '..', FileConstants.PackageJson)
);
const myPackageJson: { version: string } = JsonFile.load(myPackageJsonFilename);

console.log(os.EOL + colors.bold(`rush-stack ${myPackageJson.version} `
  + colors.cyan(' - http://rushstack.io') + os.EOL));

const parser: RushStackCommandLine = new RushStackCommandLine();

parser.execute();
