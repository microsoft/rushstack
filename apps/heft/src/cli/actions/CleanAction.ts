// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { CommandLineFlagParameter } from '@rushstack/ts-command-line';

import { HeftActionBase, IHeftActionBaseOptions } from './HeftActionBase';
import { HeftSession } from '../../pluginFramework/HeftSession';
import { CleanStage, ICleanStageOptions } from '../../stages/CleanStage';

export class CleanAction extends HeftActionBase {
  private _deleteCacheFlag: CommandLineFlagParameter;

  public constructor(options: IHeftActionBaseOptions, heftSession: HeftSession) {
    super(
      {
        actionName: 'clean',
        summary: 'Clean the project',
        documentation: ''
      },
      options,
      heftSession
    );
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._deleteCacheFlag = this.defineFlagParameter({
      parameterLongName: '--clear-cache',
      description:
        "If this flag is provided, the compiler cache will also be cleared. This isn't dangerous, " +
        'but may lead to longer compile times'
    });
  }

  protected async actionExecuteAsync(): Promise<void> {
    const cleanStage: CleanStage = this.heftSession.cleanStage;

    const cleanStageOptions: ICleanStageOptions = {
      deleteCache: this._deleteCacheFlag.value
    };
    await cleanStage.initializeAsync(cleanStageOptions);

    await cleanStage.executeAsync();
  }
}
