// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import {
  CommandLineFlagParameter,
  CommandLineStringParameter,
  ICommandLineActionOptions,
  CommandLineIntegerParameter
} from '@rushstack/ts-command-line';
import * as webpack from 'webpack';
import { SyncHook, AsyncParallelHook, AsyncSeriesHook } from 'tapable';
import { performance } from 'perf_hooks';

import { HeftActionBase, IHeftActionBaseOptions, ActionHooksBase, IActionContext } from './HeftActionBase';
import { CleanAction } from './CleanAction';

export interface IBuildActionOptions extends IHeftActionBaseOptions {
  cleanAction: CleanAction;
}

/**
 * @public
 */
export class BuildStageHooksBase {
  public readonly run: AsyncParallelHook = new AsyncParallelHook();
}

/**
 * @public
 */
export interface IBuildStage<
  TBuildStageHooks extends BuildStageHooksBase,
  TBuildStageProperties extends object
> {
  hooks: TBuildStageHooks;
  properties: TBuildStageProperties;
}

/**
 * @public
 */
export interface ISharedCopyStaticAssetsConfiguration {
  /**
   * File extensions that should be copied from the src folder to the destination folder(s)
   */
  fileExtensions?: string[];

  /**
   * Globs that should be explicitly excluded. This takes precedence over globs listed in "includeGlobs" and
   * files that match the file extensions provided in "fileExtensions".
   */
  excludeGlobs?: string[];

  /**
   * Globs that should be explicitly included.
   */
  includeGlobs?: string[];
}

/**
 * @public
 */
export interface ICopyStaticAssetsConfiguration extends ISharedCopyStaticAssetsConfiguration {
  /**
   * The folder from which assets should be copied. For example, "src". This defaults to "src".
   *
   * This folder is directly under the folder containing the project's package.json file
   */
  sourceFolderName: string;

  /**
   * The folder(s) to which assets should be copied. For example ["lib", "lib-cjs"]. This defaults to ["lib"]
   *
   * These folders are directly under the folder containing the project's package.json file
   */
  destinationFolderNames: string[];
}

/**
 * @public
 */
export interface IEmitModuleKindBase<TModuleKind> {
  moduleKind: TModuleKind;
  outFolderPath: string;
}

/**
 * @public
 */
export type IEmitModuleKind = IEmitModuleKindBase<
  'commonjs' | 'amd' | 'umd' | 'system' | 'es2015' | 'esnext'
>;

/**
 * @public
 */
export type CopyFromCacheMode = 'hardlink' | 'copy';

/**
 * @public
 */
export interface ISharedTypeScriptConfiguration {
  /**
   * Can be set to 'copy' or 'hardlink'. If set to 'copy', copy files from cache. If set to 'hardlink', files will be
   * hardlinked to the cache location. This option is useful when producing a tarball of build output as TAR files
   * don't handle these hardlinks correctly. 'hardlink' is the default behavior.
   */
  copyFromCacheMode?: CopyFromCacheMode | undefined;

  /**
   * If provided, emit these module kinds in addition to the modules specified in the tsconfig.
   * Note that this option only applies to the main tsconfig.json configuration.
   */
  additionalModuleKindsToEmit?: IEmitModuleKind[] | undefined;

  /**
   * Set this to change the maximum write parallelism. The default is 50.
   */
  maxWriteParallelism: number;
}

/**
 * @public
 */
export interface ITypeScriptConfiguration extends ISharedTypeScriptConfiguration {
  tsconfigPaths: string[];
  isLintingEnabled: boolean | undefined;
}

/**
 * @public
 */
export class CompileStageHooks extends BuildStageHooksBase {
  public readonly configureTypeScript: AsyncSeriesHook = new AsyncSeriesHook();
  public readonly configureCopyStaticAssets: AsyncSeriesHook = new AsyncSeriesHook();

  public readonly afterConfigureTypeScript: AsyncSeriesHook = new AsyncSeriesHook();
  public readonly afterConfigureCopyStaticAssets: AsyncSeriesHook = new AsyncSeriesHook();
}

/**
 * @public
 */
export class BundleStageHooks extends BuildStageHooksBase {
  public readonly configureWebpack: AsyncSeriesHook = new AsyncSeriesHook();
  public readonly afterConfigureWebpack: AsyncSeriesHook = new AsyncSeriesHook();
}

/**
 * @public
 */
export interface ICompileStageProperties {
  typeScriptConfiguration: ITypeScriptConfiguration;
  copyStaticAssetsConfiguration: ICopyStaticAssetsConfiguration;
}

/**
 * @public
 */
