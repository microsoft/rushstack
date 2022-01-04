// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { BuildAction } from './BuildAction';
import { IHeftActionBaseOptions } from './HeftActionBase';
import { TestStage, ITestStageOptions } from '../../stages/TestStage';
import { Logging } from '../../utilities/Logging';

export class TestAction extends BuildAction {
  private _noTestFlag!: CommandLineFlagParameter;
  private _noBuildFlag!: CommandLineFlagParameter;
  /*
  // Temporary workaround for https://github.com/microsoft/rushstack/issues/2759
  private _passWithNoTests!: CommandLineFlagParameter;
  */

  public constructor(heftActionOptions: IHeftActionBaseOptions) {
    super(heftActionOptions, {
      actionName: 'test',
      summary: 'Build the project and run tests.',
      documentation: ''
    });
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._noTestFlag = this.defineFlagParameter({
      parameterLongName: '--no-test',
      description: 'If specified, run the build without testing.',
      undocumentedSynonyms: ['--notest'] // To be removed
    });

    this._noBuildFlag = this.defineFlagParameter({
      parameterLongName: '--no-build',
      description: 'If provided, only run tests. Do not build first.'
    });
  }

  protected async actionExecuteAsync(): Promise<void> {
    const shouldBuild: boolean = !this._noBuildFlag.value;
    const watchMode: boolean = this._watchFlag.value;
    const noTest: boolean = this._noTestFlag.value;
    const lite: boolean = this._liteFlag.value;

    if (watchMode) {
      if (!shouldBuild) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._noBuildFlag.longName}`);
      } else if (noTest) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._noTestFlag.longName}`);
      } else if (lite) {
        throw new Error(`${this._watchFlag.longName} is not compatible with ${this._liteFlag.longName}`);
      }
    }

    if (!shouldBuild) {
      if (noTest) {
        throw new Error(`${this._noTestFlag.longName} is not compatible with ${this._noBuildFlag.longName}`);
      }
    }

    if (noTest || lite /* "&& shouldBuild" is implied */) {
      await super.actionExecuteAsync();
    } else {
      const testStage: TestStage = this.stages.testStage;
      const testStageOptions: ITestStageOptions = {
        watchMode: this._watchFlag.value
      };
      await testStage.initializeAsync(testStageOptions);

      if (shouldBuild) {
        await super.actionExecuteAsync();

        if (
          this.loggingManager.errorsHaveBeenEmitted &&
          !watchMode // Kick off tests in --watch mode
        ) {
          return;
        }

        await Logging.runFunctionWithLoggingBoundsAsync(
          this.terminal,
          'Test',
          async () => await testStage.executeAsync()
        );
      } else {
        await testStage.executeAsync();
      }
    }
  }
}
