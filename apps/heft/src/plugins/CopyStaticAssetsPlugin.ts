// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { Terminal } from '@rushstack/node-core-library';

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { CoreConfigFiles, IExtendedSharedCopyConfiguration } from '../utilities/CoreConfigFiles';
import { ITypeScriptConfigurationJson } from './TypeScriptPlugin/TypeScriptPlugin';
import { CopyFilesPlugin } from './CopyFilesPlugin';

const PLUGIN_NAME: string = 'CopyStaticAssetsPlugin';

export class CopyStaticAssetsPlugin extends CopyFilesPlugin {
  /**
   * @override
   */
  public readonly pluginName: string = PLUGIN_NAME;

  /**
   * @override
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          const logger: ScopedLogger = heftSession.requestScopedLogger('copy-static-assets');

          const copyStaticAssetsConfiguration: IExtendedSharedCopyConfiguration = await this._loadCopyStaticAssetsConfigurationAsync(
            logger.terminal,
            heftConfiguration
          );

          await this.runCopyAsync({
            logger,
            copyConfigurations: [copyStaticAssetsConfiguration],
            buildFolder: heftConfiguration.buildFolder,
            watchMode: build.properties.watchMode
          });
        });
      });
    });
  }

  private async _loadCopyStaticAssetsConfigurationAsync(
    terminal: Terminal,
    heftConfiguration: HeftConfiguration
  ): Promise<IExtendedSharedCopyConfiguration> {
    const typescriptConfiguration:
      | ITypeScriptConfigurationJson
      | undefined = await CoreConfigFiles.typeScriptConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
      terminal,
      heftConfiguration.buildFolder,
      heftConfiguration.rigConfig
    );

    const destinationFolders: string[] = ['lib'];
    for (const emitModule of typescriptConfiguration?.additionalModuleKindsToEmit || []) {
      destinationFolders.push(emitModule.outFolderName);
    }

    return {
      ...typescriptConfiguration?.staticAssetsToCopy,

      // For now - these may need to be revised later
      sourceFolder: 'src',
      destinationFolders,
      flatten: false,
      hardlink: false
    };
  }
}
