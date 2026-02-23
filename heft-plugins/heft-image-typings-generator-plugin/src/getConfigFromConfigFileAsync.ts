// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { HeftConfiguration } from '@rushstack/heft';
import { ConfigurationFile, InheritanceType } from '@rushstack/heft-config-file';
import type { ITerminal } from '@rushstack/terminal';

import type { IStaticAssetTypingsConfigurationJson } from './types';
import staticAssetSchema from './schemas/static-asset-typings.schema.json';

const configurationFileLoaderByFileName: Map<
  string,
  ConfigurationFile<IStaticAssetTypingsConfigurationJson>
> = new Map();

function createConfigurationFileLoader(
  configFileName: string
): ConfigurationFile<IStaticAssetTypingsConfigurationJson> {
  return new ConfigurationFile<IStaticAssetTypingsConfigurationJson>({
    jsonSchemaObject: staticAssetSchema,
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
  terminal: ITerminal,
  slashNormalizedBuildFolderPath: string,
  rigConfig: HeftConfiguration['rigConfig']
): Promise<IStaticAssetTypingsConfigurationJson | undefined> {
  let configurationFileLoader: ConfigurationFile<IStaticAssetTypingsConfigurationJson> | undefined =
    configurationFileLoaderByFileName.get(configFileName);
  if (!configurationFileLoader) {
    configurationFileLoader = createConfigurationFileLoader(configFileName);
    configurationFileLoaderByFileName.set(configFileName, configurationFileLoader);
  }

  return configurationFileLoader.tryLoadConfigurationFileForProjectAsync(
    terminal,
    slashNormalizedBuildFolderPath,
    rigConfig
  );
}
