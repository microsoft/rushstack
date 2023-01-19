// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See the @microsoft/rush package's LICENSE file for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

/**
 * The currently-executing rush-lib package's root folder path.
 */
export const rushLibFolderRootPath: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;

/**
 * The path to the assets folder in rush-lib.
 */
export const assetsFolderPath: string = `${rushLibFolderRootPath}/assets`;

/**
 * The folder name ("scripts") where the scripts in rush-lib are built.
 */
export const scriptsFolderName: string = 'scripts';

export const pnpmfileShimFilename: string = 'PnpmfileShim.js';
export const installRunScriptFilename: string = 'install-run.js';
export const installRunRushScriptFilename: string = 'install-run-rush.js';
export const installRunRushxScriptFilename: string = 'install-run-rushx.js';
export const installRunRushPnpmScriptFilename: string = 'install-run-rush-pnpm.js';

/**
 * The path to the scripts folder in rush-lib/dist.
 */
export const scriptsFolderPath: string = `${rushLibFolderRootPath}/dist/${scriptsFolderName}`;
