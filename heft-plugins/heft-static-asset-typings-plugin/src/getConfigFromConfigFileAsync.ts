// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '@rushstack/heft';
import { InheritanceType, ProjectConfigurationFile } from '@rushstack/heft-config-file';
import type { ITerminal } from '@rushstack/terminal';

import type {
  IBinaryStaticAssetTypingsConfigurationJson,
  ITextStaticAssetTypingsConfigurationJson
} from './types';
import binaryStaticAssetSchema from './schemas/binary-assets-options.schema.json';
import textStaticAssetSchema from './schemas/text-assets-options.schema.json';

const configurationFileLoaderByFileName: Map<
  string,
  ProjectConfigurationFile<
    IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson
  >
> = new Map();

export type FileLoaderType = 'binary' | 'text';

function createConfigurationFileLoader(
  configFileName: string,
  fileLoaderType: FileLoaderType
): ProjectConfigurationFile<
  IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson
> {
  return new ProjectConfigurationFile<
    IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson
  >({
    jsonSchemaObject: fileLoaderType === 'binary' ? binaryStaticAssetSchema : textStaticAssetSchema,
    projectRelativeFilePath: `config/${configFileName}`,
    propertyInheritance: {
      fileExtensions: {
        inheritanceType: InheritanceType.append
      }
    }
  });
}

export function getConfigFromConfigFileAsync(
  configFileName: string,
  fileLoaderType: FileLoaderType,
  terminal: ITerminal,
  slashNormalizedBuildFolderPath: string,
  rigConfig: HeftConfiguration['rigConfig']
): Promise<
  IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson | undefined
> {
  let configurationFileLoader:
    | ProjectConfigurationFile<
        IBinaryStaticAssetTypingsConfigurationJson | ITextStaticAssetTypingsConfigurationJson
      >
    | undefined = configurationFileLoaderByFileName.get(configFileName);
  if (!configurationFileLoader) {
    configurationFileLoader = createConfigurationFileLoader(configFileName, fileLoaderType);
    configurationFileLoaderByFileName.set(configFileName, configurationFileLoader);
  }

  return configurationFileLoader.tryLoadConfigurationFileForProjectAsync(
    terminal,
    slashNormalizedBuildFolderPath,
    rigConfig
  );
}
