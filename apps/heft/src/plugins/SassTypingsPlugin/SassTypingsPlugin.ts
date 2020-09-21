import * as path from 'path';
import { FileSystem } from '@rushstack/node-core-library';

import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IBuildStageContext, IPreCompileSubstage } from '../../stages/BuildStage';
import { HeftConfigFiles } from '../../utilities/HeftConfigFiles';
import { ISassConfiguration, SassTypingsGenerator } from './SassTypingsGenerator';

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
          const sassConfiguration: ISassConfiguration = await this._loadSassConfigurationAsync(
            heftConfiguration.buildFolder
          );
          const sassTypingsGenerator: SassTypingsGenerator = new SassTypingsGenerator({
            buildFolder: heftConfiguration.buildFolder,
            sassConfiguration
          });
          await sassTypingsGenerator.generateTypingsAsync();
          if (build.properties.watchMode) {
            await sassTypingsGenerator.runWatcherAsync();
          }
        });
      });
    });
  }

  private async _loadSassConfigurationAsync(buildFolder: string): Promise<ISassConfiguration> {
    let sassConfigurationJson: ISassConfigurationJson | undefined;
    try {
      sassConfigurationJson = await HeftConfigFiles.sassConfigurationFileLoader.loadConfigurationFileAsync(
        path.resolve(buildFolder, '.heft', 'sass.json')
      );
    } catch (e) {
      if (!FileSystem.isNotExistError(e)) {
        throw e;
      }
    }

    return {
      ...sassConfigurationJson
    };
  }
}
