// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { FileSystem } from '@rushstack/node-core-library';

import type { IExtractorMetadataJson } from '../../../PackageExtractor';
import { EXTRACTOR_METADATA_FILENAME } from '../../../PathConstants';

export async function getExtractorMetadataAsync(): Promise<IExtractorMetadataJson> {
  const extractorMetadataPath: string = `${__dirname}/${EXTRACTOR_METADATA_FILENAME}`;
  const extractorMetadataJson: string = await FileSystem.readFileAsync(extractorMetadataPath);
  const extractorMetadataObject: IExtractorMetadataJson = JSON.parse(extractorMetadataJson);
  return extractorMetadataObject;
}
