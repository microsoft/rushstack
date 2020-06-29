// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionContext } from './HeftActionBase';

/**
 * @public
 */
export class StartHooks extends ActionHooksBase<IStartActionProperties> {}

/**
 * @public
 */
export interface IStartActionProperties {}

/**
 * @public
 */
export interface IStartActionContext extends IActionContext<StartHooks, IStartActionProperties> {}

export class StartAction extends HeftActionBase<StartHooks, IStartActionProperties> {
  public constructor(options: IHeftActionBaseOptions) {
    super(
      {
        actionName: 'start',
        summary: 'Run the local server for the current project',
        documentation: ''
      },
      options,
      StartHooks
    );
  }

  protected getDefaultActionProperties(): IStartActionProperties {
    return {};
  }
}
