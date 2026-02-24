// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import type { ITerminal } from '@rushstack/terminal';

export interface IAssetsInlineConfigPluginOptionsBase<
  TConfig extends IResourceStaticAssetTypingsConfigurationJson
> {
  configType: 'inline';
  /**
   * The inline configuration object.
   */
  config: TConfig;
}

export interface IAssetsFileConfigPluginOptions {
  configType: 'file';
  /**
   * The name of the riggable config file in the config/ folder.
   */
  configFileName: string;
}

export type IAssetPluginOptions<TConfig extends IResourceStaticAssetTypingsConfigurationJson> =
  | IAssetsInlineConfigPluginOptionsBase<TConfig>
  | IAssetsFileConfigPluginOptions;

export interface IResourceStaticAssetTypingsConfigurationJson {
  fileExtensions: string[];
  generatedTsFolders?: string[];
  sourceFolderPath?: string;
}

export interface ISourceStaticAssetTypingsConfigurationJson
  extends IResourceStaticAssetTypingsConfigurationJson {
  cjsOutputFolders: string[];
  esmOutputFolders?: string[];
}

export type StaticAssetConfigurationFileLoader = (
  terminal: ITerminal
) => Promise<IResourceStaticAssetTypingsConfigurationJson | undefined>;
