import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage, ITypeScriptConfiguration } from '../stages/BuildStage';

const PLUGIN_NAME: string = 'PackageJsonConfigurationPlugin';

export class PackageJsonConfigurationPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.afterConfigureTypeScript.tap(PLUGIN_NAME, () => {
          this._updateTypeScriptConfiguration(heftConfiguration, compile.properties.typeScriptConfiguration);
        });
      });
    });
  }

  private _updateTypeScriptConfiguration(
    heftConfiguration: HeftConfiguration,
    typeScriptConfiguration: ITypeScriptConfiguration
  ): void {
    if (heftConfiguration.projectPackageJson.private !== true) {
      if (typeScriptConfiguration.copyFromCacheMode === undefined) {
        heftConfiguration.terminal.writeVerboseLine(
          'Setting TypeScript copyFromCacheMode to "copy" because the "private" field ' +
            'in package.json is not set to true. Linked files are not handled correctly ' +
            'when package are packed for publishing.'
        );
        // Copy if the package is intended to be published
        typeScriptConfiguration.copyFromCacheMode = 'copy';
      } else if (typeScriptConfiguration.copyFromCacheMode !== 'copy') {
        heftConfiguration.terminal.writeWarningLine(
          `The TypeScript copyFromCacheMode is set to "${typeScriptConfiguration.copyFromCacheMode}", ` +
            'but the the "private" field in package.json is not set to true. ' +
            'Linked files are not handled correctly when package are packed for publishing.'
        );
      }
    }
  }
}
