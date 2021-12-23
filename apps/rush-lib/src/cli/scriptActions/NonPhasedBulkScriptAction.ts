// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { RushConfigurationProject } from '../..';
import { NonPhasedProjectTaskSelector } from '../../logic/NonPhasedProjectTaskSelector';
import { ITaskSelectorOptions } from '../../logic/ProjectTaskSelectorBase';
import { Selection } from '../../logic/Selection';
import { BulkScriptAction, IBaseBulkScriptActionOptions } from './BulkScriptAction';

export interface INonPhasedBulkScriptAction extends IBaseBulkScriptActionOptions {}

/**
 * This class implements bulk commands which are run individually for each project in the repo,
 * possibly in parallel, with a single command per project.
 */
export class NonPhasedBulkScriptAction extends BulkScriptAction {
  public constructor(options: INonPhasedBulkScriptAction) {
    super(options);
  }

  protected _getTaskSelector(baseTaskSelectorOptions: ITaskSelectorOptions): NonPhasedProjectTaskSelector {
    const selection: ReadonlySet<RushConfigurationProject> = this._ignoreDependencyOrder
      ? baseTaskSelectorOptions.selection
      : // If the command ignores dependency order, that means that only the changed projects should be affected
        // That said, running watch for commands that ignore dependency order may have unexpected results
        Selection.intersection(
          Selection.expandAllConsumers(baseTaskSelectorOptions.selection),
          projectsToWatch
        );

    return new NonPhasedProjectTaskSelector({
      ...baseTaskSelectorOptions,
      selection,
      logFilenameIdentifier: this._logFilenameIdentifier,
      commandToRun: this._commandToRun,
      ignoreMissingScript: this._ignoreMissingScript,
      ignoreDependencyOrder: this._ignoreDependencyOrder,
      allowWarningsInSuccessfulBuild: this._allowWarningsInSuccessfulBuild
    });
  }
}
