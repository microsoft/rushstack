// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IBuildStageContext, IPreCompileSubstage } from '../../stages/BuildStage';
import { ISassConfiguration, SassTypingsGenerator } from './SassTypingsGenerator';
import { CoreConfigFiles } from '../../utilities/CoreConfigFiles';
import { ScopedLogger } from '../../pluginFramework/logging/ScopedLogger';

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
          await this._runSassTypingsGenerator(heftSession, heftConfiguration, build.properties.watchMode);
        });
      });
    });
  }

  private async _runSassTypingsGenerator(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration,
    isWatchMode: boolean
  ): Promise<void> {
    const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
      heftSession,
      heftConfiguration
    );
    const sassTypingsGenerator: SassTypingsGenerator = new SassTypingsGenerator({
      buildFolder: heftConfiguration.buildFolder,
      sassConfiguration
    });
    await sassTypingsGenerator.generateTypingsAsync();
    if (isWatchMode) {
      await sassTypingsGenerator.runWatcherAsync();
    }
  }

  private async _loadSassConfigurationAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<ISassConfiguration> {
    const { buildFolder } = heftConfiguration;
    const logger: ScopedLogger = heftSession.requestScopedLogger('sass-typings-plugin');
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
