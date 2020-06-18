// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesBailHook } from 'tapable';

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionDataBase } from './HeftActionBase';
import { Async } from '../../utilities/Async';

/**
 * @public
 */
export class CleanHooks extends ActionHooksBase {
  public readonly deletePath: AsyncSeriesBailHook<string> = new AsyncSeriesBailHook<string>(['pathToDelete']);
}

/**
 * @public
 */
export interface ICleanActionData extends IActionDataBase<CleanHooks> {
  pathsToDelete: string[];
}

export class CleanAction extends HeftActionBase<ICleanActionData, CleanHooks> {
  public constructor(options: IHeftActionBaseOptions) {
    super(
      {
        actionName: 'clean',
        summary: 'Clean the project',
        documentation: ''
      },
      options,
      CleanHooks
    );
  }

  protected async actionExecute(actionData: ICleanActionData): Promise<void> {
    await Async.forEachLimitAsync(actionData.pathsToDelete, 100, (pathToDelete) =>
      actionData.hooks.deletePath.promise(pathToDelete)
    );

    this.terminal.writeLine(`Deleted ${actionData.pathsToDelete.length} paths`);
  }

  protected getDefaultActionData(): Omit<ICleanActionData, 'hooks'> {
    return {
      pathsToDelete: []
    };
  }
}
