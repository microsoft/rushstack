// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import { SyncHook, AsyncParallelHook, AsyncSeriesHook, AsyncSeriesWaterfallHook } from 'tapable';
import * as webpack from 'webpack';

import { StageBase, StageHooksBase, IStageContext } from './StageBase';
import { Logging } from '../utilities/Logging';
import { HeftConfiguration } from '../configuration/HeftConfiguration';
import {
  CommandLineAction,
  CommandLineFlagParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter
} from '@rushstack/ts-command-line';
import { LoggingManager } from '../pluginFramework/logging/LoggingManager';

/**
 * @public
 */
export class BuildSubstageHooksBase {
  public readonly run: AsyncParallelHook = new AsyncParallelHook();
}

/**
 * @public
 */
export interface IBuildSubstage<
  TBuildSubstageHooks extends BuildSubstageHooksBase,
  TBuildSubstageProperties extends object
> {
  hooks: TBuildSubstageHooks;
  properties: TBuildSubstageProperties;
}

/**
 * @public
 */
export type CopyFromCacheMode = 'hardlink' | 'copy';

/**
 * @public
 */
export class CompileSubstageHooks extends BuildSubstageHooksBase {
  /**
   * @internal
   */
  public readonly afterTypescriptFirstEmit: AsyncParallelHook = new AsyncParallelHook();
}

/**
 * @public
 */
export type IWebpackConfiguration = webpack.Configuration | webpack.Configuration[] | undefined;

/**
 * @public
 */
export class BundleSubstageHooks extends BuildSubstageHooksBase {
  public readonly configureWebpack: AsyncSeriesWaterfallHook<
    IWebpackConfiguration
  > = new AsyncSeriesWaterfallHook<IWebpackConfiguration>(['webpackConfiguration']);
  public readonly afterConfigureWebpack: AsyncSeriesHook = new AsyncSeriesHook();
}

/**
 * @public
 */
export interface ICompileSubstageProperties {
  typescriptMaxWriteParallelism: number | undefined;
}

/**
 * @public
 */
export interface IBundleSubstageProperties {
  /**
   * The configuration used by the Webpack plugin. This must be populated
   * for Webpack to run. If webpackConfigFilePath is specified,
   * this will be populated automatically with the exports of the
   * config file referenced in that property.
   */
  webpackConfiguration?: webpack.Configuration | webpack.Configuration[];
}

/**
 * @public
 */
export interface IPreCompileSubstage extends IBuildSubstage<BuildSubstageHooksBase, {}> {}

/**
 * @public
 */
export interface ICompileSubstage extends IBuildSubstage<CompileSubstageHooks, ICompileSubstageProperties> {}

/**
 * @public
 */
export interface IBundleSubstage extends IBuildSubstage<BundleSubstageHooks, IBundleSubstageProperties> {}

/**
 * @public
 */
export interface IPostBuildSubstage extends IBuildSubstage<BuildSubstageHooksBase, {}> {}

/**
 * @public
 */
export class BuildStageHooks extends StageHooksBase<IBuildStageProperties> {
  public readonly preCompile: SyncHook<IPreCompileSubstage> = new SyncHook<IPreCompileSubstage>([
    'preCompileStage'
  ]);

  public readonly compile: SyncHook<ICompileSubstage> = new SyncHook<ICompileSubstage>(['compileStage']);

  public readonly bundle: SyncHook<IBundleSubstage> = new SyncHook<IBundleSubstage>(['bundleStage']);

  public readonly postBuild: SyncHook<IPostBuildSubstage> = new SyncHook<IPostBuildSubstage>([
    'postBuildStage'
  ]);
}

/**
 * @public
 */
export interface IBuildStageProperties {
  production: boolean;
  lite: boolean;
  locale?: string;
  maxOldSpaceSize?: string;
  watchMode: boolean;
  serveMode: boolean;
  webpackStats?: webpack.Stats;
}

/**
 * @public
 */
export interface IBuildStageContext extends IStageContext<BuildStageHooks, IBuildStageProperties> {}

export interface IBuildStageOptions {
  production: boolean;
  lite: boolean;
  locale?: string;
  maxOldSpaceSize?: string;
  watchMode: boolean;
  serveMode: boolean;
  typescriptMaxWriteParallelism?: number;
}

export interface IBuildStageStandardParameters {
  productionFlag: CommandLineFlagParameter;
  localeParameter: CommandLineStringParameter;
  liteFlag: CommandLineFlagParameter;
  typescriptMaxWriteParallelismParameter: CommandLineIntegerParameter;
  maxOldSpaceSizeParameter: CommandLineStringParameter;
}

export class BuildStage extends StageBase<BuildStageHooks, IBuildStageProperties, IBuildStageOptions> {
  public constructor(heftConfiguration: HeftConfiguration, loggingManager: LoggingManager) {
    super(heftConfiguration, loggingManager, BuildStageHooks);
  }

