import { SyncHook } from 'tapable';
import {
  IHeftPlugin,
  HeftSession,
  HeftConfiguration,
  IBuildStageContext,
  IPreCompileSubstage
} from '@rushstack/heft';

const PLUGIN_NAME: string = 'example-plugin-01';

export interface IExamplePlugin01Hooks {
  exampleHook: SyncHook;
}

export class ExamplePlugin01 implements IHeftPlugin {
  public displayName: string = PLUGIN_NAME;

  public hooks: IExamplePlugin01Hooks;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    this.hooks = {
      exampleHook: new SyncHook()
    };

    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tap(PLUGIN_NAME, () => {
          this.hooks.exampleHook.call();
        });
      });
    });
  }
}

export default new ExamplePlugin01();
