// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'node:os';

import { PackageJsonLookup } from '@rushstack/node-core-library';
import { Colorize } from '@rushstack/terminal';

import { ApiDocumenterCommandLine } from './cli/ApiDocumenterCommandLine.ts';

const myPackageVersion: string = PackageJsonLookup.loadOwnPackageJson(__dirname).version;

console.log(
  os.EOL +
    Colorize.bold(
      `api-documenter ${myPackageVersion} ` + Colorize.cyan(' - https://api-extractor.com/') + os.EOL
    )
);

const parser: ApiDocumenterCommandLine = new ApiDocumenterCommandLine();

parser.executeAsync().catch(console.error); // CommandLineParser.executeAsync() should never reject the promise
