import { IHeftPlugin } from '../../pluginFramework/IHeftPlugin';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { HeftConfiguration } from '../../configuration/HeftConfiguration';
import { IBuildStageContext, IPreCompileSubstage } from '../../stages/BuildStage';

import { SassTypingsGenerator } from './SassTypingsGenerator';

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
          const sassTypingsGenerator: SassTypingsGenerator = new SassTypingsGenerator({
            buildFolder: heftConfiguration.buildFolder
          });
          await sassTypingsGenerator.generateTypingsAsync();
          if (build.properties.watchMode) {
            await sassTypingsGenerator.runWatcherAsync();
          }
        });
      });
    });
  }
}
