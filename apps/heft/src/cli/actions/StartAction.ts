// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionDataBase } from './HeftActionBase';

/**
 * @public
 */
export class StartHooks extends ActionHooksBase {}

/**
 * @public
 */
export interface IStartActionData extends IActionDataBase<StartHooks> {}

export class StartAction extends HeftActionBase<IStartActionData, StartHooks> {
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

  protected getDefaultActionData(): Omit<IStartActionData, 'hooks'> {
    return {};
  }
}
