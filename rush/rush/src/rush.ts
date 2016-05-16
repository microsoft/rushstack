/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

/// <reference path="../typings/tsd.d.ts" />

import * as os from 'os';
import * as path from 'path';
import * as colors from 'colors';

import RushCommandLineParser from './actions/RushCommandLineParser';

const myPackageJsonFilename: string = path.resolve(path.join(
  module.filename, '..', '..', 'package.json')
);
const myPackageJson: PackageJson = require(myPackageJsonFilename);

console.log(os.EOL + colors.bold(`Rush Multi-Package Build Tool ${myPackageJson.version}`)
  + os.EOL);

const parser: RushCommandLineParser = new RushCommandLineParser();

parser.execute();
