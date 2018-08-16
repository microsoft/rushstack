// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';
import * as path from 'path';

import { FileConstants } from '@microsoft/node-core-library';

import { ApiDocumenterCommandLine } from './cli/ApiDocumenterCommandLine';

const myPackageJsonFilename: string = path.resolve(path.join(
  __dirname, '..', FileConstants.PackageJson)
);
const myPackageJson: { version: string } = require(myPackageJsonFilename);

console.log(os.EOL + colors.bold(`api-documenter ${myPackageJson.version} `
  + colors.cyan(' - http://aka.ms/extractor') + os.EOL));

const parser: ApiDocumenterCommandLine = new ApiDocumenterCommandLine();

parser.execute();
