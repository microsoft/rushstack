// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter, ICommandLineActionOptions } from '@rushstack/ts-command-line';

import { HeftActionBase, IHeftActionBaseOptions } from './HeftActionBase';
import { CleanStage, ICleanStageOptions } from '../../stages/CleanStage';
import { Logging } from '../../utilities/Logging';
import { BuildStage, IBuildStageOptions, IBuildStageStandardParameters } from '../../stages/BuildStage';
import { HeftSession } from '../../pluginFramework/HeftSession';

export class BuildAction extends HeftActionBase {
  protected _watchFlag: CommandLineFlagParameter;
  protected _productionFlag: CommandLineFlagParameter;
  protected _liteFlag: CommandLineFlagParameter;
  private _buildStandardParameters: IBuildStageStandardParameters;
  private _cleanFlag: CommandLineFlagParameter;

  public constructor(
    heftActionOptions: IHeftActionBaseOptions,
    heftSession: HeftSession,
    commandLineActionOptions: ICommandLineActionOptions = {
      actionName: 'build',
      summary: 'Build the project.',
      documentation: ''
    }
  ) {
    super(commandLineActionOptions, heftActionOptions, heftSession);
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._buildStandardParameters = BuildStage.defineStageStandardParameters(this);
    this._productionFlag = this._buildStandardParameters.productionFlag;
    this._liteFlag = this._buildStandardParameters.liteFlag;

    this._watchFlag = this.defineFlagParameter({
      parameterLongName: '--watch',
      description: 'If provided, run tests in watch mode.'
    });

    this._cleanFlag = this.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the package before building.'
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
      watchMode: this._watchFlag.value,
      serveMode: false
    };
    await buildStage.initializeAsync(buildStageOptions);
    await buildStage.executeAsync();
  }
}
