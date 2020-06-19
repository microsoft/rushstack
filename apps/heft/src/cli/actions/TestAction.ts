// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import { BuildAction, IBuildActionData, IBuildActionOptions } from './BuildAction';
import { IActionDataBase, ActionHooksBase } from './HeftActionBase';

/**
 * @public
 */
export class TestHooks extends ActionHooksBase {}

/**
 * @public
 */
export interface ITestActionData extends IActionDataBase<TestHooks> {}

export interface ITestActionOptions extends IBuildActionOptions {}

export class TestAction extends BuildAction {
  public testActionHook: SyncHook<ITestActionData> = new SyncHook<ITestActionData>(['action']);
  public constructor(options: ITestActionOptions) {
    super(options, {
      actionName: 'test',
      summary: 'Build the project and run tests.',
      documentation: ''
    });
  }

  protected async actionExecute(buildActionData: IBuildActionData): Promise<void> {
    throw new Error('Not implemented yet...');
  }
}
