// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  ICommandLineActionOptions
} from '@rushstack/ts-command-line';

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionDataBase } from './HeftActionBase';

export interface IBuildActionOptions extends IHeftActionBaseOptions {}

/**
 * @public
 */
export class BuildHooks extends ActionHooksBase {}

/**
 * @public
 */
export interface IBuildActionData extends IActionDataBase<BuildHooks> {
  productionFlag: boolean;
  liteFlag: boolean;
  locale?: string;
  cleanFlag: boolean;
  noTest: boolean;
  maxOldSpaceSize?: string;
  verboseFlag: boolean;
  watchMode: boolean;
}

export class BuildAction extends HeftActionBase<IBuildActionData, BuildHooks> {
  protected _noTestFlag: CommandLineFlagParameter;
  protected _watchFlag: CommandLineFlagParameter;
  private _productionFlag: CommandLineFlagParameter;
  private _localeParameter: CommandLineStringParameter;
  private _liteFlag: CommandLineFlagParameter;
  private _cleanFlag: CommandLineFlagParameter;
  private _maxOldSpaceSizeParameter: CommandLineStringParameter;

  public constructor(
    heftActionOptions: IBuildActionOptions,
    commandLineOptions: ICommandLineActionOptions = {
      actionName: 'build',
      summary: 'Build the project.',
      documentation: ''
    }
  ) {
    super(commandLineOptions, heftActionOptions, BuildHooks);
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._productionFlag = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'If specified, build ship/production output'
    });

    this._localeParameter = this.defineStringParameter({
      parameterLongName: '--locale',
      argumentName: 'LOCALE',
      description: 'Only build the specified locale, if applicable.'
    });

    this._liteFlag = this.defineFlagParameter({
      parameterLongName: '--lite',
      parameterShortName: '-l',
      description: 'Perform a minimal build, skipping optional steps like linting.'
    });

    this._cleanFlag = this.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the package before rebuilding.'
    });

    this._noTestFlag = this.defineFlagParameter({
      parameterLongName: '--notest',
      description: 'If specified, run the build without testing.'
    });

    this._maxOldSpaceSizeParameter = this.defineStringParameter({
      parameterLongName: '--max-old-space-size',
      argumentName: 'SIZE',
      description: 'Used to specify the max old space size.'
    });

    this._watchFlag = this.defineFlagParameter({
      parameterLongName: '--watch',
      description: 'If provided, run tests in watch mode.'
    });
  }

  protected async actionExecute(actionData: IBuildActionData): Promise<void> {
    throw new Error('Not implemented yet...');
  }

  protected getDefaultActionData(): Omit<IBuildActionData, 'hooks'> {
    return {
      productionFlag: this._productionFlag.value,
      liteFlag: this._liteFlag.value,
      locale: this._localeParameter.value,
      cleanFlag: this._cleanFlag.value,
      noTest: this._noTestFlag.value,
      maxOldSpaceSize: this._maxOldSpaceSizeParameter.value,
      verboseFlag: this.verboseFlag.value,
      watchMode: this._watchFlag.value
    };
  }
}
