// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftSession } from '../pluginFramework/HeftSession';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import { IBuildStageContext, ICompileSubstage, IPostBuildSubstage } from '../stages/BuildStage';
import { ScopedLogger } from '../pluginFramework/logging/ScopedLogger';
import { IHeftPlugin } from '../pluginFramework/IHeftPlugin';

const PLUGIN_NAME: string = 'serve-command-plugin';

export class ServeCommandPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;
  private _logger!: ScopedLogger;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this._logger = heftSession.requestScopedLogger('serve-command');

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.compile.tap(PLUGIN_NAME, (compile: ICompileSubstage) => {
        compile.hooks.afterEachIteration.tap(PLUGIN_NAME, () => {
          this._logger.terminal.writeLine(`Recompiled!`);
        });
      });

      build.hooks.postBuild.tap(PLUGIN_NAME, (bundle: IPostBuildSubstage) => {
        bundle.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._runCommandAsync(heftSession, heftConfiguration);
        });
      });
    });
  }

  private async _runCommandAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    this._logger.terminal.writeLine(`serve-command-plugin started`);
  }
}
