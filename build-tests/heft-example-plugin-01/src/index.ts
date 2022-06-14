import { SyncHook } from 'tapable';
import type {
  IHeftTaskPlugin,
  IHeftTaskSession,
  HeftConfiguration,
  IHeftTaskRunHookOptions
} from '@rushstack/heft';

export const enum PluginNames {
  ExamplePlugin01 = 'examplePlugin01'
}

export interface IExamplePlugin01Accessor {
  exampleHook: SyncHook;
}

export default class ExamplePlugin01 implements IHeftTaskPlugin {
  private _accessor: IExamplePlugin01Accessor;

  public pluginName: string = PluginNames.ExamplePlugin01;

  public get accessor(): IExamplePlugin01Accessor {
    return this._accessor;
  }

  public apply(taskSession: IHeftTaskSession, heftConfiguration: HeftConfiguration): void {
    this._accessor = {
      exampleHook: new SyncHook()
    };

    taskSession.hooks.run.tapPromise(PluginNames.ExamplePlugin01, async (build: IHeftTaskRunHookOptions) => {
      this.accessor.exampleHook.call();
    });
  }
}
