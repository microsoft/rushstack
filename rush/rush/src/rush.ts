// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as colors from 'colors';
import { rushVersion } from '@microsoft/rush-lib';

import RushCommandLineParser from './actions/RushCommandLineParser';

console.log(os.EOL + colors.bold(`Rush Multi-Package Build Tool ${rushVersion}`)
  + os.EOL);

const parser: RushCommandLineParser = new RushCommandLineParser();

parser.execute();