export interface IBundleStageProperties {
  /**
   * A path to a Webpack configuration JS file. If this isn't specified, and a Webpack
   * configuration isn't specified via another plugin, Webpack won't be run.
   */
  webpackConfigFilePath?: string;
  webpackConfiguration?: webpack.Configuration;
}

/**
 * @public
 */
export interface IPreCompileStage extends IBuildStage<BuildStageHooksBase, {}> {}

/**
 * @public
 */
export interface ICompileStage extends IBuildStage<CompileStageHooks, ICompileStageProperties> {}

/**
 * @public
 */
export interface IBundleStage extends IBuildStage<BundleStageHooks, IBundleStageProperties> {}

/**
 * @public
 */
export interface IPostBuildStage extends IBuildStage<BuildStageHooksBase, {}> {}

/**
 * @public
 */
export class BuildHooks extends ActionHooksBase<IBuildActionProperties> {
  public readonly preCompile: SyncHook<IPreCompileStage> = new SyncHook<IPreCompileStage>([
    'preCompileStage'
  ]);

  public readonly compile: SyncHook<ICompileStage> = new SyncHook<ICompileStage>(['compileStage']);

  public readonly bundle: SyncHook<IBundleStage> = new SyncHook<IBundleStage>(['bundleStage']);

  public readonly postBuild: SyncHook<IPostBuildStage> = new SyncHook<IPostBuildStage>(['postBuildStage']);
}

/**
 * @public
 */
export interface IBuildActionProperties {
  productionFlag: boolean;
  liteFlag: boolean;
  locale?: string;
  cleanFlag: boolean;
  noTest: boolean;
  maxOldSpaceSize?: string;
  verboseFlag: boolean;
  watchMode: boolean;
  webpackStats?: webpack.Stats;
}

/**
 * @public
 */
export interface IBuildActionContext extends IActionContext<BuildHooks, IBuildActionProperties> {}

export class BuildAction extends HeftActionBase<BuildHooks, IBuildActionProperties> {
  protected _noTestFlag: CommandLineFlagParameter;
  protected _watchFlag: CommandLineFlagParameter;
  private _productionFlag: CommandLineFlagParameter;
  private _localeParameter: CommandLineStringParameter;
  private _liteFlag: CommandLineFlagParameter;
  private _cleanFlag: CommandLineFlagParameter;
  private _maxOldSpaceSizeParameter: CommandLineStringParameter;
  private _typescriptMaxWriteParallelismParamter: CommandLineIntegerParameter;

  private _cleanAction: CleanAction;

  public constructor(
    heftActionOptions: IBuildActionOptions,
    commandLineOptions: ICommandLineActionOptions = {
      actionName: 'build',
      summary: 'Build the project.',
      documentation: ''
    }
  ) {
    super(commandLineOptions, heftActionOptions, BuildHooks);

    this._cleanAction = heftActionOptions.cleanAction;
  }

  public onDefineParameters(): void {
    super.onDefineParameters();

    this._productionFlag = this.defineFlagParameter({
      parameterLongName: '--production',
      description: 'If specified, build ship/production output'
    });

    this._localeParameter = this.defineStringParameter({
      parameterLongName: '--locale',
      argumentName: 'LOCALE',
      description: 'Only build the specified locale, if applicable.'
    });

    this._liteFlag = this.defineFlagParameter({
      parameterLongName: '--lite',
      parameterShortName: '-l',
      description: 'Perform a minimal build, skipping optional steps like linting.'
    });

    this._cleanFlag = this.defineFlagParameter({
      parameterLongName: '--clean',
      description: 'If specified, clean the package before rebuilding.'
    });

    this._noTestFlag = this.defineFlagParameter({
      parameterLongName: '--notest',
      description: 'If specified, run the build without testing.'
    });

    this._maxOldSpaceSizeParameter = this.defineStringParameter({
      parameterLongName: '--max-old-space-size',
      argumentName: 'SIZE',
      description: 'Used to specify the max old space size.'
    });

    this._watchFlag = this.defineFlagParameter({
      parameterLongName: '--watch',
      description: 'If provided, run tests in watch mode.'
    });

    this._typescriptMaxWriteParallelismParamter = this.defineIntegerParameter({
      parameterLongName: '--typescript-max-write-parallelism',
      argumentName: 'PARALLEILSM',
      description:
        'Set this to change the maximum write parallelism. This parameter overrides ' +
        'what is set in typescript.json. The default is 50.'
    });
  }

