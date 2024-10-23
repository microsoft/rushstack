// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import path from 'node:path';
import { FileSystem } from '@rushstack/node-core-library';
import type { IExtractorMetadataJson } from '../../../PackageExtractor';
import { TARGET_ROOT_SCRIPT_RELATIVE_PATH } from './constants';

export function getTargetRootFolder(): string {
  // This script is bundled and dropped into the extraction target folder, so we can use the __dirname
  // of this script combined with the relative path to determine the target root folder. The relative
  // path is updated in the script when the script is included in the extraction
  return path.resolve(__dirname, TARGET_ROOT_SCRIPT_RELATIVE_PATH);
}

export async function getExtractorMetadataAsync(): Promise<IExtractorMetadataJson> {
  const extractorMetadataPath: string = `${__dirname}/extractor-metadata.json`;
  const extractorMetadataJson: string = await FileSystem.readFileAsync(extractorMetadataPath);
  const extractorMetadataObject: IExtractorMetadataJson = JSON.parse(extractorMetadataJson);
  return extractorMetadataObject;
}
