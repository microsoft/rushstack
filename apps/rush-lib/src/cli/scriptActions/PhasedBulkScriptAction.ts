// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { IPhasedCommandJson } from '../../api/CommandLineJson';
import { PhasedProjectTaskSelector } from '../../logic/PhasedProjectTaskSelector';
import { ITaskSelectorOptions } from '../../logic/ProjectTaskSelectorBase';
import { BulkScriptAction, IBaseBulkScriptActionOptions } from './BulkScriptAction';

export interface IPhasedBulkScriptAction extends IBaseBulkScriptActionOptions {
  command: IPhasedCommandJson;
}

/**
 * This class implements bulk commands which are run individually for each project in the repo,
 * possibly in parallel, with a single command per project.
 */
export class PhasedBulkScriptAction extends BulkScriptAction {
  private readonly _logFilenameIdentifier: string;
  private readonly _commandToRun: string;

  public constructor(options: IPhasedBulkScriptAction) {
    super(options);
    options;
    this._logFilenameIdentifier = options.logFilenameIdentifier;
    this._commandToRun = options.commandToRun;
  }

  protected _getTaskSelector(baseTaskSelectorOptions: ITaskSelectorOptions): PhasedProjectTaskSelector {
    return new PhasedProjectTaskSelector({
      ...baseTaskSelectorOptions,
      logFilenameIdentifier: this._logFilenameIdentifier,
      commandToRun: this._commandToRun
    });
  }
}
