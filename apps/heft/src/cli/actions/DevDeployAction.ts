// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionContext } from './HeftActionBase';

/**
 * @public
 */
export interface IDevDeployActionProperties {}

/**
 * @public
 */
export class DevDeployHooks extends ActionHooksBase<IDevDeployActionProperties> {}

/**
 * @public
 */
export interface IDevDeployActionContext extends IActionContext<DevDeployHooks, IDevDeployActionProperties> {}

export class DevDeployAction extends HeftActionBase<DevDeployHooks, IDevDeployActionProperties> {
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

  protected async actionExecute(actionContext: IDevDeployActionContext): Promise<void> {
    throw new Error('Not implemented yet...');
  }

  protected getDefaultActionProperties(): IDevDeployActionProperties {
    return {};
  }
}
