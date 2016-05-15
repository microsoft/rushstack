/**
 * @file rush.ts
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 *
 * Defines routing for the rush tool
 */

/// <reference path="../typings/tsd.d.ts" />
import * as os from 'os';
import * as path from 'path';
import * as colors from 'colors';

import RushCommandLineParser from './actions/RushCommandLineParser';
import Utilities from './utilities/Utilities';

//try {
  const myPackageJsonFilename: string = path.resolve(path.join(
    module.filename, '..', '..', 'package.json')
  );
  const myPackageJson: PackageJson = require(myPackageJsonFilename);

  console.log(os.EOL + colors.bold(`Rush Multi-Package Build Tool ${myPackageJson.version}`)
    + os.EOL);

  const parser: RushCommandLineParser = new RushCommandLineParser();

  parser.execute();

//} catch (error) {
//  Utilities.exitWithError(error);
//}
