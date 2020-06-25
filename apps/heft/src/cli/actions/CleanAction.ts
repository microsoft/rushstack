// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { AsyncSeriesBailHook } from 'tapable';

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionContext } from './HeftActionBase';
import { Async } from '../../utilities/Async';

/**
 * @public
 */
export class CleanHooks extends ActionHooksBase<ICleanActionProperties> {
  public readonly deletePath: AsyncSeriesBailHook<string> = new AsyncSeriesBailHook<string>(['pathToDelete']);
}

/**
 * @public
 */
export interface ICleanActionProperties {
  pathsToDelete: string[];
}

/**
 * @public
 */
export interface ICleanActionContext extends IActionContext<CleanHooks, ICleanActionProperties> {}

export class CleanAction extends HeftActionBase<ICleanActionProperties, CleanHooks> {
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

  protected async actionExecute(actionContext: ICleanActionContext): Promise<void> {
    await Async.forEachLimitAsync(actionContext.properties.pathsToDelete, 100, (pathToDelete) =>
      actionContext.hooks.deletePath.promise(pathToDelete)
    );

    this.terminal.writeLine(`Deleted ${actionContext.properties.pathsToDelete.length} paths`);
  }

  protected getDefaultActionProperties(): ICleanActionProperties {
    return {
      pathsToDelete: []
    };
  }
}
