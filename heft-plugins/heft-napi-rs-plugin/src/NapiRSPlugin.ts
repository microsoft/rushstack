import {
  HeftConfiguration,
  HeftSession,
  IBuildStageContext,
  IHeftPlugin,
  IPreCompileSubstage,
  ScopedLogger
} from '@rushstack/heft';

import { executeCommandAndCaptureOutput } from './childProcessUtils';

const PLUGIN_NAME: string = 'NapiRSPlugin';

export class NapiRSPlugin implements IHeftPlugin {
  public readonly pluginName: string = PLUGIN_NAME;

  public apply(heftSession: HeftSession, heftConfiguration: HeftConfiguration): void {
    heftSession.hooks.build.tap(PLUGIN_NAME, (build: IBuildStageContext) => {
      build.hooks.preCompile.tap(PLUGIN_NAME, (preCompile: IPreCompileSubstage) => {
        preCompile.hooks.run.tapPromise(PLUGIN_NAME, async () => {
          await this._napiBuildAsync(heftSession, heftConfiguration);
        });
      });
    });
  }

  private async _napiBuildAsync(
    heftSession: HeftSession,
    heftConfiguration: HeftConfiguration
  ): Promise<void> {
    const logger: ScopedLogger = heftSession.requestScopedLogger('napi-build');

    // Today `@napi-rs/cli` is the only avenue for running `napi build`.
    // `napi-build` is how we tell a rust project to generate the following
    // 1. index.js (also known as napi_bindgen). This is the glue code that requires the binary module
    //    so that users don't have to directly require the binary themselves
    // 2. index.d.ts (because napi-rs knows the types of the pubically exported objects from rust, we can
    //    generate typings for the binary module so that they are type safe and usable in typescript projects
    // 3. package-name.tripletype.node (this is the binary itself). Locally in development it will only generate
    //    one binary since we are just building for our local platform. We will need to depend on our CI pipelines
    //    to generate all of the supported binaries we are hoping to target.
    // There is only a cli for running `napi build` so we will use child_process to exec it

    // emulate `napi build --platform --release`
    let buildArgs = ['build', '--platform', '--release', './lib'];

    const napiBuildResults = executeCommandAndCaptureOutput(
      'napi',
      buildArgs,
      heftConfiguration.buildFolder,
      process.env
    );

    logger.terminal.writeLine('\n' + napiBuildResults.output.join(''));
  }
}
