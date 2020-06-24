// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionDataBase } from './HeftActionBase';

/**
 * @public
 */
export interface IDevDeployActionData extends IActionDataBase<DevDeployHooks> {}

/**
 * @public
 */
export class DevDeployHooks extends ActionHooksBase {}

export class DevDeployAction extends HeftActionBase<IDevDeployActionData, DevDeployHooks> {
  public constructor(options: IHeftActionBaseOptions) {
    super(
      {
        actionName: 'dev-deploy',
        summary: 'Deploy the current project, and optionally the whole repo, to a testing CDN.',
        documentation: ''
      },
      options,
      DevDeployHooks
    );
  }

  protected async actionExecute(actionData: IDevDeployActionData): Promise<void> {
    throw new Error('Not implemented yet...');
  }

  protected getDefaultActionData(): Omit<IDevDeployActionData, 'hooks'> {
    return {};
  }
}
