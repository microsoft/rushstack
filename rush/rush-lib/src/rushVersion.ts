/**
 * @Copyright (c) Microsoft Corporation.  All rights reserved.
 */

/// <reference path="../typings/tsd.d.ts" />
import * as path from 'path';

const myPackageJsonFilename: string = path.resolve(path.join(
  module.filename, '..', '..', 'package.json')
);
const myPackageJson: PackageJson = require(myPackageJsonFilename);

const rushVersion: string = myPackageJson.version;

export default rushVersion;
