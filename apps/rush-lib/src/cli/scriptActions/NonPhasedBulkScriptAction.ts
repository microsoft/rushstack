// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { NonPhasedProjectTaskSelector } from '../../logic/NonPhasedProjectTaskSelector';
import { ITaskSelectorBaseOptions } from '../../logic/ProjectTaskSelectorBase';
import { BaseBulkScriptAction, IBaseBulkScriptActionOptions } from './BaseBulkScriptAction';

export interface INonPhasedBulkScriptAction extends IBaseBulkScriptActionOptions {
  logFilenameIdentifier: string;
  commandToRun: string;
}

/**
 * This class implements bulk commands which are run individually for each project in the repo,
 * possibly in parallel, with a single command per project.
 */
export class NonPhasedBulkScriptAction extends BaseBulkScriptAction {
  private readonly _logFilenameIdentifier: string;
  private readonly _commandToRun: string;

  public constructor(options: INonPhasedBulkScriptAction) {
    super(options);
    this._logFilenameIdentifier = options.logFilenameIdentifier;
    this._commandToRun = options.commandToRun;
  }

  protected _getTaskSelector(
    baseTaskSelectorOptions: ITaskSelectorBaseOptions
  ): NonPhasedProjectTaskSelector {
    return new NonPhasedProjectTaskSelector({
      ...baseTaskSelectorOptions,
      logFilenameIdentifier: this._logFilenameIdentifier,
      commandToRun: this._commandToRun
    });
  }
}
