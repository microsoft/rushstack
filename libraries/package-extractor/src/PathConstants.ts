// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

const packageExtractorFolderRootPath: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
export const createLinksScriptFilename: 'create-links.js' = 'create-links.js';
export const scriptsFolderPath: string = `${packageExtractorFolderRootPath}/dist/scripts`;
