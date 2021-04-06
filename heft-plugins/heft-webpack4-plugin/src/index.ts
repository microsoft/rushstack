// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftConfiguration, HeftSession, IHeftPlugin, ScopedLogger } from '@rushstack/heft';
import { IPackageJson, PackageJsonLookup } from '@rushstack/node-core-library';

export {
  IWebpackConfigurationWithDevServer,
  IWebpackConfiguration,
  IWebpackBuildStageProperties,
  IWebpackBundleSubstageProperties,
  WEBPACK_STATS_SYMBOL
} from './shared';

const PLUGIN_NAME: string = 'incorrect-webpack-specification';

class IncorrectlySpecifiedPluginPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.heftLifecycle.tap(PLUGIN_NAME, (lifecycle) => {
      lifecycle.hooks.toolStart.tap(PLUGIN_NAME, () => {
        const logger: ScopedLogger = heftSession.requestScopedLogger(PLUGIN_NAME);
        const packageJson: IPackageJson = PackageJsonLookup.loadOwnPackageJson(__dirname);
        logger.emitError(
          new Error(
            `The "${packageJson.name}" plugin package is not referenced correctly. ` +
              'It must be specified as two entries in config/heft.json: ' +
              `"${packageJson.name}/lib/BasicConfigureWebpackPlugin" and "${packageJson.name}/lib/WebpackPlugin"`
          )
        );
      });
    });
  }
}

/**
 * @internal
 */
export default new IncorrectlySpecifiedPluginPlugin();
