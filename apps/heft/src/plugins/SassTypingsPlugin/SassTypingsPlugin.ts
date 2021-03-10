// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IBuildStageContext, IPreCompileSubstage } from '../../stages/BuildStage';
import { ISassConfiguration, SassTypingsGenerator } from './SassTypingsGenerator';
import { CoreConfigFiles } from '../../utilities/CoreConfigFiles';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';
import { Async } from '../../utilities/Async';

export interface ISassConfigurationJson extends ISassConfiguration {}

const PLUGIN_NAME: string = 'SassTypingsPlugin';

export class SassTypingsPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  /**
   * Generate typings for Sass files before TypeScript compilation.
   */
  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runSassTypingsGeneratorAsync(
            heftSession,
            heftConfiguration,
            build.properties.watchMode
          );
        });
      });
    });
  }

  private async _runSassTypingsGeneratorAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    isWatchMode: boolean
  ): Promise<void> {
    const logger: ScopedLogger = heftSession.requestScopedLogger('sass-typings-generator');
    const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
      heftConfiguration,
      logger
    );
    const sassTypingsGenerator: SassTypingsGenerator = new SassTypingsGenerator({
      buildFolder: heftConfiguration.buildFolder,
      sassConfiguration
    });

    await sassTypingsGenerator.generateTypingsAsync();
    if (isWatchMode) {
      Async.runWatcherWithErrorHandling(async () => await sassTypingsGenerator.runWatcherAsync(), logger);
    }
  }

  private async _loadSassConfigurationAsync(
    heftConfiguration: HeftConfiguration,
    logger: ScopedLogger
  ): Promise<ISassConfiguration> {
    const { buildFolder } = heftConfiguration;
    const sassConfigurationJson:
      | ISassConfigurationJson
      | undefined = await CoreConfigFiles.sassConfigurationFileLoader.tryLoadConfigurationFileForProjectAsync(
      logger.terminal,
      buildFolder,
      heftConfiguration.rigConfig
    );

    return {
      ...sassConfigurationJson
    };
  }
}
