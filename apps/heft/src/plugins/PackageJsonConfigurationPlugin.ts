import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';
import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { ITypescriptConfiguration, IBuildActionContext, ICompileStage } from '../cli/actions/BuildAction';
import { IPackageJson } from '@rushstack/node-core-library';

const PLUGIN_NAME: string = 'PackageJsonConfigurationPlugin';

export class PackageJsonConfigurationPlugin implements IHeftPlugin {
  public readonly displayName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildActionContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileStage) => {
        compile.hooks.afterConfigureTypescript.tap(PLUGIN_NAME, () => {
          this._updateTypescriptConfiguration(
            heftConfiguration.projectPackageJson,
            compile.properties.typescriptConfiguration
          );
        });
      });
    });
  }

  private _updateTypescriptConfiguration(
    projectPackageJson: IPackageJson,
    typescriptConfiguration: ITypescriptConfiguration
  ): void {
    if (projectPackageJson.private !== true) {
      // Copy if the package is intended to be published
      typescriptConfiguration.copyFromCacheMode = 'copy';
    }
  }
}
