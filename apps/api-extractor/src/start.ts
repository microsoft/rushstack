// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import { PackageJsonLookup } from '@microsoft/node-core-library';

import { ApiExtractorCommandLine } from './cli/ApiExtractorCommandLine';

const myPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log(os.EOL + colors.bold(`api-extractor ${myPackageVersion} `
  + colors.cyan(' - http://aka.ms/extractor') + os.EOL));

const parser: ApiExtractorCommandLine = new ApiExtractorCommandLine();

parser.execute();
