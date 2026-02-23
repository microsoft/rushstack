// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '@rushstack/heft';
import type { ITerminal } from '@rushstack/terminal';

export interface IStaticAssetTypingsConfigurationJson {
  fileExtensions: string[];
  generatedTsFolder?: string;
  secondaryGeneratedTsFolders?: string[];
  sourceFolderPath?: string;
}

export type StaticAssetConfigurationFileLoader = (
  terminal: ITerminal,
  slashNormalizedBuildFolderPath: string,
  rigConfig: HeftConfiguration['rigConfig']
) => Promise<IStaticAssetTypingsConfigurationJson | undefined>;
