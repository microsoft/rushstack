// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as path from 'path';
import IPackageJson from './utilities/IPackageJson';

const myPackageJsonFilename: string = path.resolve(path.join(
  __dirname, '..', 'package.json')
);
const myPackageJson: IPackageJson = require(myPackageJsonFilename);

/**
 * The currently executing version of the "rush-lib" library.
 * This is the same as the Rush tool version for that release.
 * @public
 */
const rushVersion: string = myPackageJson.version;

export default rushVersion;
