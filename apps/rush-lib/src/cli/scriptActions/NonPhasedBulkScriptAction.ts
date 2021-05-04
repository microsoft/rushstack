// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  NonPhasedCommandTaskSelector,
  INonPhasedCommandTaskSelectorOptions
} from '../../logic/taskSelector/NonPhasedCommandTaskSelector';
import { ITaskSelectorOptions } from '../../logic/taskSelector/TaskSelectorBase';
import { Utilities } from '../../utilities/Utilities';
import { IBaseScriptActionOptions } from './BaseScriptAction';
import { BulkScriptActionBase } from './BulkScriptActionBase';

export interface INonPhasedBulkScriptActionOptions extends IBaseScriptActionOptions {
  enableParallelism: boolean;
  ignoreDependencyOrder: boolean;
  incremental: boolean;
  allowWarningsInSuccessfulBuild: boolean;
  watchForChanges: boolean;
  disableBuildCache: boolean;
  ignoreMissingScript: boolean;

  /**
   * Optional command to run. Otherwise, use the `actionName` as the command to run.
   */
  commandToRun?: string;
}

export class NonPhasedBulkScriptAction extends BulkScriptActionBase {
  private readonly _ignoreMissingScript: boolean;
  private readonly _commandToRun: string;

  public constructor(options: INonPhasedBulkScriptActionOptions) {
    super(options);

    this._commandToRun = options.commandToRun || options.actionName;
    this._ignoreMissingScript = options.ignoreMissingScript;
  }

  public _getTaskSelector(taskSelectorOptions: ITaskSelectorOptions): NonPhasedCommandTaskSelector {
    // Collect all custom parameter values
    const customParameterValues: string[] = [];
    for (const customParameter of this.customParameters) {
      customParameter.appendToArgList(customParameterValues);
    }

    const nonPhasedCommandTaskSelectorOptions: INonPhasedCommandTaskSelectorOptions = {
      commandName: this.actionName,
      commandToRun: this._commandToRun,
      customParameterValues,
      isIncrementalBuildAllowed: this._isIncrementalBuildAllowed,
      ignoreMissingScript: this._ignoreMissingScript,
      ignoreDependencyOrder: this._ignoreDependencyOrder,
      packageDepsFilename: Utilities.getPackageDepsFilenameForCommand(this._commandToRun)
    };

    return new NonPhasedCommandTaskSelector(taskSelectorOptions, nonPhasedCommandTaskSelectorOptions);
  }
}
