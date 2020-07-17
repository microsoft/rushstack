// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IHeftActionBaseOptions, HeftActionBase } from './HeftActionBase';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { IBuildStageStandardParameters, BuildStage, IBuildStageOptions } from '../../stages/BuildStage';
import { CommandLineFlagParameter } from '@rushstack/ts-command-line';
import { ICleanStageOptions, CleanStage } from '../../stages/CleanStage';
import { Logging } from '../../utilities/Logging';

export class StartAction extends HeftActionBase {
  private _buildStandardParameters: IBuildStageStandardParameters;
  private _cleanFlag: CommandLineFlagParameter;

  public constructor(heftActionOptions: IHeftActionBaseOptions, heftSession: HeftSession) {
    super(
      {
        actionName: 'start',
        summary: 'Run the local server for the current project',
        documentation: ''
      },
      heftActionOptions,
      heftSession
    );
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._buildStandardParameters = BuildStage.defineStageStandardParameters(this);

    this._cleanFlag = this.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the package before starting the development server.'
    });
  }

  protected async actionExecuteAsync(): Promise<void> {
    if (this._cleanFlag.value) {
      const cleanStage: CleanStage = this.heftSession.cleanStage;
      const cleanStageOptions: ICleanStageOptions = {};
      await cleanStage.initializeAsync(cleanStageOptions);

      await Logging.runFunctionWithLoggingBoundsAsync(
        this.terminal,
        'Clean',
        async () => await cleanStage.executeAsync()
      );
    }

    const buildStage: BuildStage = this.heftSession.buildStage;
    const buildStageOptions: IBuildStageOptions = {
      ...BuildStage.getOptionsFromStandardParameters(this._buildStandardParameters),
      watchMode: true,
      serveMode: true
    };
    await buildStage.initializeAsync(buildStageOptions);
    await buildStage.executeAsync();
  }
}
