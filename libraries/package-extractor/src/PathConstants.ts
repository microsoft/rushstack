// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { PackageJsonLookup } from '@rushstack/node-core-library';

export const CREATE_LINKS_SCRIPT_FILENAME: 'create-links.js' = 'create-links.js';

export const EXTRACTOR_METADATA_FILENAME: 'extractor-metadata.json' = 'extractor-metadata.json';

const packageExtractorFolderRootPath: string = PackageJsonLookup.instance.tryGetPackageFolderFor(__dirname)!;
export const SCRIPTS_FOLDER_PATH: string = `${packageExtractorFolderRootPath}/dist/scripts`;