  public static defineStageStandardParameters(action: CommandLineAction): IBuildStageStandardParameters {
    return {
      productionFlag: action.defineFlagParameter({
        parameterLongName: '--production',
        description: 'If specified, build ship/production output'
      }),

      localeParameter: action.defineStringParameter({
        parameterLongName: '--locale',
        argumentName: 'LOCALE',
        description: 'Only build the specified locale, if applicable.'
      }),

      liteFlag: action.defineFlagParameter({
        parameterLongName: '--lite',
        parameterShortName: '-l',
        description: 'Perform a minimal build, skipping optional steps like linting.'
      }),

      typescriptMaxWriteParallelismParameter: action.defineIntegerParameter({
        parameterLongName: '--typescript-max-write-parallelism',
        argumentName: 'PARALLEILSM',
        description:
          'Set this to change the maximum write parallelism. This parameter overrides ' +
          'what is set in typescript.json. The default is 50.'
      }),

      maxOldSpaceSizeParameter: action.defineStringParameter({
        parameterLongName: '--max-old-space-size',
        argumentName: 'SIZE',
        description: 'Used to specify the max old space size.'
      })
    };
  }

  public static getOptionsFromStandardParameters(
    standardParameters: IBuildStageStandardParameters
  ): Omit<IBuildStageOptions, 'watchMode' | 'serveMode'> {
    return {
      production: standardParameters.productionFlag.value,
      lite: standardParameters.liteFlag.value,
      locale: standardParameters.localeParameter.value,
      maxOldSpaceSize: standardParameters.maxOldSpaceSizeParameter.value,
      typescriptMaxWriteParallelism: standardParameters.typescriptMaxWriteParallelismParameter.value
    };
  }

  protected async getDefaultStagePropertiesAsync(
    options: IBuildStageOptions
  ): Promise<IBuildStageProperties> {
    return {
      production: options.production,
      lite: options.lite,
      locale: options.locale,
      maxOldSpaceSize: options.maxOldSpaceSize,
      watchMode: options.watchMode,
      serveMode: options.serveMode
    };
  }

  protected async executeInnerAsync(): Promise<void> {
    const preCompileSubstage: IPreCompileSubstage = {
      hooks: new BuildSubstageHooksBase(),
      properties: {}
    };
    this.stageHooks.preCompile.call(preCompileSubstage);

    const compileStage: ICompileSubstage = {
      hooks: new CompileSubstageHooks(),
      properties: {
        typescriptMaxWriteParallelism: this.stageOptions.typescriptMaxWriteParallelism
      }
    };
    this.stageHooks.compile.call(compileStage);

    const bundleStage: IBundleSubstage = {
      hooks: new BundleSubstageHooks(),
      properties: {}
    };
    this.stageHooks.bundle.call(bundleStage);

    const postBuildStage: IPostBuildSubstage = {
      hooks: new BuildSubstageHooksBase(),
      properties: {}
    };
    this.stageHooks.postBuild.call(postBuildStage);

    if (this.stageProperties.watchMode) {
      // In --watch mode, run all configuration upfront and then kick off all stages
      // concurrently with the expectation that the their promises will never resolve
      // and that they will handle watching filesystem changes

      await bundleStage.hooks.configureWebpack
        .promise(undefined)
        .then((webpackConfiguration) => (bundleStage.properties.webpackConfiguration = webpackConfiguration));
      await bundleStage.hooks.afterConfigureWebpack.promise();

      compileStage.hooks.afterTypescriptFirstEmit.tapPromise(
        'build-stage',
        async () =>
          await Promise.all([
            this._runSubstageWithLoggingAsync('Bundle', bundleStage),
            this._runSubstageWithLoggingAsync('Post-build', postBuildStage)
          ])
      );

      await Promise.all([
        this._runSubstageWithLoggingAsync('Pre-compile', preCompileSubstage),
        this._runSubstageWithLoggingAsync('Compile', compileStage)
      ]);
    } else {
      await this._runSubstageWithLoggingAsync('Pre-compile', preCompileSubstage);

      if (this.loggingManager.errorsHaveBeenEmitted) {
        return;
      }

      await this._runSubstageWithLoggingAsync('Compile', compileStage);

      if (this.loggingManager.errorsHaveBeenEmitted) {
        return;
      }

      await bundleStage.hooks.configureWebpack
        .promise(undefined)
        .then((webpackConfiguration) => (bundleStage.properties.webpackConfiguration = webpackConfiguration));
      await bundleStage.hooks.afterConfigureWebpack.promise();
      await this._runSubstageWithLoggingAsync('Bundle', bundleStage);

      if (this.loggingManager.errorsHaveBeenEmitted) {
        return;
      }

      await this._runSubstageWithLoggingAsync('Post-build', postBuildStage);
    }
  }

  private async _runSubstageWithLoggingAsync(
    buildStageName: string,
    buildStage: IBuildSubstage<BuildSubstageHooksBase, object>
  ): Promise<void> {
    if (buildStage.hooks.run.isUsed()) {
      await Logging.runFunctionWithLoggingBoundsAsync(
        this.globalTerminal,
        buildStageName,
        async () => await buildStage.hooks.run.promise()
      );
    }
  }
}
