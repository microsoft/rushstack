// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';
import { PackageJsonLookup } from '@microsoft/node-core-library';

import { RushStackCommandLine } from './cli/RushStackCommandLine';

const currentPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log(
  os.EOL +
    colors.bold(`rush-stack ${currentPackageVersion} ` + colors.cyan(' - http://rushstack.io') + os.EOL)
);

const parser: RushStackCommandLine = new RushStackCommandLine();

parser.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
