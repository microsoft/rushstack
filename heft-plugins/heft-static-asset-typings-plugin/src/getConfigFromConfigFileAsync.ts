// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '@rushstack/heft';
import { InheritanceType, ProjectConfigurationFile } from '@rushstack/heft-config-file';
import type { ITerminal } from '@rushstack/terminal';

import type {
  IResourceStaticAssetTypingsConfigurationJson,
  ISourceStaticAssetTypingsConfigurationJson
} from './types';
import resourceStaticAssetSchema from './schemas/resource-static-asset-typings.schema.json';
import sourceStaticAssetSchema from './schemas/source-static-asset-typings.schema.json';

const configurationFileLoaderByFileName: Map<
  string,
  ProjectConfigurationFile<
    IResourceStaticAssetTypingsConfigurationJson | ISourceStaticAssetTypingsConfigurationJson
  >
> = new Map();

export type FileLoaderType = 'resource' | 'source';

function createConfigurationFileLoader(
  configFileName: string,
  fileLoaderType: FileLoaderType
): ProjectConfigurationFile<
  IResourceStaticAssetTypingsConfigurationJson | ISourceStaticAssetTypingsConfigurationJson
> {
  return new ProjectConfigurationFile<
    IResourceStaticAssetTypingsConfigurationJson | ISourceStaticAssetTypingsConfigurationJson
  >({
    jsonSchemaObject: fileLoaderType === 'resource' ? resourceStaticAssetSchema : sourceStaticAssetSchema,
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
  IResourceStaticAssetTypingsConfigurationJson | ISourceStaticAssetTypingsConfigurationJson | undefined
> {
  let configurationFileLoader:
    | ProjectConfigurationFile<
        IResourceStaticAssetTypingsConfigurationJson | ISourceStaticAssetTypingsConfigurationJson
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