  protected async actionExecute(actionContext: IBuildActionContext): Promise<void> {
    if (this._cleanFlag.value) {
      await this._runWithLogging('Clean', async () => await this._cleanAction.executeInner());
    }

    const preCompileStage: IPreCompileStage = {
      hooks: new BuildStageHooksBase(),
      properties: {}
    };
    actionContext.hooks.preCompile.call(preCompileStage);

    const compileStage: ICompileStage = {
      hooks: new CompileStageHooks(),
      properties: {
        typeScriptConfiguration: {
          tsconfigPaths: [],
          isLintingEnabled: !actionContext.properties.liteFlag,
          copyFromCacheMode: undefined,
          additionalModuleKindsToEmit: undefined,
          maxWriteParallelism: 50
        },
        copyStaticAssetsConfiguration: {
          fileExtensions: [],
          excludeGlobs: [],
          includeGlobs: [],

          // For now - these may need to be revised later
          sourceFolderName: 'src',
          destinationFolderNames: ['lib']
        }
      }
    };
    actionContext.hooks.compile.call(compileStage);

    const bundleStage: IBundleStage = {
      hooks: new BundleStageHooks(),
      properties: {}
    };
    actionContext.hooks.bundle.call(bundleStage);

    const postBuildStage: IPostBuildStage = {
      hooks: new BuildStageHooksBase(),
      properties: {}
    };
    actionContext.hooks.postBuild.call(postBuildStage);

    if (actionContext.properties.watchMode) {
      // In --watch mode, run all configuration upfront and then kick off all stages
      // concurrently with the expectation that the their promises will never resolve
      // and that they will handle watching filesystem changes

      await Promise.all([
        compileStage.hooks.configureTypeScript.promise(),
        compileStage.hooks.configureCopyStaticAssets.promise(),
        bundleStage.hooks.configureWebpack.promise()
      ]);
      await Promise.all([
        compileStage.hooks.afterConfigureTypeScript.promise(),
        compileStage.hooks.afterConfigureCopyStaticAssets.promise(),
        bundleStage.hooks.afterConfigureWebpack.promise()
      ]);

      await Promise.all([
        this._runStageWithLogging('Pre-compile', preCompileStage),
        this._runStageWithLogging('Compile', compileStage),
        this._runStageWithLogging('Bundle', bundleStage),
        this._runStageWithLogging('Post-build', postBuildStage)
      ]);
    } else {
      await this._runStageWithLogging('Pre-compile', preCompileStage);

      await Promise.all([
        compileStage.hooks.configureTypeScript.promise(),
        compileStage.hooks.configureCopyStaticAssets.promise()
      ]);
      await Promise.all([
        compileStage.hooks.afterConfigureTypeScript.promise(),
        compileStage.hooks.afterConfigureCopyStaticAssets.promise()
      ]);
      if (this._typescriptMaxWriteParallelismParamter.value) {
        compileStage.properties.typeScriptConfiguration.maxWriteParallelism = this._typescriptMaxWriteParallelismParamter.value;
      }
      await this._runStageWithLogging('Compile', compileStage);

      await bundleStage.hooks.configureWebpack.promise();
      await bundleStage.hooks.afterConfigureWebpack.promise();
      await this._runStageWithLogging('Bundle', bundleStage);

      await this._runStageWithLogging('Post-build', postBuildStage);
    }
  }

  protected getDefaultActionProperties(): IBuildActionProperties {
    return {
      productionFlag: this._productionFlag.value,
      liteFlag: this._liteFlag.value,
      locale: this._localeParameter.value,
      cleanFlag: this._cleanFlag.value,
      noTest: this._noTestFlag.value,
      maxOldSpaceSize: this._maxOldSpaceSizeParameter.value,
      verboseFlag: this.verboseFlag.value,
      watchMode: this._watchFlag.value
    };
  }

  protected async _runStageWithLogging(
    buildStageName: string,
    buildStage: IBuildStage<BuildStageHooksBase, object>
  ): Promise<void> {
    if (buildStage.hooks.run.isUsed()) {
      await this._runWithLogging(buildStageName, async () => await buildStage.hooks.run.promise());
    }
  }

  private async _runWithLogging(buildStageName: string, fn: () => Promise<void>): Promise<void> {
    this.terminal.writeLine(` ---- ${buildStageName} started ---- `);
    const startTime: number = performance.now();
    let finishedLoggingWord: string = 'finished';
    try {
      await fn();
    } catch (e) {
      finishedLoggingWord = 'encountered an error';
      throw e;
    } finally {
      const executionTime: number = Math.round(performance.now() - startTime);
      this.terminal.writeLine(` ---- ${buildStageName} ${finishedLoggingWord} (${executionTime}ms) ---- `);
    }
  }
}
