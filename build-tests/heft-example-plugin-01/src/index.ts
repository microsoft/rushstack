// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook } from 'tapable';

import type {
  IHeftTaskPlugin,
  IHeftTaskSession,
  HeftConfiguration,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';

export interface IExamplePlugin01Accessor {
  exampleHook: SyncHook;
}

export const PLUGIN_NAME: 'example-plugin-01' = 'example-plugin-01';

export default class ExamplePlugin01 implements IHeftTaskPlugin {
  private _accessor: IExamplePlugin01Accessor = {
    exampleHook: new SyncHook()
  };

  public get accessor(): IExamplePlugin01Accessor {
    return this._accessor;
  }

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    taskSession.hooks.run.tapPromise(PLUGIN_NAME, async (build: IHeftTaskRunHookOptions) => {
      this.accessor.exampleHook.call();
    });
  }
}
