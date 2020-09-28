// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import colors from 'colors';

import { PackageJsonLookup } from '@rushstack/node-core-library';

import { ApiDocumenterCommandLine } from './cli/ApiDocumenterCommandLine';

const myPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log(
  os.EOL +
    colors.bold(`api-documenter ${myPackageVersion} ` + colors.cyan(' - https://api-extractor.com/') + os.EOL)
);

const parser: ApiDocumenterCommandLine = new ApiDocumenterCommandLine();

parser.execute().catch(console.error); // CommandLineParser.execute() should never reject the promise
