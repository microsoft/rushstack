// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { BuildAction, IBuildActionOptions, IBuildActionContext } from './BuildAction';
import { ActionHooksBase, IActionContext } from './HeftActionBase';

/**
 * @public
 */
export class TestHooks extends ActionHooksBase<ITestActionProperties> {}

/**
 * @public
 */
export interface ITestActionProperties {}

/**
 * @public
 */
export interface ITestActionContext extends IActionContext<TestHooks, ITestActionProperties> {}

export interface ITestActionOptions extends IBuildActionOptions {}

export class TestAction extends BuildAction {
  public testActionHook: SyncHook<ITestActionContext> = new SyncHook<ITestActionContext>(['action']);

  public constructor(options: ITestActionOptions) {
    super(options, {
      actionName: 'test',
      summary: 'Build the project and run tests.',
      documentation: ''
    });
  }

  protected async actionExecute(buildActionContext: IBuildActionContext): Promise<void> {
    throw new Error('Not implemented yet...');
  }
}
