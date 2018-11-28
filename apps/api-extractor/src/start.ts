// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';

import { ApiExtractorCommandLine } from './cli/ApiExtractorCommandLine';
import { Extractor } from './extractor/Extractor';

const myPackageVersion: string = Extractor.version;

console.log(os.EOL + colors.bold(`api-extractor ${myPackageVersion} `
  + colors.cyan(' - http://aka.ms/extractor') + os.EOL));

const parser: ApiExtractorCommandLine = new ApiExtractorCommandLine();

parser.execute();
